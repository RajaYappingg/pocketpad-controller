use pocketpad_core::diagnostics::Diagnostics;
use pocketpad_core::network::NetworkUtils;
use pocketpad_core::pairing::PairingManager;
use pocketpad_core::server::{create_router, AppState};
use pocketpad_core::virtual_controller::{create_virtual_controllers, DriverStatus};

use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tracing::error;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize lightweight tracing logger
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    println!("============================================================");
    println!("  POCKETPAD — Wireless Xbox 360 Controller for Windows      ");
    println!("============================================================");

    // 1. Initialize Virtual Controller Backend & Detect ViGEmBus Driver
    const CONTROLLER_SLOTS: usize = 4;
    let (controllers, driver_status) = create_virtual_controllers(CONTROLLER_SLOTS);
    let controllers = Arc::new(Mutex::new(
        controllers
            .into_iter()
            .map(|controller| pocketpad_core::server::ControllerSlot {
                controller,
                session_id: None,
            })
            .collect(),
    ));

    match &driver_status {
        DriverStatus::Available { backend } => {
            println!("  [✓] Virtual Gamepad Backend: {backend}");
            println!(
                "  [✓] Genuine Xbox 360 controller emulation is ACTIVE ({CONTROLLER_SLOTS} slots)."
            );
        }
        DriverStatus::DriverMissing { reason, help_url } => {
            println!("  [!] NOTICE: ViGEmBus Driver Not Initialized:");
            println!("      {reason}");
            println!("      Setup instructions & download: {help_url}");
            println!("      Running in diagnostic mode (dashboard & network operational).");
        }
    }

    // 2. Network and Port Configuration
    let port = 3000;
    let bind_addr = SocketAddr::from(([0, 0, 0, 0], port));

    let listener = match TcpListener::bind(bind_addr).await {
        Ok(l) => l,
        Err(e) => {
            error!("Failed to bind to port {port}: {e}");
            println!("  [!] Port {port} is occupied. Attempting alternative port 3001...");
            TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], 3001))).await?
        }
    };

    let actual_port = listener.local_addr()?.port();
    let local_ip = NetworkUtils::get_primary_local_ip().to_string();
    let dashboard_url = format!("http://localhost:{actual_port}/?mode=dashboard");
    let mobile_url = format!("http://{local_ip}:{actual_port}/?mode=controller");

    // 3. Pairing and Diagnostics
    let pairing = PairingManager::new();
    let pairing_cleanup_handle = pairing.clone();
    let pairing_code = pairing.get_pairing_code();
    let diagnostics = Diagnostics::new();
    let (disconnect_tx, _) = broadcast::channel(16);

    println!("------------------------------------------------------------");
    println!("  Desktop Dashboard : {dashboard_url}");
    println!("  Phone Gamepad URL : {mobile_url}&code={pairing_code}");
    println!("  Pairing Code      : {pairing_code}");
    println!("------------------------------------------------------------");
    println!("  Windows Verification: Run 'joy.cpl' to test inputs.");
    println!("  Press Ctrl+C to stop PocketPad safely.");
    println!("============================================================");

    // Optionally launch browser to dashboard
    tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        let _ = std::process::Command::new("cmd")
            .args(["/c", "start", &dashboard_url])
            .spawn();
    });

    let app_state = AppState {
        controllers: Arc::clone(&controllers),
        driver_status,
        pairing,
        diagnostics,
        port: actual_port,
        disconnect_notify: Arc::new(disconnect_tx),
    };

    let router = create_router(app_state);

    // 4. Run Server with Graceful Shutdown on Ctrl+C
    let controllers_shutdown = Arc::clone(&controllers);
    let server = axum::serve(
        listener,
        router.into_make_service_with_connect_info::<SocketAddr>(),
    );

    let pairing_cleanup = tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));
        loop {
            interval.tick().await;
            pairing_cleanup_handle.cleanup();
        }
    });

    tokio::select! {
        res = server => {
            if let Err(e) = res {
                error!("Server error: {e}");
            }
            pairing_cleanup.abort();
        }
        _ = tokio::signal::ctrl_c() => {
            println!("\n  Shutdown signal received. Cleaning up virtual controller...");
        }
    }

    // Clean disconnect of virtual controller on shutdown
    {
        let mut slots = controllers_shutdown.lock().unwrap();
        for (slot_index, slot) in slots.iter_mut().enumerate() {
            if let Err(error) = slot.controller.reset_neutral() {
                error!("Failed to reset controller slot {slot_index} during shutdown: {error}");
            }
            if let Err(error) = slot.controller.disconnect() {
                error!("Failed to disconnect controller slot {slot_index}: {error}");
            }
            slot.session_id = None;
        }
    }
    println!("  [✓] Virtual device unplugged cleanly. Goodbye!");

    Ok(())
}
