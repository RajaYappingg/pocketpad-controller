// PocketPad Performance and Diagnostics Metrics

use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[derive(Debug, Clone)]
pub struct Diagnostics {
    inner: Arc<DiagnosticsInner>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotDiagnosticsSnapshot {
    pub slot_index: usize,
    pub connected: bool,
    pub client_ip: Option<String>,
    pub rtt_ms: Option<u32>,
    pub packets_received: u64,
}

#[derive(Debug)]
struct SlotDiagnosticsInner {
    connected: AtomicBool,
    client_ip: Mutex<Option<String>>,
    rtt_ms: AtomicU32,
    packets_received: AtomicU64,
}

impl SlotDiagnosticsInner {
    fn new() -> Self {
        Self {
            connected: AtomicBool::new(false),
            client_ip: Mutex::new(None),
            rtt_ms: AtomicU32::new(0),
            packets_received: AtomicU64::new(0),
        }
    }
}

#[derive(Debug)]
struct DiagnosticsInner {
    start_time: Instant,
    packets_received: AtomicU64,
    bytes_received: AtomicU64,
    malformed_packets: AtomicU64,
    stale_resets: AtomicU64,
    slots: Vec<SlotDiagnosticsInner>,
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
    pub slots: Vec<SlotDiagnosticsSnapshot>,
}

impl Diagnostics {
    pub fn new() -> Self {
        Self::with_slot_count(4)
    }

    pub fn with_slot_count(slots: usize) -> Self {
        let mut slot_inners = Vec::with_capacity(slots);
        for _ in 0..slots {
            slot_inners.push(SlotDiagnosticsInner::new());
        }
        Self {
            inner: Arc::new(DiagnosticsInner {
                start_time: Instant::now(),
                packets_received: AtomicU64::new(0),
                bytes_received: AtomicU64::new(0),
                malformed_packets: AtomicU64::new(0),
                stale_resets: AtomicU64::new(0),
                slots: slot_inners,
            }),
        }
    }

    pub fn record_packet(&self, bytes: usize) {
        self.inner.packets_received.fetch_add(1, Ordering::Relaxed);
        self.inner.bytes_received.fetch_add(bytes as u64, Ordering::Relaxed);
    }

    pub fn record_slot_packet(&self, slot_index: usize, bytes: usize) {
        self.record_packet(bytes);
        if let Some(slot) = self.inner.slots.get(slot_index) {
            slot.packets_received.fetch_add(1, Ordering::Relaxed);
        }
    }

    pub fn record_malformed_packet(&self) {
        self.inner.malformed_packets.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_stale_reset(&self) {
        self.inner.stale_resets.fetch_add(1, Ordering::Relaxed);
    }

    pub fn set_slot_client(&self, slot_index: usize, ip: Option<String>) {
        if let Some(slot) = self.inner.slots.get(slot_index) {
            if let Some(ref client_ip) = ip {
                slot.connected.store(true, Ordering::SeqCst);
                *slot.client_ip.lock().unwrap() = Some(client_ip.clone());
            } else {
                slot.connected.store(false, Ordering::SeqCst);
                *slot.client_ip.lock().unwrap() = None;
                slot.rtt_ms.store(0, Ordering::Relaxed);
            }
        }
    }

    pub fn record_slot_rtt(&self, slot_index: usize, rtt_ms: u32) {
        if let Some(slot) = self.inner.slots.get(slot_index) {
            slot.rtt_ms.store(rtt_ms, Ordering::Relaxed);
        }
    }

    pub fn set_client_connected(&self, ip: Option<String>) {
        self.set_slot_client(0, ip);
    }

    pub fn record_rtt(&self, rtt_ms: u32) {
        self.record_slot_rtt(0, rtt_ms);
    }

    pub fn snapshot(&self) -> DiagnosticsSnapshot {
        let mut slot_snapshots = Vec::with_capacity(self.inner.slots.len());
        let mut any_connected = false;
        let mut first_ip = None;
        let mut first_rtt = None;

        for (i, slot) in self.inner.slots.iter().enumerate() {
            let connected = slot.connected.load(Ordering::SeqCst);
            let client_ip = slot.client_ip.lock().unwrap().clone();
            let rtt = slot.rtt_ms.load(Ordering::Relaxed);
            let rtt_opt = if connected && rtt > 0 { Some(rtt) } else { None };

            if connected {
                any_connected = true;
                if first_ip.is_none() {
                    first_ip = client_ip.clone();
                }
                if first_rtt.is_none() {
                    first_rtt = rtt_opt;
                }
            }

            slot_snapshots.push(SlotDiagnosticsSnapshot {
                slot_index: i,
                connected,
                client_ip,
                rtt_ms: rtt_opt,
                packets_received: slot.packets_received.load(Ordering::Relaxed),
            });
        }

        DiagnosticsSnapshot {
            packets_received: self.inner.packets_received.load(Ordering::Relaxed),
            bytes_received: self.inner.bytes_received.load(Ordering::Relaxed),
            malformed_packets: self.inner.malformed_packets.load(Ordering::Relaxed),
            stale_resets: self.inner.stale_resets.load(Ordering::Relaxed),
            active_client_connected: any_connected,
            active_client_ip: first_ip,
            current_rtt_ms: first_rtt,
            uptime_secs: self.inner.start_time.elapsed().as_secs(),
            slots: slot_snapshots,
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
        diag.record_slot_packet(0, 19);
        diag.record_slot_packet(0, 19);
        diag.record_malformed_packet();
        diag.record_stale_reset();
        diag.set_slot_client(0, Some("192.168.1.42".to_string()));
        diag.record_slot_rtt(0, 8);

        let snap = diag.snapshot();
        assert_eq!(snap.packets_received, 2);
        assert_eq!(snap.bytes_received, 38);
        assert_eq!(snap.malformed_packets, 1);
        assert_eq!(snap.stale_resets, 1);
        assert!(snap.active_client_connected);
        assert_eq!(snap.active_client_ip.as_deref(), Some("192.168.1.42"));
        assert_eq!(snap.current_rtt_ms, Some(8));
        assert_eq!(snap.slots.len(), 4);
        assert!(snap.slots[0].connected);
        assert_eq!(snap.slots[0].client_ip.as_deref(), Some("192.168.1.42"));
        assert_eq!(snap.slots[0].rtt_ms, Some(8));
        assert_eq!(snap.slots[0].packets_received, 2);
    }
}
