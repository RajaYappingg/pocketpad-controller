// PocketPad Performance and Diagnostics Metrics

use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[derive(Debug, Clone)]
pub struct Diagnostics {
    inner: Arc<DiagnosticsInner>,
}

#[derive(Debug)]
struct DiagnosticsInner {
    start_time: Instant,
    packets_received: AtomicU64,
    bytes_received: AtomicU64,
    malformed_packets: AtomicU64,
    stale_resets: AtomicU64,
    active_client_connected: AtomicBool,
    active_client_ip: Mutex<Option<String>>,
    current_rtt_ms: AtomicU32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsSnapshot {
    pub packets_received: u64,
    pub bytes_received: u64,
    pub malformed_packets: u64,
    pub stale_resets: u64,
    pub active_client_connected: bool,
    pub active_client_ip: Option<String>,
    pub current_rtt_ms: Option<u32>,
    pub uptime_secs: u64,
}

impl Diagnostics {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(DiagnosticsInner {
                start_time: Instant::now(),
                packets_received: AtomicU64::new(0),
                bytes_received: AtomicU64::new(0),
                malformed_packets: AtomicU64::new(0),
                stale_resets: AtomicU64::new(0),
                active_client_connected: AtomicBool::new(false),
                active_client_ip: Mutex::new(None),
                current_rtt_ms: AtomicU32::new(0),
            }),
        }
    }

    pub fn record_packet(&self, bytes: usize) {
        self.inner.packets_received.fetch_add(1, Ordering::Relaxed);
        self.inner.bytes_received.fetch_add(bytes as u64, Ordering::Relaxed);
    }

    pub fn record_malformed_packet(&self) {
        self.inner.malformed_packets.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_stale_reset(&self) {
        self.inner.stale_resets.fetch_add(1, Ordering::Relaxed);
    }

    pub fn set_client_connected(&self, ip: Option<String>) {
        if let Some(ref client_ip) = ip {
            self.inner.active_client_connected.store(true, Ordering::SeqCst);
            *self.inner.active_client_ip.lock().unwrap() = Some(client_ip.clone());
        } else {
            self.inner.active_client_connected.store(false, Ordering::SeqCst);
            *self.inner.active_client_ip.lock().unwrap() = None;
            self.inner.current_rtt_ms.store(0, Ordering::Relaxed);
        }
    }

    pub fn record_rtt(&self, rtt_ms: u32) {
        self.inner.current_rtt_ms.store(rtt_ms, Ordering::Relaxed);
    }

    pub fn snapshot(&self) -> DiagnosticsSnapshot {
        let rtt = self.inner.current_rtt_ms.load(Ordering::Relaxed);
        let active = self.inner.active_client_connected.load(Ordering::SeqCst);
        DiagnosticsSnapshot {
            packets_received: self.inner.packets_received.load(Ordering::Relaxed),
            bytes_received: self.inner.bytes_received.load(Ordering::Relaxed),
            malformed_packets: self.inner.malformed_packets.load(Ordering::Relaxed),
            stale_resets: self.inner.stale_resets.load(Ordering::Relaxed),
            active_client_connected: active,
            active_client_ip: self.inner.active_client_ip.lock().unwrap().clone(),
            current_rtt_ms: if active && rtt > 0 { Some(rtt) } else { None },
            uptime_secs: self.inner.start_time.elapsed().as_secs(),
        }
    }
}

impl Default for Diagnostics {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_diagnostics_counters() {
        let diag = Diagnostics::new();
        diag.record_packet(19);
        diag.record_packet(19);
        diag.record_malformed_packet();
        diag.record_stale_reset();
        diag.set_client_connected(Some("192.168.1.42".to_string()));
        diag.record_rtt(8);

        let snap = diag.snapshot();
        assert_eq!(snap.packets_received, 2);
        assert_eq!(snap.bytes_received, 38);
        assert_eq!(snap.malformed_packets, 1);
        assert_eq!(snap.stale_resets, 1);
        assert!(snap.active_client_connected);
        assert_eq!(snap.active_client_ip.as_deref(), Some("192.168.1.42"));
        assert_eq!(snap.current_rtt_ms, Some(8));
    }
}
