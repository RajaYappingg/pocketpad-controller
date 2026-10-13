// Axum HTTP Server & High-Performance WebSocket Input Handler

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::broadcast;
use tower_http::cors::CorsLayer;
use tracing::{error, info, warn};

use crate::controller_state::ControllerState;
use crate::diagnostics::Diagnostics;
use crate::network::NetworkUtils;
use crate::pairing::PairingManager;
use crate::protocol::{Packet, Protocol};
use crate::virtual_controller::{DriverStatus, VirtualController};
use crate::watchdog::{Watchdog, WatchdogAction};

#[derive(RustEmbed)]
#[folder = "../web/dist"]
struct WebAssets;

#[derive(Clone)]
pub struct AppState {
    pub controller: Arc<Mutex<Box<dyn VirtualController>>>,
    pub driver_status: DriverStatus,
    pub pairing: PairingManager,
    pub diagnostics: Diagnostics,
    pub port: u16,
    pub disconnect_notify: Arc<broadcast::Sender<()>>,
}

#[derive(Debug, Deserialize)]
pub struct WsAuthQuery {
    pub code: Option<String>,
    pub token: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusResponse {
    pub status: &'static str,
    pub driver_installed: bool,
    pub driver_name: &'static str,
    pub driver_reason: Option<String>,
    pub help_url: Option<&'static str>,
    pub pairing_code: String,
    pub server_url: String,
    pub ip_addresses: Vec<String>,
    pub port: u16,
    pub active_client_connected: bool,
    pub active_client_ip: Option<String>,
    pub packets_received: u64,
    pub rtt_ms: Option<u32>,
    pub uptime_secs: u64,
}

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/api/status", get(api_status))
        .route("/api/disconnect", post(api_disconnect))
        .route("/ws", get(ws_handler))
        .fallback(static_file_handler)
        .layer(CorsLayer::permissive())
        .with_state(state)
}

/// Static embedded file handler (serves HTML/JS/CSS directly from binary)
async fn static_file_handler(uri: axum::http::Uri) -> impl IntoResponse {
    let mut path = uri.path().trim_start_matches('/').to_string();
    if path.is_empty() {
        path = "index.html".to_string();
    }

    match WebAssets::get(&path) {
        Some(content) => {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            let mut headers = HeaderMap::new();
            headers.insert(header::CONTENT_TYPE, mime.as_ref().parse().unwrap());
            headers.insert(header::CACHE_CONTROL, "public, max-age=3600".parse().unwrap());
            (StatusCode::OK, headers, content.data).into_response()
        }
        None => {
            // SPA fallback: return index.html
            if let Some(index) = WebAssets::get("index.html") {
                let mut headers = HeaderMap::new();
                headers.insert(header::CONTENT_TYPE, "text/html; charset=utf-8".parse().unwrap());
                (StatusCode::OK, headers, index.data).into_response()
            } else {
                (StatusCode::NOT_FOUND, "Not Found").into_response()
            }
        }
    }
}

/// Status API for desktop dashboard
async fn api_status(State(state): State<AppState>) -> Json<StatusResponse> {
    let snap = state.diagnostics.snapshot();
    let code = state.pairing.get_pairing_code();
    let local_ip = NetworkUtils::get_primary_local_ip().to_string();
    let server_url = format!("http://{local_ip}:{}", state.port);
    let ip_candidates = NetworkUtils::get_local_ip_candidates();

    let (driver_installed, driver_name, driver_reason, help_url) = match &state.driver_status {
        DriverStatus::Available { backend } => (true, *backend, None, None),
        DriverStatus::DriverMissing { reason, help_url } => {
            (false, "Driver Missing", Some(reason.clone()), Some(*help_url))
        }
    };

    Json(StatusResponse {
        status: if driver_installed { "ok" } else { "driver_missing" },
        driver_installed,
        driver_name,
        driver_reason,
        help_url,
        pairing_code: code,
        server_url,
        ip_addresses: ip_candidates,
        port: state.port,
        active_client_connected: snap.active_client_connected,
        active_client_ip: snap.active_client_ip,
        packets_received: snap.packets_received,
        rtt_ms: snap.current_rtt_ms,
        uptime_secs: snap.uptime_secs,
    })
}

/// Safe disconnect endpoint from dashboard
async fn api_disconnect(State(state): State<AppState>) -> impl IntoResponse {
    let _ = state.disconnect_notify.send(());
    let mut ctrl = state.controller.lock().unwrap();
    let _ = ctrl.reset_neutral();
    state.diagnostics.set_client_connected(None);
    info!("Phone session disconnected via dashboard API");
    StatusCode::OK
}

/// WebSocket connection upgrade and authentication
async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsAuthQuery>,
    State(state): State<AppState>,
) -> Response {
    let remote_ip = "mobile_client";

    // Verify pairing code or token
    let is_authenticated = if let Some(ref token) = query.token {
        state.pairing.verify_token(token)
    } else if let Some(ref code) = query.code {
        state.pairing.verify_code(remote_ip, code).is_ok()
    } else {
        false
    };

    if !is_authenticated {
        warn!("Rejected unauthenticated WebSocket connection attempt");
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Invalid pairing code or expired token" })),
        )
            .into_response();
    }

    ws.on_upgrade(move |socket| handle_controller_socket(socket, state, "client".to_string()))
}

/// High-performance controller socket loop
async fn handle_controller_socket(mut socket: WebSocket, state: AppState, client_ip: String) {
    info!("Phone controller connected from {client_ip}");
    state.diagnostics.set_client_connected(Some(client_ip.clone()));

    // Reset controller to neutral on connect
    {
        let mut ctrl = state.controller.lock().unwrap();
        let _ = ctrl.reset_neutral();
    }

    let watchdog = Arc::new(Mutex::new(Watchdog::new()));
    watchdog.lock().unwrap().on_session_start();

    let mut disconnect_rx = state.disconnect_notify.subscribe();

    // Background watchdog task (ticks every 25ms to detect staleness within 250ms)
    let watchdog_clone = Arc::clone(&watchdog);
    let controller_clone = Arc::clone(&state.controller);
    let diag_clone = state.diagnostics.clone();
    let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();

    let watchdog_task = tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(25));
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    let action = {
                        let mut wd = watchdog_clone.lock().unwrap();
                        wd.check()
                    };
                    match action {
                        WatchdogAction::ResetNeutral => {
                            let mut ctrl = controller_clone.lock().unwrap();
                            let _ = ctrl.reset_neutral();
                            diag_clone.record_stale_reset();
                        }
                        WatchdogAction::DropSession => {
                            warn!("Watchdog: connection timed out, dropping session");
                            let mut ctrl = controller_clone.lock().unwrap();
                            let _ = ctrl.reset_neutral();
                            break;
                        }
                        WatchdogAction::None => {}
                    }
                }
                _ = &mut stop_rx => {
                    break;
                }
            }
        }
    });

    // Socket input loop
    loop {
        tokio::select! {
            _ = disconnect_rx.recv() => {
                info!("Session disconnected via remote signal");
                let _ = socket.send(Message::Text("{\"disconnected\":true}".to_string())).await;
                let _ = socket.close().await;
                break;
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Binary(bytes))) => {
                        state.diagnostics.record_packet(bytes.len());
                        match Protocol::decode(&bytes) {
                            Ok(Packet::Input(input)) => {
                                watchdog.lock().unwrap().on_input_received();
                                let ctrl_state = ControllerState::from_raw_packet(&input);
                                let mut ctrl = state.controller.lock().unwrap();
                                if let Err(e) = ctrl.update(&ctrl_state) {
                                    error!("Virtual controller update failed: {e}");
                                }
                            }
                            Ok(Packet::Ping(timestamp)) => {
                                let pong = Protocol::encode_pong(timestamp);
                                if socket.send(Message::Binary(pong.to_vec())).await.is_err() {
                                    break;
                                }
                            }
                            Ok(Packet::Pong(_)) => {}
                            Err(_) => {
                                state.diagnostics.record_malformed_packet();
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        info!("Controller WebSocket closed by client");
                        break;
                    }
                    Some(Err(e)) => {
                        warn!("WebSocket error: {e}");
                        break;
                    }
                    _ => {}
                }
            }
        }
    }

    // Cleanup session and stop watchdog
    let _ = stop_tx.send(());
    let _ = watchdog_task.await;

    watchdog.lock().unwrap().on_session_end();
    {
        let mut ctrl = state.controller.lock().unwrap();
        let _ = ctrl.reset_neutral();
    }
    state.diagnostics.set_client_connected(None);
    info!("Controller session cleaned up cleanly");
}
