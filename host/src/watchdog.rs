// PocketPad Input Watchdog & Safety Failsafe System

pub trait TimeProvider: Send + Sync {
    fn now_millis(&self) -> u64;
}

pub struct SystemTimeProvider;

impl TimeProvider for SystemTimeProvider {
    fn now_millis(&self) -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WatchdogAction {
    None,
    ResetNeutral,
    DropSession,
}

pub struct Watchdog<T: TimeProvider = SystemTimeProvider> {
    time_provider: T,
    stale_threshold_ms: u64,
    disconnect_threshold_ms: u64,
    last_input_time_ms: u64,
    is_neutral: bool,
    is_session_active: bool,
}

impl Watchdog<SystemTimeProvider> {
    pub fn new() -> Self {
        Self::with_time_provider(SystemTimeProvider, 250, 2000)
    }
}

impl Default for Watchdog<SystemTimeProvider> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T: TimeProvider> Watchdog<T> {
    pub fn with_time_provider(
        time_provider: T,
        stale_threshold_ms: u64,
        disconnect_threshold_ms: u64,
    ) -> Self {
        let now = time_provider.now_millis();
        Self {
            time_provider,
            stale_threshold_ms,
            disconnect_threshold_ms,
            last_input_time_ms: now,
            is_neutral: true,
            is_session_active: false,
        }
    }

    /// Called when a client starts a session
    pub fn on_session_start(&mut self) {
        let now = self.time_provider.now_millis();
        self.last_input_time_ms = now;
        self.is_neutral = true;
        self.is_session_active = true;
    }

    /// Called when valid input is received
    pub fn on_input_received(&mut self) {
        let now = self.time_provider.now_millis();
        self.last_input_time_ms = now;
        self.is_neutral = false;
    }

    /// Checks for input staleness and disconnection intervals
    pub fn check(&mut self) -> WatchdogAction {
        if !self.is_session_active {
            return WatchdogAction::None;
        }

        let now = self.time_provider.now_millis();
        let elapsed = now.saturating_sub(self.last_input_time_ms);

        if elapsed >= self.disconnect_threshold_ms {
            self.is_session_active = false;
            self.is_neutral = true;
            return WatchdogAction::DropSession;
        }

        if elapsed >= self.stale_threshold_ms && !self.is_neutral {
            self.is_neutral = true;
            return WatchdogAction::ResetNeutral;
        }

        WatchdogAction::None
    }

    /// Called when a session ends or disconnects abruptly
    pub fn on_session_end(&mut self) {
        self.is_session_active = false;
        self.is_neutral = true;
    }

    pub fn is_session_active(&self) -> bool {
        self.is_session_active
    }

    pub fn is_neutral(&self) -> bool {
        self.is_neutral
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;

    #[derive(Clone)]
    struct MockTimeProvider {
        current_time: Arc<AtomicU64>,
    }

    impl MockTimeProvider {
        fn new(start_ms: u64) -> Self {
            Self {
                current_time: Arc::new(AtomicU64::new(start_ms)),
            }
        }

        fn advance(&self, delta_ms: u64) {
            self.current_time.fetch_add(delta_ms, Ordering::SeqCst);
        }
    }

    impl TimeProvider for MockTimeProvider {
        fn now_millis(&self) -> u64 {
            self.current_time.load(Ordering::SeqCst)
        }
    }

    #[test]
    fn test_watchdog_stale_reset_and_disconnect() {
        let clock = MockTimeProvider::new(1000);
        let mut watchdog = Watchdog::with_time_provider(clock.clone(), 250, 2000);

        watchdog.on_session_start();
        assert!(watchdog.is_session_active());
        assert!(watchdog.is_neutral());

        // Input received
        watchdog.on_input_received();
        assert!(!watchdog.is_neutral());
        assert_eq!(watchdog.check(), WatchdogAction::None);

        // Advance 100ms (not yet stale)
        clock.advance(100);
        assert_eq!(watchdog.check(), WatchdogAction::None);

        // Advance another 160ms (total 260ms elapsed: past 250ms stale threshold)
        clock.advance(160);
        assert_eq!(watchdog.check(), WatchdogAction::ResetNeutral);
        assert!(watchdog.is_neutral());

        // Subsequent check before disconnect returns None because already neutral
        clock.advance(50);
        assert_eq!(watchdog.check(), WatchdogAction::None);

        // Advance to 2100ms elapsed since input (past 2000ms disconnect threshold)
        clock.advance(1800);
        assert_eq!(watchdog.check(), WatchdogAction::DropSession);
        assert!(!watchdog.is_session_active());
    }

    #[test]
    fn test_watchdog_continuous_input_remains_active() {
        let clock = MockTimeProvider::new(1000);
        let mut watchdog = Watchdog::with_time_provider(clock.clone(), 250, 2000);

        watchdog.on_session_start();

        // Simulate 60 updates at 16ms intervals (1 second total)
        for _ in 0..60 {
            clock.advance(16);
            watchdog.on_input_received();
            assert_eq!(watchdog.check(), WatchdogAction::None);
        }

        assert!(watchdog.is_session_active());
        assert!(!watchdog.is_neutral());
    }
}
