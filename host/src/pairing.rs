#![allow(dead_code)]

use rand::Rng;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct PairingManager {
    inner: Arc<Mutex<PairingState>>,
}

#[derive(Debug)]
struct PairingState {
    current_code: String,
    session_tokens: HashMap<String, Instant>, // token -> created_at
    failed_attempts: HashMap<String, (usize, Instant)>, // ip -> (count, window_start)
    max_failed_attempts: usize,
    attempt_window: Duration,
    token_ttl: Duration,
}

impl PairingManager {
    pub fn new() -> Self {
        let code = format!("{:04}", rand::thread_rng().gen_range(1000..=9999));
        Self {
            inner: Arc::new(Mutex::new(PairingState {
                current_code: code,
                session_tokens: HashMap::new(),
                failed_attempts: HashMap::new(),
                max_failed_attempts: 5,
                attempt_window: Duration::from_secs(30),
                token_ttl: Duration::from_secs(3600 * 24),
            })),
        }
    }

    /// Returns the current active pairing code
    pub fn get_pairing_code(&self) -> String {
        self.inner.lock().unwrap().current_code.clone()
    }

    /// Verifies a pairing code attempt from an IP address
    pub fn verify_code(&self, ip: &str, candidate: &str) -> Result<String, &'static str> {
        let mut state = self.inner.lock().unwrap();
        let now = Instant::now();

        // Check rate limiting for this IP
        if let Some((count, window_start)) = state.failed_attempts.get(ip) {
            if now.duration_since(*window_start) < state.attempt_window {
                if *count >= state.max_failed_attempts {
                    return Err("Too many failed attempts. Please wait 30 seconds.");
                }
            } else {
                state.failed_attempts.remove(ip);
            }
        }

        if candidate.trim() == state.current_code {
            // Success: clear failed attempts and generate session token
            state.failed_attempts.remove(ip);
            let token = format!("{:016x}{:016x}", rand::random::<u64>(), rand::random::<u64>());
            state.session_tokens.insert(token.clone(), now);
            Ok(token)
        } else {
            // Record failure
            let entry = state
                .failed_attempts
                .entry(ip.to_string())
                .or_insert((0, now));
            entry.0 += 1;
            Err("Invalid pairing code")
        }
    }

    /// Verifies an existing session token
    pub fn verify_token(&self, token: &str) -> bool {
        let state = self.inner.lock().unwrap();
        if let Some(created) = state.session_tokens.get(token) {
            Instant::now().duration_since(*created) < state.token_ttl
        } else {
            false
        }
    }

    /// Cleans expired tokens and rate limit entries
    pub fn cleanup(&self) {
        let mut state = self.inner.lock().unwrap();
        let now = Instant::now();
        let token_ttl = state.token_ttl;
        let attempt_window = state.attempt_window;

        state
            .session_tokens
            .retain(|_, created| now.duration_since(*created) < token_ttl);
        state
            .failed_attempts
            .retain(|_, (_, window_start)| now.duration_since(*window_start) < attempt_window);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pairing_verification_and_rate_limiting() {
        let manager = PairingManager::new();
        let code = manager.get_pairing_code();
        let ip = "192.168.1.100";

        // Correct code succeeds and returns token
        let token = manager.verify_code(ip, &code).expect("Should succeed");
        assert!(manager.verify_token(&token));

        // Wrong code fails
        assert!(manager.verify_code(ip, "0000").is_err());

        // Fail 5 times to trigger rate limit
        for _ in 0..5 {
            let _ = manager.verify_code(ip, "wrong");
        }

        let err = manager.verify_code(ip, &code).unwrap_err();
        assert!(err.contains("Too many failed attempts"));
    }
}
