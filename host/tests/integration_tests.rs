// Integration tests for PocketPad end-to-end pipeline

use pocketpad_core::controller_state::{buttons, ControllerState};
use pocketpad_core::network::NetworkUtils;
use pocketpad_core::pairing::PairingManager;
use pocketpad_core::protocol::RawInputPacket;
use pocketpad_core::virtual_controller::{MockVirtualController, VirtualController};
use pocketpad_core::watchdog::{TimeProvider, Watchdog, WatchdogAction};

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

#[derive(Clone)]
struct ManualClock {
    now: Arc<AtomicU64>,
}

impl ManualClock {
    fn new(start_ms: u64) -> Self {
        Self {
            now: Arc::new(AtomicU64::new(start_ms)),
        }
    }

    fn advance(&self, ms: u64) {
        self.now.fetch_add(ms, Ordering::SeqCst);
    }
}

impl TimeProvider for ManualClock {
    fn now_millis(&self) -> u64 {
        self.now.load(Ordering::SeqCst)
    }
}

#[test]
fn test_simultaneous_multi_control_pipeline() {
    let mut controller = MockVirtualController::new();

    // 1. Client holds A button, Left Shoulder, Left Trigger at 180, and aims right stick
    let raw = RawInputPacket {
        sequence: 1,
        buttons: buttons::A | buttons::LEFT_SHOULDER | buttons::RIGHT_THUMB,
        left_trigger: 180,
        right_trigger: 0,
        thumb_lx: -25000,
        thumb_ly: 18000,
        thumb_rx: 31000,
        thumb_ry: -15000,
    };

    let state = ControllerState::from_raw_packet(&raw);
    controller.update(&state).expect("Update should succeed");

    assert!(controller.last_state.is_button_pressed(buttons::A));
    assert!(controller.last_state.is_button_pressed(buttons::LEFT_SHOULDER));
    assert!(controller.last_state.is_button_pressed(buttons::RIGHT_THUMB));
    assert_eq!(controller.last_state.left_trigger, 180);
    assert_eq!(controller.last_state.right_trigger, 0);
    assert_eq!(controller.last_state.thumb_lx, -25000);
    assert_eq!(controller.last_state.thumb_ly, 18000);
    assert_eq!(controller.last_state.thumb_rx, 31000);
    assert_eq!(controller.last_state.thumb_ry, -15000);
}

#[test]
fn test_watchdog_neutral_reset_pipeline() {
    let clock = ManualClock::new(5000);
    let mut watchdog = Watchdog::with_time_provider(clock.clone(), 250, 2000);
    let mut controller = MockVirtualController::new();

    watchdog.on_session_start();

    // Player is pushing forward on thumbstick and firing RT
    let mut active_state = ControllerState::neutral();
    active_state.thumb_ly = 32767;
    active_state.right_trigger = 255;
    controller.update(&active_state).unwrap();
    watchdog.on_input_received();

    assert_eq!(controller.last_state.thumb_ly, 32767);
    assert_eq!(controller.last_state.right_trigger, 255);

    // Phone suddenly loses Wi-Fi / stops sending packets for 300ms
    clock.advance(300);
    assert_eq!(watchdog.check(), WatchdogAction::ResetNeutral);

    // Controller must immediately return to neutral
    controller.reset_neutral().unwrap();
    assert_eq!(controller.last_state.thumb_ly, 0);
    assert_eq!(controller.last_state.right_trigger, 0);
    assert_eq!(controller.last_state.buttons, 0);

    // Connection drop after 2100ms
    clock.advance(1800);
    assert_eq!(watchdog.check(), WatchdogAction::DropSession);
    controller.disconnect().unwrap();
    assert!(!controller.is_connected());
}

#[test]
fn test_pairing_workflow_and_token_reuse() {
    let pairing = PairingManager::new();
    let code = pairing.get_pairing_code();
    let client_ip = "192.168.1.150";

    // Invalid attempt
    assert!(pairing.verify_code(client_ip, "99999").is_err());

    // Valid attempt returns reusable token
    let token = pairing.verify_code(client_ip, &code).unwrap();
    assert!(pairing.verify_token(&token, client_ip));

    // Token works even if code is regenerated
    let second_token = pairing.verify_code(client_ip, &code).unwrap();
    assert!(pairing.verify_token(&second_token, client_ip));
}

#[test]
fn test_network_url_generation() {
    let ip = NetworkUtils::get_primary_local_ip().to_string();
    let url = NetworkUtils::build_controller_url(&ip, 3000, "1234");
    assert!(url.starts_with("http://"));
    assert!(url.contains(":3000/?mode=controller&code=1234"));
}

#[test]
fn test_live_vigem_connection() {
    match vigem_client::Client::connect() {
        Ok(client) => {
            println!("Connected to ViGEmBus successfully!");
            let id = vigem_client::TargetId::XBOX360_WIRED;
            let mut target = vigem_client::Xbox360Wired::new(client, id);
            target.plugin().expect("Plugin target must succeed");
            let _ = target.wait_ready();
            let pad = vigem_client::XGamepad::default();
            target.update(&pad).expect("Update state must succeed");
            let _ = target.unplug();
            println!("Virtual Xbox 360 controller plugged, updated, and unplugged!");
        }
        Err(e) => {
            panic!("Live ViGEmBus connection failed: {:?}", e);
        }
    }
}
