# PocketPad

**Ultra-low-latency Wireless Android-to-Windows Virtual Xbox 360 Controller**

PocketPad transforms your Android phone into a genuine, hardware-level virtual Xbox 360 controller on Windows 10/11 x64 over your local Wi-Fi network. No Android APK installation required — it runs directly in mobile Chrome with multi-touch Pointer Events and zero-allocation binary WebSocket frames.

---

## ⚡ Key Highlights

- **Genuine XInput / Xbox 360 Emulation**: Windows detects an actual Xbox 360 Gamepad via ViGEmBus. Games (even those without keyboard remapping) work immediately.
- **Zero Android App Needed**: Scan the desktop QR code to open the gamepad interface in mobile Chrome.
- **Ultra-Low Latency (~2-6 ms Wi-Fi RTT)**: Zero heap allocations in the input loop. Fixed 19-byte binary WebSocket packet stream at 60–120Hz.
- **Single Self-Contained Binary**: The Rust Windows host embeds all HTML, CSS, and Preact assets. No Node.js, Python, Java, or Electron runtime required to run.
- **Hardware Multi-Touch**: Simultaneous dual analog sticks, triggers, face buttons, and bumpers using browser Pointer Capture.
- **Four-Player Support**: Up to four phones can connect at once, each mapped to its own virtual Xbox 360 controller slot.
- **Safety Watchdog (250 ms / 2.0 s)**: Automatic neutral state reset after 250 ms of stale input prevents stuck buttons or runaway axes.
- **Session Security**: Pairing codes are rate-limited per client IP; authenticated clients receive short-lived IP-bound reconnect tokens.

---

## 🎮 Input Pipeline Architecture

```
Android Phone (Chrome)
    ├── Touch Pointer Events (Zero-DOM transform)
    └── 19-byte Binary Packets (ArrayBuffer over WebSocket)
            │  (Local Wi-Fi / LAN)
            ▼
Windows PC (PocketPad Host)
    ├── Axum WebSocket Server (Tokio async)
    ├── Watchdog Failsafe (250 ms neutral reset)
    ├── Four Independent Controller Sessions
    ├── VirtualController Trait Abstraction
    └── ViGEmBus Kernel Driver
            │  (XInput)
            ▼
Games / Steam / Emulators
```

---

## 📦 Binary Protocol Specification

Inputs are streamed over WebSocket using a fixed 19-byte binary layout (little-endian):

| Byte Offset | Field | Type | Description |
|:---|:---|:---|:---|
| `0` | Magic | `u8` | Always `0x50` ('P') |
| `1` | Version | `u8` | Protocol version (`0x01`) |
| `2` | Packet Type | `u8` | `0x01` = Input, `0x02` = Ping, `0x03` = Pong |
| `3..6` | Sequence | `u32 LE` | Monotonic frame sequence counter |
| `7..8` | Buttons | `u16 LE` | XInput button bitfield (A, B, X, Y, D-Pad, etc.) |
| `9` | Left Trigger | `u8` | LT (0 = released, 255 = fully depressed) |
| `10` | Right Trigger | `u8` | RT (0 = released, 255 = fully depressed) |
| `11..12` | Thumb LX | `i16 LE` | Left stick X (-32768 to 32767) |
| `13..14` | Thumb LY | `i16 LE` | Left stick Y (-32768 to 32767, Up is positive) |
| `15..16` | Thumb RX | `i16 LE` | Right stick X (-32768 to 32767) |
| `17..18` | Thumb RY | `i16 LE` | Right stick Y (-32768 to 32767, Up is positive) |

---

## 🚀 Quick Start Guide

### 1. Requirements

- **Windows 10 / 11 x64**
- **Android Smartphone** connected to the same Wi-Fi router
- **ViGEmBus Driver** (Virtual Gamepad Emulation Bus)

### 2. ViGEmBus Driver Setup

PocketPad relies on the established, open-source [ViGEmBus driver](https://github.com/nefarius/ViGEmBus) by Nefarius to register authentic virtual Xbox 360 controllers in the Windows kernel:

1. Download the latest installer from the official release page:
   [ViGEmBus Release v1.22.0](https://github.com/nefarius/ViGEmBus/releases)
2. Run `ViGEmBus_Setup_1.22.0.exe` and complete installation.
3. *Note on driver status*: ViGEmBus is archived and feature-complete. It remains the gold standard for Xbox 360 emulation on Windows 10/11. PocketPad encapsulates it behind a clean `VirtualController` trait to allow future driver backends without breaking changes.

### 3. Launching PocketPad

1. Run `pocketpad.exe` (or `.\scripts\run-dev.ps1`).
2. The local dashboard opens in your browser (`http://localhost:3000/?mode=dashboard`).
3. Scan the displayed **QR Code** using your phone camera or enter the local IP URL.
4. Enter the 4-digit pairing code shown on your desktop screen.
5. Your phone becomes an instant landscape controller! Repeat the pairing URL on up to four phones for local multiplayer.

Each connected phone receives an independent virtual Xbox 360 controller. If all four slots are occupied, additional connections are rejected until a phone disconnects or the desktop dashboard uses **Disconnect Phone Session**.

The pairing code is used for the initial connection. PocketPad then issues a session token to the browser, which is used for reconnects and expires after 24 hours. Tokens are bound to the client IP address.

### 4. Verifying with Windows `joy.cpl`

1. Press `Win + R` on Windows.
2. Type `joy.cpl` and hit Enter.
3. You will see **"Controller (Xbox 360 For Windows)"** listed with status **OK**.
4. Double-click the controller to see the real-time button test grid, triggers, and axes respond to your phone touches.

---

## 🛠️ Building from Source

PocketPad builds with **PNPM** for the web client and **Cargo** for the Windows executable.

### Prerequisites

- Node.js 18+ and PNPM (`corepack enable` or `npm i -g pnpm`)
- Rust Stable (`rustup-init.exe`)
- ViGEmBus installed for up to four virtual Xbox 360 controller targets

### One-Command Build Script

```powershell
.\scripts\build.ps1
```

This compiles:
1. `web/` using Vite + TypeScript + Preact into `web/dist`.
2. `host/` using Cargo with LTO and stripped symbols into `bin/pocketpad.exe`.

The host binds its HTTP/WebSocket server to the local network so phones can connect. The embedded dashboard and controller UI are served from the same origin; cross-origin requests are not enabled by default.

Input packets must have the exact documented length. Duplicate and out-of-order sequence numbers are discarded. The host periodically removes expired pairing tokens and records round-trip latency reported by connected clients in the dashboard diagnostics.

### Running Tests

```powershell
.\scripts\test.ps1
```

---

## 🛡️ Safety & Failsafe Watchdog

To prevent game characters from running in circles if a phone loses Wi-Fi signal or closes its browser:
1. **250 ms Neutral Reset**: If no controller packet is received within 250 milliseconds, all buttons, triggers, and thumbsticks immediately reset to 0 (neutral).
2. **2.0 s Session Drop**: If silence exceeds 2000 ms, the session is formally dropped and logged.
3. **Clean Shutdown**: When PocketPad terminates (Ctrl+C), it sends a neutral state, unplugs the virtual device from Windows, and releases driver handles cleanly.

---

## 📄 License

PocketPad is open source under the **MIT License**.
See [LICENSE](LICENSE) for details.
