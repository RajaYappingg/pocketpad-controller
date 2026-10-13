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
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::broadcast;
use tracing::{error, info, warn};

use crate::controller_state::ControllerState;
use crate::diagnostics::{Diagnostics, SlotDiagnosticsSnapshot};
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
    pub controllers: Arc<Vec<Mutex<ControllerSlot>>>,
    pub driver_status: DriverStatus,
    pub pairing: PairingManager,
    pub diagnostics: Diagnostics,
    pub port: u16,
    pub disconnect_notify: Arc<broadcast::Sender<Option<usize>>>,
}

pub struct ControllerSlot {
    pub controller: Box<dyn VirtualController>,
    pub session_id: Option<u64>,
    pub client_ip: Option<String>,
    pub session_token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WsAuthQuery {
    pub code: Option<String>,
    pub token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DisconnectQuery {
    pub slot: Option<usize>,
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
    pub slots: Vec<SlotDiagnosticsSnapshot>,
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
            let cache_control = if path == "index.html" || path == "sw.js" || path == "manifest.webmanifest" {
                "no-cache, no-store, must-revalidate"
            } else if path.starts_with("assets/") {
                "public, max-age=31536000, immutable"
            } else {
                "public, max-age=3600"
            };
            headers.insert(header::CACHE_CONTROL, cache_control.parse().unwrap());
            (StatusCode::OK, headers, content.data).into_response()
        }
        None => {
            // SPA fallback: return index.html
            if let Some(index) = WebAssets::get("index.html") {
                let mut headers = HeaderMap::new();
                headers.insert(header::CONTENT_TYPE, "text/html; charset=utf-8".parse().unwrap());
                headers.insert(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate".parse().unwrap());
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
    let controller_slots = state.controllers.len();
    let active_clients = snap.slots.iter().filter(|s| s.connected).count();
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
        slots: snap.slots,
    })
}

/// Safe disconnect endpoint from dashboard
async fn api_disconnect(
    Query(query): Query<DisconnectQuery>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let target_slot = query.slot;
    let _ = state.disconnect_notify.send(target_slot);

    match target_slot {
        Some(idx) if idx < state.controllers.len() => {
            let mut slot = state.controllers[idx].lock().unwrap();
            if let Err(error) = slot.controller.reset_neutral() {
                warn!("Failed to reset controller slot {idx} during disconnect: {error}");
            }
            slot.session_id = None;
            slot.client_ip = None;
            slot.session_token = None;
            state.diagnostics.set_slot_client(idx, None);
            info!("Controller slot {idx} disconnected via dashboard API");
        }
        _ => {
            for (idx, slot_mutex) in state.controllers.iter().enumerate() {
                let mut slot = slot_mutex.lock().unwrap();
                if let Err(error) = slot.controller.reset_neutral() {
                    warn!("Failed to reset controller slot {idx} during disconnect: {error}");
                }
                slot.session_id = None;
                slot.client_ip = None;
                slot.session_token = None;
                state.diagnostics.set_slot_client(idx, None);
            }
            info!("All phone sessions disconnected via dashboard API");
        }
    }

    StatusCode::OK
}

/// WebSocket connection upgrade and authentication
async fn ws_handler(
    ws: WebSocketUpgrade,
    ConnectInfo(remote_addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Query(query): Query<WsAuthQuery>,
    State(state): State<AppState>,
) -> Response {
    let remote_ip = remote_addr.ip().to_string();

    // CSWSH Protection: Validate Origin if provided by browser
    if let Some(origin) = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        let is_allowed = origin.starts_with("http://localhost")
            || origin.starts_with("https://localhost")
            || origin.starts_with("http://127.0.0.1")
            || origin.starts_with("https://127.0.0.1")
            || origin.starts_with("http://[::1]")
            || origin.starts_with("http://192.168.")
            || origin.starts_with("http://10.")
            || origin.starts_with("http://172.");
        if !is_allowed {
            warn!("Rejected WebSocket connection with untrusted external Origin: {origin}");
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({ "error": "Cross-origin WebSocket connection forbidden" })),
            )
                .into_response();
        }
    }

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
        warn!("Rejected unauthenticated WebSocket connection attempt from {remote_ip}");
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Invalid pairing code or expired token" })),
        )
            .into_response();
    };

    // 1. Check if this client already owns a slot (reconnecting by token)
    let mut assigned_slot_index = None;
    for (idx, slot_mutex) in state.controllers.iter().enumerate() {
        let slot = slot_mutex.lock().unwrap();
        if slot.session_token.as_deref() == Some(&session_token) {
            assigned_slot_index = Some(idx);
            break;
        }
    }

    // 2. If reconnecting to an existing slot, notify existing socket to close immediately
    if let Some(idx) = assigned_slot_index {
        let _ = state.disconnect_notify.send(Some(idx));
    }

    // 3. If not reconnecting to an existing slot, find first empty slot
    let slot_index = match assigned_slot_index {
        Some(idx) => idx,
        None => {
            let mut free_index = None;
            for (idx, slot_mutex) in state.controllers.iter().enumerate() {
                let slot = slot_mutex.lock().unwrap();
                if slot.session_id.is_none() {
                    free_index = Some(idx);
                    break;
                }
            }
            match free_index {
                Some(idx) => idx,
                None => {
                    return (
                        StatusCode::CONFLICT,
                        Json(serde_json::json!({ "error": "All four controller slots are in use" })),
                    )
                        .into_response();
                }
            }
        }
    };

    let session_id = rand::random::<u64>();
    {
        let mut slot = state.controllers[slot_index].lock().unwrap();
        slot.session_id = Some(session_id);
        slot.client_ip = Some(remote_ip.clone());
        slot.session_token = Some(session_token.clone());
    }

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
    info!("Phone controller connected for slot {slot_index} from {client_ip}");
    state.diagnostics.set_slot_client(slot_index, Some(client_ip.clone()));

    // Reset controller to neutral on connect
    {
        let mut slot = state.controllers[slot_index].lock().unwrap();
        if let Err(error) = slot.controller.reset_neutral() {
            warn!("Failed to reset controller slot {slot_index} on connect: {error}");
        }
    }
    if socket
        .send(Message::Text(
            serde_json::json!({
                "authenticated": true,
                "token": session_token,
                "slot": slot_index
            })
            .to_string(),
        ))
        .await
        .is_err()
    {
        if cleanup_controller_slot(&state, slot_index, session_id) {
            state.diagnostics.set_slot_client(slot_index, None);
        }
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
                            let mut slot = controllers_clone[slot_index].lock().unwrap();
                            if slot.session_id == Some(session_id) {
                                if let Err(error) = slot.controller.reset_neutral() {
                                    warn!("Failed to reset stale controller slot {slot_index}: {error}");
                                }
                                diag_clone.record_stale_reset();
                            }
                        }
                        WatchdogAction::DropSession => {
                            warn!("Watchdog: connection timed out for slot {slot_index}, dropping session");
                            let mut slot = controllers_clone[slot_index].lock().unwrap();
                            if slot.session_id == Some(session_id) {
                                if let Err(error) = slot.controller.reset_neutral() {
                                    warn!("Failed to reset timed-out controller slot {slot_index}: {error}");
                                }
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
    let mut rumble_rx = {
        let slot = state.controllers[slot_index].lock().unwrap();
        slot.controller.subscribe_rumble()
    };

    // Socket input loop
    loop {
        tokio::select! {
            rumble_changed = async {
                match &mut rumble_rx {
                    Some(rx) => rx.changed().await.ok(),
                    None => std::future::pending::<Option<()>>().await,
                }
            } => {
                if rumble_changed.is_some() {
                    if let Some(rx) = &mut rumble_rx {
                        let (large, small) = *rx.borrow_and_update();
                        let packet = Protocol::encode_rumble(large, small);
                        if socket.send(Message::Binary(packet.to_vec())).await.is_err() {
                            break;
                        }
                    }
                }
            }
            _ = &mut drop_rx => {
                let _ = socket.close().await;
                break;
            }
            target = disconnect_rx.recv() => {
                let should_disconnect = match target {
                    Ok(None) => true,
                    Ok(Some(idx)) => idx == slot_index,
                    Err(_) => false,
                };
                if should_disconnect {
                    info!("Session for slot {slot_index} disconnected via remote signal");
                    let _ = socket.send(Message::Text("{\"disconnected\":true}".to_string())).await;
                    let _ = socket.close().await;
                    break;
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Binary(bytes))) => {
                        state.diagnostics.record_slot_packet(slot_index, bytes.len());
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

                                let mut slot = state.controllers[slot_index].lock().unwrap();
                                if slot.session_id != Some(session_id) {
                                    break;
                                }
                                if let Err(e) = slot.controller.update(&ctrl_state) {
                                    error!("Virtual controller slot {slot_index} update failed: {e}");
                                }
                            }
                            Ok(Packet::Ping(timestamp)) => {
                                let pong = Protocol::encode_pong(timestamp);
                                if socket.send(Message::Binary(pong.to_vec())).await.is_err() {
                                    break;
                                }
                            }
                            Ok(Packet::Pong(_)) | Ok(Packet::Rumble { .. }) => {}
                            Err(_) => {
                                state.diagnostics.record_malformed_packet();
                            }
                        }
                    }
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(message) = serde_json::from_str::<serde_json::Value>(&text) {
                            if let Some(rtt_ms) = message.get("rttMs").and_then(|value| value.as_u64()) {
                                state.diagnostics.record_slot_rtt(slot_index, rtt_ms.min(u32::MAX as u64) as u32);
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        info!("Controller WebSocket for slot {slot_index} closed by client");
                        break;
                    }
                    Some(Err(e)) => {
                        warn!("WebSocket error on slot {slot_index}: {e}");
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
    if cleanup_controller_slot(&state, slot_index, session_id) {
        state.diagnostics.set_slot_client(slot_index, None);
        info!("Controller session for slot {slot_index} cleaned up cleanly");
    } else {
        info!("Controller session for slot {slot_index} superseded by new session; preserved new slot state");
    }
}

fn cleanup_controller_slot(state: &AppState, slot_index: usize, session_id: u64) -> bool {
    let mut slot = state.controllers[slot_index].lock().unwrap();
    if slot.session_id == Some(session_id) {
        if let Err(error) = slot.controller.reset_neutral() {
            warn!("Failed to reset controller slot {slot_index} during cleanup: {error}");
        }
        slot.session_id = None;
        slot.client_ip = None;
        slot.session_token = None;
        true
    } else {
        false
    }
}
