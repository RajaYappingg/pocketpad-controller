use rand::Rng;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Pairing code configuration.
/// 6 chars from a 32-symbol alphabet (no 0/O/1/I/L) = 32^6 (~1B combos).
pub const PAIRING_CODE_LEN: usize = 6;
const PAIRING_ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/// Global failures across all IPs before the code is rotated.
const GLOBAL_ROTATE_THRESHOLD: usize = 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerifyError {
    Invalid,
    RateLimited,
}

impl VerifyError {
    pub fn message(&self) -> &'static str {
        match self {
            VerifyError::Invalid => "Invalid pairing code",
            VerifyError::RateLimited => "Too many failed attempts. Please wait 30 seconds.",
        }
    }
}

impl std::fmt::Display for VerifyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.message())
    }
}

impl std::error::Error for VerifyError {}

fn generate_pairing_code() -> String {
    let mut rng = rand::thread_rng();
    (0..PAIRING_CODE_LEN)
        .map(|_| {
            let idx = rng.gen_range(0..PAIRING_ALPHABET.len());
            PAIRING_ALPHABET[idx] as char
        })
        .collect()
}

/// Constant-time equality to avoid leaking code prefix via timing.
/// Callers must normalize (trim + uppercase) before calling.
fn constant_time_eq(a: &str, b: &str) -> bool {
    let ab = a.as_bytes();
    let bb = b.as_bytes();
    if ab.len() != bb.len() {
        return false;
    }
    let mut diff = 0u8;
    for i in 0..ab.len() {
        diff |= ab[i] ^ bb[i];
    }
    diff == 0
}

fn normalize_candidate(candidate: &str) -> String {
    candidate.trim().to_ascii_uppercase()
}

#[derive(Debug, Clone)]
pub struct PairingManager {
    inner: Arc<Mutex<PairingState>>,
}

#[derive(Debug)]
struct PairingState {
    current_code: String,
    session_tokens: HashMap<String, SessionToken>,
    failed_attempts: HashMap<String, (usize, Instant)>, // ip -> (count, window_start)
    max_failed_attempts: usize,
    attempt_window: Duration,
    token_ttl: Duration,
    global_failed_attempts: usize,
}

#[derive(Debug)]
struct SessionToken {
    created_at: Instant,
    client_ip: String,
}

impl PairingManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(PairingState {
                current_code: generate_pairing_code(),
                session_tokens: HashMap::new(),
                failed_attempts: HashMap::new(),
                max_failed_attempts: 5,
                attempt_window: Duration::from_secs(30),
                token_ttl: Duration::from_secs(3600 * 8),
                global_failed_attempts: 0,
            })),
        }
    }

    /// Returns the current active pairing code
    pub fn get_pairing_code(&self) -> String {
        self.inner
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .current_code
            .clone()
    }

    /// Rotates the pairing code (e.g. after suspected brute force).
    /// Returns the new code. Existing session tokens stay valid.
    pub fn rotate_code(&self) -> String {
        let mut state = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        state.current_code = generate_pairing_code();
        state.global_failed_attempts = 0;
        state.failed_attempts.clear();
        state.current_code.clone()
    }

    /// Revokes a session token so it cannot claim a new slot.
    pub fn invalidate(&self, token: &str) {
        self.inner
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .session_tokens
            .remove(token);
    }

    /// Verifies a pairing code attempt from an IP address
    pub fn verify_code(&self, ip: &str, candidate: &str) -> Result<String, VerifyError> {
        let mut state = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let now = Instant::now();

        // Check rate limiting for this IP
        if let Some((count, window_start)) = state.failed_attempts.get(ip) {
            if now.duration_since(*window_start) < state.attempt_window {
                if *count >= state.max_failed_attempts {
                    return Err(VerifyError::RateLimited);
                }
            } else {
                state.failed_attempts.remove(ip);
            }
        }

        let normalized = normalize_candidate(candidate);
        if constant_time_eq(&normalized, &state.current_code) {
            // Success: clear failed attempts and generate session token
            state.failed_attempts.remove(ip);
            let token = format!(
                "{:016x}{:016x}",
                rand::random::<u64>(),
                rand::random::<u64>()
            );
            state.session_tokens.insert(
                token.clone(),
                SessionToken {
                    created_at: now,
                    client_ip: ip.to_string(),
                },
            );
            Ok(token)
        } else {
            // Record failure
            let entry = state
                .failed_attempts
                .entry(ip.to_string())
                .or_insert((0, now));
            entry.0 += 1;
            state.global_failed_attempts += 1;
            // Rotate the code if the whole LAN keeps guessing — burns the
            // attacker's collected knowledge without locking out legit users
            // for longer than one code cycle.
            if state.global_failed_attempts >= GLOBAL_ROTATE_THRESHOLD {
                state.current_code = generate_pairing_code();
                state.global_failed_attempts = 0;
                state.failed_attempts.clear();
            }
            // Distinguish rate-limit on this exact attempt if it hit the cap.
            if state
                .failed_attempts
                .get(ip)
                .map(|(c, _)| *c >= state.max_failed_attempts)
                .unwrap_or(false)
            {
                return Err(VerifyError::RateLimited);
            }
            Err(VerifyError::Invalid)
        }
    }

    /// Verifies an existing session token
    pub fn verify_token(&self, token: &str, ip: &str) -> bool {
        let is_loopback = |s: &str| s == "127.0.0.1" || s == "::1" || s == "::ffff:127.0.0.1";
        let state = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(session) = state.session_tokens.get(token) {
            let ip_matches =
                session.client_ip == ip || (is_loopback(&session.client_ip) && is_loopback(ip));
            ip_matches && Instant::now().duration_since(session.created_at) < state.token_ttl
        } else {
            false
        }
    }

    /// Cleans expired tokens and rate limit entries
    pub fn cleanup(&self) {
        let mut state = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let now = Instant::now();
        let token_ttl = state.token_ttl;
        let attempt_window = state.attempt_window;

        state
            .session_tokens
            .retain(|_, session| now.duration_since(session.created_at) < token_ttl);
        state
            .failed_attempts
            .retain(|_, (_, window_start)| now.duration_since(*window_start) < attempt_window);
    }
}

impl Default for PairingManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pairing_verification_and_rate_limiting() {
        let manager = PairingManager::new();
        let code = manager.get_pairing_code();
        assert_eq!(code.len(), PAIRING_CODE_LEN);
        let ip = "192.168.1.100";

        // Correct code succeeds and returns token (case/whitespace tolerant)
        let token = manager
            .verify_code(ip, &format!("  {}  ", code.to_lowercase()))
            .expect("Should succeed");
        assert!(manager.verify_token(&token, ip));

        // Wrong code fails with Invalid (not rate-limited yet)
        assert_eq!(
            manager.verify_code(ip, "000000").unwrap_err(),
            VerifyError::Invalid
        );

        // Fail to trigger rate limit
        for _ in 0..5 {
            let _ = manager.verify_code(ip, "wrong!");
        }

        let err = manager.verify_code(ip, &code).unwrap_err();
        assert_eq!(err, VerifyError::RateLimited);
    }

    #[test]
    fn test_invalidate_revokes_token() {
        let manager = PairingManager::new();
        let code = manager.get_pairing_code();
        let ip = "192.168.1.101";
        let token = manager.verify_code(ip, &code).unwrap();
        assert!(manager.verify_token(&token, ip));
        manager.invalidate(&token);
        assert!(!manager.verify_token(&token, ip));
    }

    #[test]
    fn test_global_rotation_burns_code() {
        let manager = PairingManager::new();
        let original = manager.get_pairing_code();
        // 20 failures across distinct IPs triggers rotation
        for i in 0..20 {
            let ip = format!("192.168.1.{i}");
            let _ = manager.verify_code(&ip, "ZZZZZZ");
        }
        assert_ne!(manager.get_pairing_code(), original);
    }

    #[test]
    fn test_constant_time_eq() {
        assert!(constant_time_eq("ABC123", "ABC123"));
        assert!(!constant_time_eq("ABC123", "ABC124"));
        assert!(!constant_time_eq("ABC12", "ABC123"));
    }
}
