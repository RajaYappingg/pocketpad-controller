// Axum HTTP Server & High-Performance WebSocket Input Handler

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, Query, State,
    },
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::net::SocketAddr;
use std::time::Duration;
use tokio::sync::broadcast;
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
    pub controllers: Arc<Mutex<Vec<ControllerSlot>>>,
    pub driver_status: DriverStatus,
    pub pairing: PairingManager,
    pub diagnostics: Diagnostics,
    pub port: u16,
    pub disconnect_notify: Arc<broadcast::Sender<()>>,
}

pub struct ControllerSlot {
    pub controller: Box<dyn VirtualController>,
    pub session_id: Option<u64>,
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
    pub active_clients: usize,
    pub controller_slots: usize,
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
    let slots = state.controllers.lock().unwrap();
    let active_clients = slots.iter().filter(|slot| slot.session_id.is_some()).count();
    let controller_slots = slots.len();
    drop(slots);
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
        active_clients,
        controller_slots,
        packets_received: snap.packets_received,
        rtt_ms: snap.current_rtt_ms,
        uptime_secs: snap.uptime_secs,
    })
}

/// Safe disconnect endpoint from dashboard
async fn api_disconnect(State(state): State<AppState>) -> impl IntoResponse {
    let _ = state.disconnect_notify.send(());
    let mut slots = state.controllers.lock().unwrap();
    for slot in slots.iter_mut() {
        if let Err(error) = slot.controller.reset_neutral() {
            warn!("Failed to reset controller during dashboard disconnect: {error}");
        }
        slot.session_id = None;
    }
    state.diagnostics.set_client_connected(None);
    info!("All phone sessions disconnected via dashboard API");
    StatusCode::OK
}

/// WebSocket connection upgrade and authentication
async fn ws_handler(
    ws: WebSocketUpgrade,
    ConnectInfo(remote_addr): ConnectInfo<SocketAddr>,
    Query(query): Query<WsAuthQuery>,
    State(state): State<AppState>,
) -> Response {
    let remote_ip = remote_addr.ip().to_string();

    // Verify pairing code or token
    let session_token = if let Some(ref token) = query.token {
        if state.pairing.verify_token(token, &remote_ip) {
            Some(token.clone())
        } else {
            None
        }
    } else if let Some(ref code) = query.code {
        state.pairing.verify_code(&remote_ip, code).ok()
    } else {
        None
    };

    let Some(session_token) = session_token else {
        warn!("Rejected unauthenticated WebSocket connection attempt");
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Invalid pairing code or expired token" })),
        )
            .into_response();
    };

    let mut slots = state.controllers.lock().unwrap();
    let Some((slot_index, slot)) = slots
        .iter_mut()
        .enumerate()
        .find(|(_, slot)| slot.session_id.is_none())
    else {
        return (
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "error": "All four controller slots are in use" })),
        )
            .into_response();
    };
    let session_id = rand::random::<u64>();
    slot.session_id = Some(session_id);
    drop(slots);

    ws.on_upgrade(move |socket| {
        handle_controller_socket(
            socket,
            state,
            slot_index,
            session_id,
            remote_ip,
            session_token,
        )
    })
}

/// High-performance controller socket loop
async fn handle_controller_socket(
    mut socket: WebSocket,
    state: AppState,
    slot_index: usize,
    session_id: u64,
    client_ip: String,
    session_token: String,
) {
    info!("Phone controller connected from {client_ip}");
    state.diagnostics.set_client_connected(Some(client_ip.clone()));

    // Reset controller to neutral on connect
    {
        let mut slots = state.controllers.lock().unwrap();
        if let Err(error) = slots[slot_index].controller.reset_neutral() {
            warn!("Failed to reset controller slot {slot_index} on connect: {error}");
        }
    }
    if socket
        .send(Message::Text(
            serde_json::json!({ "authenticated": true, "token": session_token }).to_string(),
        ))
        .await
        .is_err()
    {
        cleanup_controller_slot(&state, slot_index, session_id);
        return;
    }

    let watchdog = Arc::new(Mutex::new(Watchdog::new()));
    watchdog.lock().unwrap().on_session_start();

    let mut disconnect_rx = state.disconnect_notify.subscribe();

    // Background watchdog task (ticks every 25ms to detect staleness within 250ms)
    let watchdog_clone = Arc::clone(&watchdog);
    let controllers_clone = Arc::clone(&state.controllers);
    let diag_clone = state.diagnostics.clone();
    let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();
    let (drop_tx, mut drop_rx) = tokio::sync::oneshot::channel::<()>();

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
                            let mut slots = controllers_clone.lock().unwrap();
                            if let Err(error) = slots[slot_index].controller.reset_neutral() {
                                warn!("Failed to reset stale controller slot {slot_index}: {error}");
                            }
                            diag_clone.record_stale_reset();
                        }
                        WatchdogAction::DropSession => {
                            warn!("Watchdog: connection timed out, dropping session");
                            let mut slots = controllers_clone.lock().unwrap();
                            if let Err(error) = slots[slot_index].controller.reset_neutral() {
                                warn!("Failed to reset timed-out controller slot {slot_index}: {error}");
                            }
                            let _ = drop_tx.send(());
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
    let mut last_sequence = None;

    // Socket input loop
    loop {
        tokio::select! {
            _ = &mut drop_rx => {
                let _ = socket.close().await;
                break;
            }
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
                                if let Some(previous) = last_sequence {
                                    let delta = input.sequence.wrapping_sub(previous);
                                    if delta == 0 || delta >= (1 << 31) {
                                        state.diagnostics.record_malformed_packet();
                                        continue;
                                    }
                                }
                                last_sequence = Some(input.sequence);
                                watchdog.lock().unwrap().on_input_received();
                                let ctrl_state = ControllerState::from_raw_packet(&input);
                                let mut slots = state.controllers.lock().unwrap();
                                if slots[slot_index].session_id != Some(session_id) {
                                    break;
                                }
                                if let Err(e) = slots[slot_index].controller.update(&ctrl_state) {
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
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(message) = serde_json::from_str::<serde_json::Value>(&text) {
                            if let Some(rtt_ms) = message.get("rttMs").and_then(|value| value.as_u64()) {
                                state.diagnostics.record_rtt(rtt_ms.min(u32::MAX as u64) as u32);
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
    cleanup_controller_slot(&state, slot_index, session_id);
    let has_active_session = state
        .controllers
        .lock()
        .unwrap()
        .iter()
        .any(|slot| slot.session_id.is_some());
    if !has_active_session {
        state.diagnostics.set_client_connected(None);
    }
    info!("Controller session cleaned up cleanly");
}

fn cleanup_controller_slot(state: &AppState, slot_index: usize, session_id: u64) {
    let mut slots = state.controllers.lock().unwrap();
    if slots[slot_index].session_id == Some(session_id) {
        if let Err(error) = slots[slot_index].controller.reset_neutral() {
            warn!("Failed to reset controller slot {slot_index} during cleanup: {error}");
        }
        slots[slot_index].session_id = None;
    }
}
