<div align="center">

# 🎮 PocketPad

**Turn any Android phone into a real Xbox 360 controller for Windows — over Wi-Fi, no app install.**

[![Windows](https://img.shields.io/badge/Windows-10%2F11%20x64-0078D6?style=flat-square&logo=windows)](https://github.com/nefarius/ViGEmBus/releases)
[![Rust](https://img.shields.io/badge/host-Rust-dea584?style=flat-square&logo=rust)](./host)
[![Preact](https://img.shields.io/badge/client-Preact-673ab8?style=flat-square&logo=preact)](./web)
[![License: MIT](https://img.shields.io/badge/License-MIT-16d98a?style=flat-square)](./LICENSE)

*Genuine XInput emulation · ~2–6 ms Wi-Fi RTT · single self-contained `.exe` · up to 4 players*

</div>

---

## ✨ Why PocketPad?

| | |
|:---|:---|
| 🎮 **Real hardware-level gamepad** | Windows sees an actual Xbox 360 controller via ViGEmBus. Games work immediately — even ones with no keyboard-remapping option. |
| 📱 **No Android app** | Scan the desktop QR code and play in mobile Chrome. Multi-touch Pointer Events, zero installs. |
| ⚡ **Ultra-low latency** | Zero-allocation input loop. Fixed 19-byte binary WebSocket frames at up to 120 Hz. |
| 📦 **One binary** | The Rust host embeds the entire dashboard + controller UI. No Node, Python, Java, or Electron needed to run. |
| 👥 **Four players** | Up to four phones connect at once, each on its own virtual controller slot. |
| 🛡️ **Failsafe by design** | 250 ms neutral-reset watchdog + 2 s session drop. A dead phone can never leave a stuck button. |
| 🔐 **LAN-grade security** | 6-char pairing codes, per-IP rate limits, code rotation under brute force, IP-bound short-lived tokens. |

---

## 🗺️ Contents

- [How it works](#-how-it-works)
- [Binary protocol](#-binary-protocol)
- [Quick start](#-quick-start)
- [Security model](#-security-model)
- [Building from source](#️-building-from-source)
- [Testing & CI](#-testing--ci)
- [Configuration](#️-configuration)
- [Troubleshooting](#-troubleshooting)
- [Project layout](#-project-layout)
- [Future work](#-future-work)
- [Safety & failsafe](#️-safety--failsafe)
- [License](#-license)

---

## 🎮 How It Works

```
Android Phone (Chrome)
 ├── Touch Pointer Events (per-frame coalesced, zero-alloc encoder)
 └── 19-byte binary frames ──► ArrayBuffer over WebSocket ──┐
                                                             │  Local Wi-Fi / LAN
Windows PC (PocketPad Host)                                  │
 ├── Axum WebSocket server (Tokio async)                  ◄──┘
 ├── Sequence + flood + size guards
 ├── XInput deadzone sanitize (±7849)
 ├── Four independent controller sessions
 ├── Watchdog failsafe (250 ms neutral reset / 2 s drop)
 ├── VirtualController trait abstraction
 └── ViGEmBus kernel driver ──► XInput ──► Games / Steam / Emulators
```

The phone sends only *what changed* (plus a 100 ms heartbeat); the host validates, sanitizes, and pushes state into the kernel driver. The dashboard polls `/api/status` and talks to `/api/disconnect` — both host-only where it matters (see [Security model](#-security-model)).

---

## 📦 Binary Protocol

Little-endian binary frames over a single WebSocket. Exact lengths are enforced — anything else drops the frame, and 50 consecutive malformed frames drop the socket.

**Input (`0x01`, 19 bytes, phone → host):**

| Bytes | Field | Type | Notes |
|:---|:---|:---|:---|
| `0` | Magic | `u8` | Always `0x50` (`'P'`) |
| `1` | Version | `u8` | `0x01` |
| `2` | Type | `u8` | `0x01` = Input |
| `3–6` | Sequence | `u32 LE` | Monotonic counter; replays/dupes dropped, jumps > 128 rejected |
| `7–8` | Buttons | `u16 LE` | XInput bitfield (A, B, X, Y, D-pad, bumpers, stick clicks, Guide…) |
| `9` | Left trigger | `u8` | `0` released … `255` fully depressed |
| `10` | Right trigger | `u8` | Same |
| `11–12` | Thumb LX | `i16 LE` | `-32768` … `32767` |
| `13–14` | Thumb LY | `i16 LE` | Up is positive |
| `15–16` | Thumb RX | `i16 LE` | Same |
| `17–18` | Thumb RY | `i16 LE` | Up is positive |

**Keep-alive & feedback:**

| Type | Size | Direction | Purpose |
|:---|:---|:---|:---|
| `0x02` Ping | 7 B | either | RTT keepalive (`u32` timestamp). Server pings every 5 s and measures the reply itself; client pings every 1 s. |
| `0x03` Pong | 7 B | either | Echo of a Ping timestamp. |
| `0x04` Rumble | 5 B | host → phone | `(large_motor, small_motor)` force feedback → phone haptics. |

> Parity is enforced in CI on both sides: `host/src/protocol.rs` unit tests and `web/src/protocol/binary_protocol.test.ts` (`pnpm test`) cover the same layouts, so drift breaks the build.

---

## 🚀 Quick Start

### Requirements

- 🖥️ **Windows 10 / 11 x64**
- 📱 **Android phone** on the same Wi-Fi network (Chrome recommended)
- 🎮 **ViGEmBus driver** (one-time setup below)

### 1 · Install ViGEmBus

PocketPad uses the open-source [ViGEmBus driver](https://github.com/nefarius/ViGEmBus) by Nefarius for authentic Xbox 360 emulation:

1. Download [ViGEmBus v1.22.0](https://github.com/nefarius/ViGEmBus/releases) and run the installer.
2. Reboot if the installer asks — Windows only picks up the virtual bus after a restart.
3. ViGEmBus is archived but feature-complete; it remains the gold standard for 360 emulation on Windows 10/11. PocketPad hides it behind a `VirtualController` trait, so future backends plug in without breaking changes.

### 2 · Launch

```powershell
.\bin\pocketpad.exe
# or from source:  .\scripts\run-dev.ps1
```

| Flag / env | Effect |
|:---|:---|
| `--port 3000` · `-p 3000` · `--port=3000` · `POCKETPAD_PORT=3000` | Bind port (default `3000`; auto-falls-back to `port+1` if occupied) |
| `--no-browser` | Don't auto-open the dashboard |

The dashboard opens at `http://localhost:3000/?mode=dashboard`.

### 3 · Pair your phone

1. Scan the **QR code** on the dashboard with your phone camera — or open the shown LAN URL in Chrome.
2. Enter the **6-character pairing code** from the host screen.
3. Flip to landscape and play! 🎮 Repeat on up to three more phones for local multiplayer — each gets its own controller slot. Full slots reject newcomers with `409` until a slot frees up or the dashboard disconnects one.

> The code is for first contact only. The host immediately issues an **IP-bound reconnect token (8 h)** that lives in the phone's `localStorage` — later drops reconnect silently with zero typing. Tokens survive transient disconnects and are revoked only when the dashboard explicitly kicks the session.

### 4 · Verify in Windows

1. Press `Win + R`, type `joy.cpl`, hit Enter.
2. You should see **Controller (Xbox 360 for Windows)** — status **OK**.
3. Double-click it: buttons, triggers, and sticks respond live to your phone.

---

## 🔐 Security Model

Designed for a **trusted home LAN** — not an open café network (there is no TLS yet; see [Future work](#-future-work)).

- **Pairing codes**: 6 chars from a 32-symbol alphabet (~1 B combos), compared in constant time, case/whitespace tolerant. 5 failures per IP per 30 s → `429`; 20 failures LAN-wide rotates the code out from under the attacker.
- **Tokens**: 128-bit random, IP-bound (loopback forms treated as equivalent), 8 h TTL, sliding cleanup every 30 s. Survive socket drops so reconnects are seamless; revoked on host kick.
- **No LAN leakage**: `GET /api/status` returns the pairing code and client IPs **only to `localhost`**. Remote viewers get redacted fields — pair from the host screen. `POST /api/disconnect` is host-only (`403` otherwise).
- **Handshake hygiene**: strict `Origin` allowlist (exact private-range match — `192.168.evil.com` tricks rejected), `401` vs `429` so users know whether to retype or wait.
- **Data-plane guards**: exact-length frames, 5 ms input floor (floods), 50-strike disconnect, sequence window of 128, `rttMs` clamped to 5000 ms, client `Pong`/`Rumble` treated as probes.

---

## 🛠️ Building from Source

**Prerequisites:** Node.js 18+ with PNPM (`corepack enable`) · Rust stable (`rustup-init.exe`) · ViGEmBus for live controller targets.

```powershell
.\scripts\build.ps1               # full build → bin/pocketpad.exe + SHA256
.\scripts\build.ps1 -SkipFrontend # reuse web/dist (must already exist)
.\scripts\build.ps1 -NoClean      # incremental Rust build (faster iteration)
.\scripts\build.ps1 -SkipBackend  # frontend only
```

What it does:

1. `web/` → Vite + TypeScript + Preact → `web/dist` (`pnpm install --frozen-lockfile`, reproducible).
2. `host/` → Cargo `--locked --release` (fat LTO, stripped) → `bin/pocketpad.exe` (~2 MB, UI embedded).

<details>
<summary><b>Build notes & gotchas</b></summary>

- `bin/`, `web/dist/`, `target/` are gitignored — a fresh clone has **no binary or UI**. Build first.
- Expect a multi-minute LTO link and ~1 GB of `target/` disk.
- If the copy fails with a file lock, a `pocketpad.exe` is still running (or AV is scanning) — the script retries 5×, then prints the SHA256.
- `cargo run` from a checkout without `web/dist` fails fast with a "build the frontend first" message instead of a cryptic embed error.
- Frontend-only iteration: `pnpm --dir web dev` (Vite on `:5173`, proxies `/api` + `/ws` to the Rust host on `:3000`) alongside `cargo run`. No Rust rebuild per CSS tweak.
- `RUST_LOG=debug` turns on WebSocket auth/Origin diagnostics.

</details>

---

## ✅ Testing & CI

```powershell
.\scripts\test.ps1   # tsc --noEmit · vitest · cargo test --locked --all-targets · clippy -D warnings · fmt --check
```

- **Rust** — 23 unit + 5 integration tests: protocol vectors, pairing (rate limits, rotation, revocation), watchdog timelines, sanitize/deadzone, origin allowlist, multi-slot pipeline.
- **Web** — 6 vitest parity tests locking the binary layout against the Rust side.
- **CI** (`.github/workflows/ci.yml`, Windows) runs every gate above plus a release build, uploading `pocketpad.exe` + `.sha256`. Dependabot watches Cargo and npm weekly. `Cargo.lock` is committed.

---

## ⚙️ Configuration

| Setting | Where | Notes |
|:---|:---|:---|
| Bind port | `--port` / `POCKETPAD_PORT` (default `3000`) | Falls back to `port+1` when occupied |
| Auto-open browser | `--no-browser` | Skip the dashboard pop-up |
| Log level | `RUST_LOG` (`info` default, `debug` for auth traces) | `tracing` env filter |
| Stick sensitivity / deadzone / invert / southpaw / haptics | Phone ⚙️ or dashboard Settings | Synced live, persisted to `localStorage` |
| Control scale (0.8–1.2×) | Phone ⚙️ or dashboard Settings | Phone layout zoom for small screens |
| Watchdog thresholds | Host constants (250 ms / 2 s) | Display-only in the dashboard by design |

---

## 🩺 Troubleshooting

<details>
<summary><b>Pairing code rejected / "too many attempts"</b></summary>

Codes are 6 characters, letters + digits (no `0`/`O`/`1`/`I`/`L` to avoid mix-ups). After 5 wrong tries from one IP, wait 30 s. After 20 wrong tries LAN-wide the host rotates the code — read the fresh one off the host screen, not a photo of the old QR.

</details>

<details>
<summary><b>Pairing popup keeps appearing / token rejected in a loop</b></summary>

Clear the phone's stale credential once: dashboard Settings → **Data & Privacy → Clear All Pairings** (or clear the site's `localStorage`), then pair fresh with the current host code. If it persists, check the host log (`RUST_LOG=debug`) for `invalid token` vs `RateLimited` — the status code tells you whether to retype (`401`) or wait (`429`).

</details>

<details>
<summary><b>Dashboard on another device shows no pairing code</b></summary>

By design — codes and client IPs are disclosed only to `localhost`. Pair from the host screen.

</details>

<details>
<summary><b>Port already in use</b></summary>

The host automatically tries `port+1` and prints the actual URL + QR for that port. Or set `--port` / `POCKETPAD_PORT` explicitly.

</details>

<details>
<summary><b>`cargo test` fails with `Access denied` on `target\debug\pocketpad.exe`</b></summary>

A previous debug build is still running. `Stop-Process -Name pocketpad` and rerun.

</details>

<details>
<summary><b>`joy.cpl` shows nothing / driver missing</b></summary>

Install ViGEmBus (above) and reboot. The host prints `Driver Missing` with a help link and keeps serving the dashboard in diagnostic mode until the driver appears.

</details>

---

## 🗂️ Project Layout

```
PocketPad
├── host/                  # Rust Windows host (Axum + Tokio + ViGEmBus)
│   ├── src/
│   │   ├── server.rs      # HTTP + WebSocket + sessions + guards
│   │   ├── pairing.rs     # Codes, rate limits, rotation, tokens
│   │   ├── protocol.rs    # Binary frame codec + vectors
│   │   ├── watchdog.rs    # 250 ms / 2 s failsafe
│   │   ├── controller_state.rs  # XInput state + deadzone sanitize
│   │   ├── virtual_controller.rs# ViGEmBus backend + mock
│   │   ├── diagnostics.rs # Counters + per-slot telemetry
│   │   └── network.rs     # LAN IP discovery + URL builders
│   └── tests/             # End-to-end pipeline tests
├── web/                   # Preact dashboard + phone controller (Vite)
│   └── src/
│       ├── controller/    # Phone gamepad (sticks, pads, triggers)
│       ├── dashboard/     # Desktop Big-Picture-style UI
│       ├── protocol/      # Zero-alloc binary encoder (+ parity tests)
│       └── settings/
├── scripts/               # build.ps1 · test.ps1 · run-dev.ps1
└── .github/workflows/     # Windows CI + Dependabot
```

---

## 🔮 Future Work

Deliberately deferred — each needs a dependency, a protocol break, or a UX decision:

- **TLS (`rustls`)** — `https`/`wss` for untrusted LANs. Fine on home Wi-Fi as-is; not for open networks.
- **Dependency upgrades** — `axum 0.7→0.8`, `rand 0.8→0.9` (breaking APIs, no driver today).
- **Per-IP data-plane token bucket** (e.g. `governor`) — handshake is rate-limited; post-auth floods are bounded by the 5 ms floor + 50-strike disconnect.
- **PWA precache** — `sw.js` is network-first and skips hashed assets; first offline load needs a prior online visit. `vite-plugin-pwa` would fix versioning.
- **Async locks** — `std::sync::Mutex` is intentional (short, never held across `.await`). Revisit only if a lock ever spans an await.
- **Live input stream** — the dashboard shows session telemetry (packets/RTT/IP) rather than a fake live preview, by design.

---

## 🛡️ Safety & Failsafe Watchdog

If a phone loses Wi-Fi or closes its browser mid-game:

1. **250 ms neutral reset** — buttons, triggers, and sticks snap to neutral.
2. **2.0 s session drop** — the session is formally dropped and logged.
3. **Clean shutdown** — Ctrl+C sends neutral state, unplugs the virtual device, and releases driver handles.

---

## 📄 License

PocketPad is open source under the **MIT License**. See [LICENSE](LICENSE) for details.
</div>
