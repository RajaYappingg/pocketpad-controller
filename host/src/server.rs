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
use crate::pairing::{PairingManager, VerifyError};
use crate::protocol::{Packet, Protocol};
use crate::virtual_controller::{DriverStatus, VirtualController};
use crate::watchdog::{Watchdog, WatchdogAction};

/// True for loopback clients (dashboard running on the host itself).
/// Dashboard-only data (pairing code, client IPs) and the disconnect
/// endpoint are only exposed to these.
fn is_loopback_addr(addr: &SocketAddr) -> bool {
    addr.ip().is_loopback()
}

/// Strict Origin check for browser-based WebSocket upgrades.
/// Non-browser clients (no Origin header) still need a valid code/token,
/// so a missing header is allowed but logged by the caller.
/// When present, the Origin must be an exact private/loopback host —
/// prefix matching (e.g. `http://192.168.evil.com`) is rejected.
pub fn is_origin_allowed(origin: &str) -> bool {
    // Strip scheme.
    let after_scheme = if let Some(rest) = origin.strip_prefix("http://") {
        rest
    } else if let Some(rest) = origin.strip_prefix("https://") {
        rest
    } else {
        return false;
    };
    // Strip path, query, fragment → host[:port].
    let hostport = after_scheme.split(['/', '?', '#']).next().unwrap_or("");
    // Strip port (careful with IPv6 literals in brackets).
    let host = if let Some(stripped) = hostport.strip_prefix('[') {
        // [::1]:3000 → ::1
        match stripped.find(']') {
            Some(end) => &stripped[..end],
            None => return false,
        }
    } else if hostport.matches(':').count() == 1 {
        // hostname:port or IPv4:port → host
        match hostport.rfind(':') {
            Some(idx) => &hostport[..idx],
            None => hostport,
        }
    } else {
        hostport
    };
    let host = host.trim().trim_end_matches('.').to_ascii_lowercase();
    if host.is_empty() {
        return false;
    }
    if host == "localhost" {
        return true;
    }
    // Exact IP match against loopback + RFC1918 + IPv6 loopback/ULA.
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        match ip {
            std::net::IpAddr::V4(v4) => {
                let o = v4.octets();
                if v4.is_loopback() {
                    return true;
                }
                // 10.0.0.0/8
                if o[0] == 10 {
                    return true;
                }
                // 172.16.0.0/12
                if o[0] == 172 && (16..=31).contains(&o[1]) {
                    return true;
                }
                // 192.168.0.0/16
                if o[0] == 192 && o[1] == 168 {
                    return true;
                }
                false
            }
            std::net::IpAddr::V6(v6) => v6.is_loopback(),
        }
    } else {
        // Hostnames other than localhost are rejected: prevents
        // `192.168.evil.com` style bypasses and DNS-rebinding tricks.
        // `.home.arpa` / mDNS names could be allowlisted here in future.
        false
    }
}

fn header_value(s: &str, fallback: &'static str) -> axum::http::HeaderValue {
    s.parse()
        .unwrap_or_else(|_| fallback.parse().expect("static fallback header must parse"))
}

#[derive(RustEmbed)]
#[folder = "../web/dist"]
struct WebAssets;

#[derive(Clone)]
pub struct AppState {
    // Note: std Mutex (not tokio) is intentional here. Every critical section
    // is short and synchronous with no .await while holding the guard, so the
    // executor is never blocked across a yield. Poison recovery via
    // unwrap_or_else keeps one panicking handler from bricking a slot.
    pub controllers: Arc<Vec<Mutex<ControllerSlot>>>,
    pub driver_status: DriverStatus,
    pub pairing: PairingManager,
    pub diagnostics: Diagnostics,
    pub port: u16,
    pub disconnect_notify: Arc<broadcast::Sender<Option<usize>>>,
    /// Serializes slot scan+claim so two concurrent WS upgrades cannot
    /// both observe the same empty slot (TOCTOU double-assign).
    /// Held only for the short synchronous claim section, never across await.
    pub slot_claim: Arc<Mutex<()>>,
}

/// Max forward jump in packet sequence numbers before a packet is treated
/// as a skip attack. Legit resends are small; a +2B jump would otherwise
/// permanently wedge the session (all future legit packets look "old").
pub const MAX_SEQUENCE_JUMP: u32 = 128;
/// Consecutive malformed packets before a socket is dropped.
pub const MAX_CONSECUTIVE_MALFORMED: usize = 50;
/// Largest binary WS message we process (input=19B, ping/pong=7B, rumble=5B).
pub const MAX_BINARY_MESSAGE: usize = 64;
/// Largest text WS message we parse ({"rttMs":N} is <32B).
pub const MAX_TEXT_MESSAGE: usize = 1024;
/// Client-reported RTT above this is ignored (dashboard poisoning guard).
pub const MAX_RTT_MS: u32 = 5000;
/// Minimum interval between Ping→Pong echoes (ping-flood throttle).
pub const PING_THROTTLE: Duration = Duration::from_millis(100);
/// How often the server pings the phone to measure RTT itself instead of
/// trusting the client's self-reported `rttMs`.
pub const SERVER_PING_INTERVAL: Duration = Duration::from_secs(5);
/// Minimum spacing between input packets; faster streams are floods
/// (legit phones send at 60–120Hz = 8–16ms).
pub const MIN_INPUT_INTERVAL: Duration = Duration::from_millis(5);

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
            headers.insert(
                header::CONTENT_TYPE,
                header_value(mime.as_ref(), "application/octet-stream"),
            );
            let cache_control =
                if path == "index.html" || path == "sw.js" || path == "manifest.webmanifest" {
                    "no-cache, no-store, must-revalidate"
                } else if path.starts_with("assets/") {
                    "public, max-age=31536000, immutable"
                } else {
                    "public, max-age=3600"
                };
            headers.insert(
                header::CACHE_CONTROL,
                header_value(cache_control, "no-cache"),
            );
            (StatusCode::OK, headers, content.data).into_response()
        }
        None => {
            // SPA fallback: return index.html
            if let Some(index) = WebAssets::get("index.html") {
                let mut headers = HeaderMap::new();
                headers.insert(
                    header::CONTENT_TYPE,
                    header_value("text/html; charset=utf-8", "text/html"),
                );
                headers.insert(
                    header::CACHE_CONTROL,
                    header_value("no-cache, no-store, must-revalidate", "no-cache"),
                );
                (StatusCode::OK, headers, index.data).into_response()
            } else {
                (StatusCode::NOT_FOUND, "Not Found").into_response()
            }
        }
    }
}

/// Status API for desktop dashboard.
/// P0: pairing code + client IPs are only disclosed to loopback callers
/// (the dashboard running on the host). LAN callers get redacted fields
/// so a stolen `/api/status` response cannot be used to pair.
async fn api_status(
    ConnectInfo(remote_addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
) -> Json<StatusResponse> {
    let trusted = is_loopback_addr(&remote_addr);
    let snap = state.diagnostics.snapshot();
    let controller_slots = state.controllers.len();
    let active_clients = snap.slots.iter().filter(|s| s.connected).count();
    // Never leak the pairing code off-host. Dashboard on the PC (loopback)
    // needs it for the QR code; phones polling this endpoint do not.
    let code = if trusted {
        state.pairing.get_pairing_code()
    } else {
        String::new()
    };
    let local_ip = NetworkUtils::get_primary_local_ip().to_string();
    let server_url = format!("http://{local_ip}:{}", state.port);
    let ip_candidates = NetworkUtils::get_local_ip_candidates();

    let (driver_installed, driver_name, driver_reason, help_url) = match &state.driver_status {
        DriverStatus::Available { backend } => (true, *backend, None, None),
        DriverStatus::DriverMissing { reason, help_url } => (
            false,
            "Driver Missing",
            Some(reason.clone()),
            Some(*help_url),
        ),
    };

    // Redact client IPs for untrusted callers (privacy + anti-recon).
    let (active_client_ip, slots) = if trusted {
        (snap.active_client_ip, snap.slots)
    } else {
        let redacted = snap
            .slots
            .into_iter()
            .map(|mut s| {
                s.client_ip = None;
                s
            })
            .collect();
        (None, redacted)
    };

    Json(StatusResponse {
        status: if driver_installed {
            "ok"
        } else {
            "driver_missing"
        },
        driver_installed,
        driver_name,
        driver_reason,
        help_url,
        pairing_code: code,
        server_url,
        ip_addresses: ip_candidates,
        port: state.port,
        active_client_connected: snap.active_client_connected,
        active_client_ip,
        active_clients,
        controller_slots,
        packets_received: snap.packets_received,
        rtt_ms: snap.current_rtt_ms,
        uptime_secs: snap.uptime_secs,
        slots,
    })
}

/// Safe disconnect endpoint from dashboard.
/// P0: loopback-only. Any LAN host could otherwise kick all players
/// in a loop and make the controller unusable.
async fn api_disconnect(
    ConnectInfo(remote_addr): ConnectInfo<SocketAddr>,
    Query(query): Query<DisconnectQuery>,
    State(state): State<AppState>,
) -> Response {
    if !is_loopback_addr(&remote_addr) {
        warn!("Rejected /api/disconnect from non-loopback {remote_addr}");
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({ "error": "Disconnect is only allowed from the host dashboard" })),
        )
            .into_response();
    }
    let target_slot = query.slot;
    let _ = state.disconnect_notify.send(target_slot);

    // Helper: clear one slot and revoke its token so it cannot reconnect.
    let clear_slot = |idx: usize| {
        let revoked = {
            let mut slot = state.controllers[idx]
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            if let Err(error) = slot.controller.reset_neutral() {
                warn!("Failed to reset controller slot {idx} during disconnect: {error}");
            }
            let revoked = slot.session_token.clone();
            slot.session_id = None;
            slot.client_ip = None;
            slot.session_token = None;
            revoked
        };
        if let Some(token) = revoked {
            state.pairing.invalidate(&token);
        }
        state.diagnostics.set_slot_client(idx, None);
    };

    match target_slot {
        Some(idx) if idx < state.controllers.len() => {
            clear_slot(idx);
            info!("Controller slot {idx} disconnected via dashboard API");
        }
        _ => {
            for idx in 0..state.controllers.len() {
                clear_slot(idx);
            }
            info!("All phone sessions disconnected via dashboard API");
        }
    }

    StatusCode::OK.into_response()
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

    // CSWSH protection: validate Origin when a browser sends one.
    // Missing header = non-browser client (allowed, still needs code/token).
    if let Some(origin) = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        if !is_origin_allowed(origin) {
            warn!("Rejected WebSocket connection with untrusted Origin: {origin}");
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({ "error": "Cross-origin WebSocket connection forbidden" })),
            )
                .into_response();
        }
    } else {
        // Log unauthenticated non-browser attempts at debug; auth below decides.
        tracing::debug!("WebSocket upgrade from {remote_ip} without Origin header");
    }

    // Verify pairing code or token. Distinguish rate-limit (429) from bad
    // credentials (401) so legit users know to wait instead of retyping.
    if let Some(ref token) = query.token {
        if state.pairing.verify_token(token, &remote_ip) {
            // ok below
        } else {
            warn!("Rejected WebSocket with invalid token from {remote_ip}");
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "error": "Invalid pairing code or expired token" })),
            )
                .into_response();
        }
    } else if let Some(ref code) = query.code {
        match state.pairing.verify_code(&remote_ip, code) {
            Ok(new_token) => {
                // Issue token via query path: stash it so the slot-claim
                // below treats it as the session token.
                // (We re-verify via the freshly minted token.)
                debug_assert!(state.pairing.verify_token(&new_token, &remote_ip));
                return claim_slot_and_upgrade(ws, state, remote_ip, new_token).await;
            }
            Err(VerifyError::RateLimited) => {
                warn!("Rate-limited pairing attempt from {remote_ip}");
                return (
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(
                        serde_json::json!({ "error": "Too many failed attempts. Please wait 30 seconds." }),
                    ),
                )
                    .into_response();
            }
            Err(VerifyError::Invalid) => {
                warn!("Rejected WebSocket with invalid pairing code from {remote_ip}");
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(serde_json::json!({ "error": "Invalid pairing code or expired token" })),
                )
                    .into_response();
            }
        }
    } else {
        warn!("Rejected unauthenticated WebSocket connection attempt from {remote_ip}");
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Invalid pairing code or expired token" })),
        )
            .into_response();
    }

    // Token path (already verified above).
    let session_token = query.token.unwrap();
    claim_slot_and_upgrade(ws, state, remote_ip, session_token).await
}

/// Shared slot-claim + upgrade step for both code and token auth paths.
async fn claim_slot_and_upgrade(
    ws: WebSocketUpgrade,
    state: AppState,
    remote_ip: String,
    session_token: String,
) -> Response {
    // Serialize scan+claim: the guard is dropped before on_upgrade runs,
    // so no await happens while holding it.
    let _claim_guard = state.slot_claim.lock().unwrap_or_else(|e| {
        warn!("Slot-claim mutex poisoned; recovering");
        e.into_inner()
    });
    // 1. Check if this client already owns a slot (reconnecting by token)
    let mut assigned_slot_index = None;
    for (idx, slot_mutex) in state.controllers.iter().enumerate() {
        let slot = slot_mutex.lock().unwrap_or_else(|e| e.into_inner());
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
                let slot = slot_mutex.lock().unwrap_or_else(|e| e.into_inner());
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
                        Json(
                            serde_json::json!({ "error": "All four controller slots are in use" }),
                        ),
                    )
                        .into_response();
                }
            }
        }
    };

    let session_id = rand::random::<u64>();
    {
        let mut slot = state.controllers[slot_index]
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        slot.session_id = Some(session_id);
        slot.client_ip = Some(remote_ip.clone());
        slot.session_token = Some(session_token.clone());
    }
    drop(_claim_guard);

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
    state
        .diagnostics
        .set_slot_client(slot_index, Some(client_ip.clone()));

    // Reset controller to neutral on connect
    {
        let mut slot = state.controllers[slot_index]
            .lock()
            .unwrap_or_else(|e| e.into_inner());
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
    watchdog
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .on_session_start();

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
                        let mut wd = watchdog_clone.lock()
            .unwrap_or_else(|e| e.into_inner());
                        wd.check()
                    };
                    match action {
                        WatchdogAction::ResetNeutral => {
                            let mut slot = controllers_clone[slot_index].lock()
            .unwrap_or_else(|e| e.into_inner());
                            if slot.session_id == Some(session_id) {
                                if let Err(error) = slot.controller.reset_neutral() {
                                    warn!("Failed to reset stale controller slot {slot_index}: {error}");
                                }
                                diag_clone.record_stale_reset();
                            }
                        }
                        WatchdogAction::DropSession => {
                            warn!("Watchdog: connection timed out for slot {slot_index}, dropping session");
                            let mut slot = controllers_clone[slot_index].lock()
            .unwrap_or_else(|e| e.into_inner());
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
    let mut consecutive_malformed: usize = 0;
    let mut last_pong = std::time::Instant::now()
        .checked_sub(PING_THROTTLE)
        .unwrap_or_else(std::time::Instant::now);
    // P3: server-measured RTT + input flood guard state.
    let mut server_ping_tick = tokio::time::interval(SERVER_PING_INTERVAL);
    // Skip the immediate first tick (interval fires at t=0).
    server_ping_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut server_ping_seq: u32 = 0;
    let mut server_ping_sent: Option<(u32, std::time::Instant)> = None;
    let mut last_input_at: Option<std::time::Instant> = None;
    let mut rumble_rx = {
        let slot = state.controllers[slot_index]
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        slot.controller.subscribe_rumble()
    };

    // Socket input loop
    loop {
        tokio::select! {
            _ = server_ping_tick.tick() => {
                // P3: server-measured RTT. Timestamp is millis since loop
                // start; the phone echoes it in a Pong (see decodePing).
                server_ping_seq = server_ping_seq.wrapping_add(1);
                let ts = server_ping_seq;
                server_ping_sent = Some((ts, std::time::Instant::now()));
                let ping = Protocol::encode_ping(ts);
                if socket.send(Message::Binary(ping.to_vec())).await.is_err() {
                    break;
                }
            }
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
                        // P1: session check BEFORE side-effects so a superseded
                        // socket cannot bump the new session's watchdog/diagnostics.
                        let stale = {
                            let slot = state.controllers[slot_index]
                                .lock()
                                .unwrap_or_else(|e| e.into_inner());
                            slot.session_id != Some(session_id)
                        };
                        if stale {
                            break;
                        }
                        if bytes.len() > MAX_BINARY_MESSAGE {
                            state.diagnostics.record_malformed_packet();
                            consecutive_malformed += 1;
                            if consecutive_malformed >= MAX_CONSECUTIVE_MALFORMED {
                                warn!("Slot {slot_index}: too many oversize packets, dropping session");
                                break;
                            }
                            continue;
                        }
                        state.diagnostics.record_slot_packet(slot_index, bytes.len());
                        match Protocol::decode(&bytes) {
                            Ok(Packet::Input(input)) => {
                                // P3: input flood guard (no new deps). Legit
                                // phones run 60–120Hz; faster = flood.
                                let now = std::time::Instant::now();
                                if let Some(last) = last_input_at {
                                    if now.duration_since(last) < MIN_INPUT_INTERVAL {
                                        state.diagnostics.record_malformed_packet();
                                        consecutive_malformed += 1;
                                        if consecutive_malformed >= MAX_CONSECUTIVE_MALFORMED {
                                            warn!("Slot {slot_index}: input flood, dropping session");
                                            break;
                                        }
                                        continue;
                                    }
                                }
                                last_input_at = Some(now);
                                if let Some(previous) = last_sequence {
                                    let delta = input.sequence.wrapping_sub(previous);
                                    if delta == 0 || delta > MAX_SEQUENCE_JUMP {
                                        state.diagnostics.record_malformed_packet();
                                        consecutive_malformed += 1;
                                        if consecutive_malformed >= MAX_CONSECUTIVE_MALFORMED {
                                            warn!("Slot {slot_index}: too many malformed packets, dropping session");
                                            break;
                                        }
                                        continue;
                                    }
                                }
                                last_sequence = Some(input.sequence);
                                consecutive_malformed = 0;
                                watchdog.lock()
            .unwrap_or_else(|e| e.into_inner()).on_input_received();
                                let ctrl_state = ControllerState::from_raw_packet(&input);

                                let mut slot = state.controllers[slot_index].lock()
            .unwrap_or_else(|e| e.into_inner());
                                if slot.session_id != Some(session_id) {
                                    break;
                                }
                                if let Err(e) = slot.controller.update(&ctrl_state) {
                                    error!("Virtual controller slot {slot_index} update failed: {e}");
                                }
                            }
                            Ok(Packet::Ping(timestamp)) => {
                                consecutive_malformed = 0;
                                let now = std::time::Instant::now();
                                if now.duration_since(last_pong) < PING_THROTTLE {
                                    continue;
                                }
                                last_pong = now;
                                let pong = Protocol::encode_pong(timestamp);
                                if socket.send(Message::Binary(pong.to_vec())).await.is_err() {
                                    break;
                                }
                            }
                            Ok(Packet::Pong(ts)) => {
                                // P3: answer to our server keepalive → authoritative RTT.
                                // Anything else is an unsolicited client pong → probe.
                                match server_ping_sent {
                                    Some((seq, sent_at)) if seq == ts => {
                                        let rtt = sent_at.elapsed().as_millis().min(u128::from(MAX_RTT_MS)) as u32;
                                        state.diagnostics.record_slot_rtt(slot_index, rtt);
                                        server_ping_sent = None;
                                        consecutive_malformed = 0;
                                    }
                                    _ => {
                                        state.diagnostics.record_malformed_packet();
                                        consecutive_malformed += 1;
                                        if consecutive_malformed >= MAX_CONSECUTIVE_MALFORMED {
                                            warn!("Slot {slot_index}: too many unexpected packets, dropping session");
                                            break;
                                        }
                                    }
                                }
                            }
                            Ok(Packet::Rumble { .. }) => {
                                // Client must never send these; count as probe/fuzz.
                                state.diagnostics.record_malformed_packet();
                                consecutive_malformed += 1;
                                if consecutive_malformed >= MAX_CONSECUTIVE_MALFORMED {
                                    warn!("Slot {slot_index}: too many unexpected packets, dropping session");
                                    break;
                                }
                            }
                            Err(_) => {
                                state.diagnostics.record_malformed_packet();
                                consecutive_malformed += 1;
                                if consecutive_malformed >= MAX_CONSECUTIVE_MALFORMED {
                                    warn!("Slot {slot_index}: too many malformed packets, dropping session");
                                    break;
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Text(text))) => {
                        if text.len() > MAX_TEXT_MESSAGE {
                            state.diagnostics.record_malformed_packet();
                            continue;
                        }
                        if let Ok(message) = serde_json::from_str::<serde_json::Value>(&text) {
                            if let Some(rtt_ms) = message.get("rttMs").and_then(|value| value.as_u64()) {
                                if rtt_ms > u64::from(MAX_RTT_MS) {
                                    warn!("Slot {slot_index}: ignoring implausible rttMs={rtt_ms}");
                                } else {
                                    state.diagnostics.record_slot_rtt(slot_index, rtt_ms as u32);
                                    consecutive_malformed = 0;
                                }
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

    watchdog
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .on_session_end();
    if cleanup_controller_slot(&state, slot_index, session_id) {
        state.diagnostics.set_slot_client(slot_index, None);
        info!("Controller session for slot {slot_index} cleaned up cleanly");
    } else {
        info!("Controller session for slot {slot_index} superseded by new session; preserved new slot state");
    }
}

fn cleanup_controller_slot(state: &AppState, slot_index: usize, session_id: u64) -> bool {
    // NOTE: the session token is deliberately NOT revoked here. A socket
    // close (network drop, tab backgrounded, effect teardown) must not burn
    // the phone's reconnect token — otherwise every transient drop forces a
    // full code re-pair and the client loops on the pairing modal. Only an
    // explicit host kick (api_disconnect) revokes tokens.
    let mut slot = state.controllers[slot_index].lock().unwrap_or_else(|e| {
        warn!("Controller slot {slot_index} mutex poisoned; recovering");
        e.into_inner()
    });
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_origin_allowlist() {
        // Loopback
        assert!(is_origin_allowed("http://localhost:3000"));
        assert!(is_origin_allowed("https://localhost"));
        assert!(is_origin_allowed("http://127.0.0.1:3000"));
        assert!(is_origin_allowed("http://[::1]:3000"));
        // RFC1918
        assert!(is_origin_allowed("http://192.168.1.2:3000"));
        assert!(is_origin_allowed("http://10.0.0.5"));
        assert!(is_origin_allowed("http://172.16.0.2"));
        assert!(is_origin_allowed("http://172.31.255.1:8080"));
        // Rejected: prefix-bypass, overbroad 172, external, bad scheme
        assert!(!is_origin_allowed("http://192.168.evil.com"));
        assert!(!is_origin_allowed("http://10.evil.com"));
        assert!(!is_origin_allowed("http://172.evil.com"));
        assert!(!is_origin_allowed("http://172.0.0.1"));
        assert!(!is_origin_allowed("http://172.15.0.1"));
        assert!(!is_origin_allowed("http://172.32.0.1"));
        assert!(!is_origin_allowed("http://8.8.8.8:3000"));
        assert!(!is_origin_allowed("https://example.com"));
        assert!(!is_origin_allowed("file://localhost"));
        assert!(!is_origin_allowed("http://attacker.com"));
        assert!(!is_origin_allowed("http://[::2]:3000"));
        assert!(!is_origin_allowed(""));
    }
}
