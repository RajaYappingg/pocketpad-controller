import { h } from 'preact';
import { useRef, useEffect, useState } from 'preact/hooks';
import { ControllerState, ControllerSettings, XINPUT_BUTTONS } from '../protocol/types';
import { BinaryProtocolEncoder } from '../protocol/binary_protocol';
import { VirtualJoystick } from '../components/VirtualJoystick';
import { SettingsModal } from '../settings/SettingsModal';

interface ControllerViewProps {
  ws: WebSocket | null;
  isConnected: boolean;
  pingMs: number;
  settings: ControllerSettings;
  playerSlot?: number | null;
  onUpdateSettings: (s: ControllerSettings) => void;
  onDisconnectRequest: () => void;
}

export function ControllerView({
  ws,
  isConnected,
  pingMs,
  settings,
  playerSlot,
  onUpdateSettings,
  onDisconnectRequest,
}: ControllerViewProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [, setFullscreen] = useState(false);

  // Mutable controller state object (zero allocations in hot loop)
  const stateRef = useRef<ControllerState>({
    buttons: 0,
    leftTrigger: 0,
    rightTrigger: 0,
    thumbLX: 0,
    thumbLY: 0,
    thumbRX: 0,
    thumbRY: 0,
  });

  const encoderRef = useRef(new BinaryProtocolEncoder());
  const activePointers = useRef<Map<number, number>>(new Map()); // pointerId -> buttonBitmask
  const isDirty = useRef(false);
  const lastSentTime = useRef(0);

  // Send loop: ~100Hz tick or immediately when dirty, plus heartbeat every 100ms
  useEffect(() => {
    let animId: number;

    const tick = (now: number) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const timeSinceLast = now - lastSentTime.current;
        if (isDirty.current || timeSinceLast >= 100) {
          const packet = encoderRef.current.encodeInput(stateRef.current);
          ws.send(packet);
          isDirty.current = false;
          lastSentTime.current = now;
        }
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [ws]);

  // Vibrate helper
  const vibrate = (ms = 12) => {
    if (settings.hapticsEnabled && 'vibrate' in navigator) {
      try {
        navigator.vibrate(ms);
      } catch {
        // ignore
      }
    }
  };

  // Button press handler using pointer events
  const handleButtonDown = (e: PointerEvent, bitmask: number) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, bitmask);
    stateRef.current.buttons |= bitmask;
    isDirty.current = true;
    (e.currentTarget as HTMLElement).classList.add('active');
    vibrate(14);
  };

  const handleButtonUp = (e: PointerEvent, bitmask: number) => {
    e.preventDefault();
    activePointers.current.delete(e.pointerId);
    stateRef.current.buttons &= ~bitmask;
    isDirty.current = true;
    (e.currentTarget as HTMLElement).classList.remove('active');
  };

  const dpadPointerId = useRef<number | null>(null);
  const currentDpadMask = useRef<number>(0);
  const dpadContainerRef = useRef<HTMLDivElement>(null);

  // Trigger handler (supports drag or tap)
  const handleTriggerDown = (e: PointerEvent, isRight: boolean) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, isRight ? 999 : 998);
    el.classList.add('active');
    vibrate(16);

    const rect = el.getBoundingClientRect();
    const startY = e.clientY;
    let hasDragged = false;

    const setTriggerValue = (val: number) => {
      const clamped = Math.max(0, Math.min(255, val));
      if (isRight) {
        stateRef.current.rightTrigger = clamped;
      } else {
        stateRef.current.leftTrigger = clamped;
      }
      const meter = el.querySelector('.trigger-meter') as HTMLElement | null;
      if (meter) meter.style.height = `${Math.round((clamped / 255) * 100)}%`;
      isDirty.current = true;
    };

    // Initial press: default to full 255
    setTriggerValue(255);

    const onPointerMove = (me: PointerEvent) => {
      if (me.pointerId === e.pointerId) {
        if (settings.triggerMode === 'analog') {
          if (Math.abs(me.clientY - startY) > 6) {
            hasDragged = true;
          }
          if (hasDragged) {
            const fraction = Math.min(1, Math.max(0, (me.clientY - rect.top) / rect.height));
            setTriggerValue(Math.round(fraction * 255));
          }
        }
      }
    };

    const onPointerEnd = (ue: PointerEvent) => {
      if (ue.pointerId === e.pointerId) {
        el.removeEventListener('pointermove', onPointerMove);
        el.removeEventListener('pointerup', onPointerEnd);
        el.removeEventListener('pointercancel', onPointerEnd);
        activePointers.current.delete(e.pointerId);
        el.classList.remove('active');
        setTriggerValue(0);
      }
    };

    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerEnd);
    el.addEventListener('pointercancel', onPointerEnd);
  };

  // Unified D-Pad continuous gliding & 8-way diagonal calculation
  const updateDpadState = (clientX: number, clientY: number, container: HTMLElement) => {
    const rect = container.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);

    let mask = 0;
    if (dist >= 14) {
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      if (angle >= -22.5 && angle < 22.5) {
        mask = XINPUT_BUTTONS.DPAD_RIGHT;
      } else if (angle >= 22.5 && angle < 67.5) {
        mask = XINPUT_BUTTONS.DPAD_DOWN | XINPUT_BUTTONS.DPAD_RIGHT;
      } else if (angle >= 67.5 && angle < 112.5) {
        mask = XINPUT_BUTTONS.DPAD_DOWN;
      } else if (angle >= 112.5 && angle < 157.5) {
        mask = XINPUT_BUTTONS.DPAD_DOWN | XINPUT_BUTTONS.DPAD_LEFT;
      } else if (angle >= 157.5 || angle < -157.5) {
        mask = XINPUT_BUTTONS.DPAD_LEFT;
      } else if (angle >= -157.5 && angle < -112.5) {
        mask = XINPUT_BUTTONS.DPAD_UP | XINPUT_BUTTONS.DPAD_LEFT;
      } else if (angle >= -112.5 && angle < -67.5) {
        mask = XINPUT_BUTTONS.DPAD_UP;
      } else if (angle >= -67.5 && angle < -22.5) {
        mask = XINPUT_BUTTONS.DPAD_UP | XINPUT_BUTTONS.DPAD_RIGHT;
      }
    }

    const dpadAll =
      XINPUT_BUTTONS.DPAD_UP |
      XINPUT_BUTTONS.DPAD_DOWN |
      XINPUT_BUTTONS.DPAD_LEFT |
      XINPUT_BUTTONS.DPAD_RIGHT;

    if (mask !== currentDpadMask.current) {
      stateRef.current.buttons = (stateRef.current.buttons & ~dpadAll) | mask;
      currentDpadMask.current = mask;
      isDirty.current = true;
      if (mask > 0) vibrate(12);

      const up = container.querySelector('.dpad-up');
      const down = container.querySelector('.dpad-down');
      const left = container.querySelector('.dpad-left');
      const right = container.querySelector('.dpad-right');

      up?.classList.toggle('active', (mask & XINPUT_BUTTONS.DPAD_UP) !== 0);
      down?.classList.toggle('active', (mask & XINPUT_BUTTONS.DPAD_DOWN) !== 0);
      left?.classList.toggle('active', (mask & XINPUT_BUTTONS.DPAD_LEFT) !== 0);
      right?.classList.toggle('active', (mask & XINPUT_BUTTONS.DPAD_RIGHT) !== 0);
    }
  };

  const handleDpadDown = (e: PointerEvent) => {
    e.preventDefault();
    const container = e.currentTarget as HTMLElement;
    dpadPointerId.current = e.pointerId;
    container.setPointerCapture(e.pointerId);
    updateDpadState(e.clientX, e.clientY, container);
  };

  const handleDpadMove = (e: PointerEvent) => {
    if (e.pointerId !== dpadPointerId.current) return;
    updateDpadState(e.clientX, e.clientY, e.currentTarget as HTMLElement);
  };

  const handleDpadEnd = (e: PointerEvent) => {
    if (e.pointerId !== dpadPointerId.current) return;
    const container = e.currentTarget as HTMLElement;
    dpadPointerId.current = null;
    const dpadAll =
      XINPUT_BUTTONS.DPAD_UP |
      XINPUT_BUTTONS.DPAD_DOWN |
      XINPUT_BUTTONS.DPAD_LEFT |
      XINPUT_BUTTONS.DPAD_RIGHT;

    stateRef.current.buttons &= ~dpadAll;
    currentDpadMask.current = 0;
    isDirty.current = true;

    container.querySelectorAll('.dpad-btn').forEach((b) => b.classList.remove('active'));
  };

  // Failsafe: reset all held buttons on window blur, visibility change, or connection drop
  useEffect(() => {
    const resetAll = () => {
      stateRef.current.buttons = 0;
      stateRef.current.leftTrigger = 0;
      stateRef.current.rightTrigger = 0;
      stateRef.current.thumbLX = 0;
      stateRef.current.thumbLY = 0;
      stateRef.current.thumbRX = 0;
      stateRef.current.thumbRY = 0;
      activePointers.current.clear();
      currentDpadMask.current = 0;
      dpadPointerId.current = null;
      isDirty.current = true;
      document.querySelectorAll('.active').forEach((el) => el.classList.remove('active'));
    };
    const handleVisibilityChange = () => {
      if (document.hidden) resetAll();
    };
    const handleLostPointerCapture = (event: Event) => {
      const pointerEvent = event as PointerEvent;
      if (pointerEvent.pointerId === dpadPointerId.current) {
        dpadPointerId.current = null;
        currentDpadMask.current = 0;
        const dpadAll =
          XINPUT_BUTTONS.DPAD_UP |
          XINPUT_BUTTONS.DPAD_DOWN |
          XINPUT_BUTTONS.DPAD_LEFT |
          XINPUT_BUTTONS.DPAD_RIGHT;
        stateRef.current.buttons &= ~dpadAll;
        isDirty.current = true;
        dpadContainerRef.current
          ?.querySelectorAll('.dpad-btn')
          .forEach((b) => b.classList.remove('active'));
        return;
      }
      const control = activePointers.current.get(pointerEvent.pointerId);
      if (control === undefined) return;
      activePointers.current.delete(pointerEvent.pointerId);
      if (control === 998) stateRef.current.leftTrigger = 0;
      else if (control === 999) stateRef.current.rightTrigger = 0;
      else stateRef.current.buttons &= ~control;
      isDirty.current = true;
      (pointerEvent.target as HTMLElement | null)?.classList.remove('active');
    };

    if (!isConnected) resetAll();
    window.addEventListener('blur', resetAll);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('lostpointercapture', handleLostPointerCapture);

    return () => {
      window.removeEventListener('blur', resetAll);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('lostpointercapture', handleLostPointerCapture);
    };
  }, [isConnected]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setFullscreen(false);
    }
  };

  // Joystick move handlers
  const handleLeftStickMove = (x: number, y: number) => {
    stateRef.current.thumbLX = Math.round(x * 32767);
    stateRef.current.thumbLY = Math.round(y * 32767);
    isDirty.current = true;
  };

  const handleRightStickMove = (x: number, y: number) => {
    stateRef.current.thumbRX = Math.round(x * 32767);
    stateRef.current.thumbRY = Math.round(y * 32767);
    isDirty.current = true;
  };

  const handleStickClick = (bitmask: number, pressed: boolean) => {
    if (pressed) {
      stateRef.current.buttons |= bitmask;
      vibrate(18);
    } else {
      stateRef.current.buttons &= ~bitmask;
    }
    isDirty.current = true;
  };

  const opacityStyle = { opacity: settings.buttonOpacity };

  return (
    <div className="controller-root">
      {/* Portrait rotation warning for mobile */}
      <div className="portrait-warning">
        <svg viewBox="0 0 24 24">
          <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z" />
        </svg>
        <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Rotate to Landscape</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          PocketPad gamepad is optimized for landscape orientation.
        </p>
      </div>

      {/* Controller header */}
      <div className="ctrl-header">
        <div className="ctrl-status-indicator">
          <span
            className="dot"
            style={{ color: isConnected ? 'var(--accent-green)' : 'var(--accent-red)' }}
          />
          <span>
            {isConnected
              ? playerSlot !== null && playerSlot !== undefined
                ? `P${playerSlot + 1} Connected`
                : 'Connected'
              : 'Reconnecting...'}
          </span>
          {isConnected && pingMs >= 0 && (
            <span style={{ color: 'var(--text-dim)', marginLeft: '6px' }}>{pingMs}ms</span>
          )}
        </div>

        <div className="ctrl-header-center">
          <span style={{ fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            POCKETPAD
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="ctrl-header-btn" onClick={toggleFullscreen} title="Fullscreen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
            </svg>
          </button>
          <button
            className="ctrl-header-btn"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
          </button>
          <button
            className="ctrl-header-btn"
            style={{ color: 'var(--accent-red)' }}
            onClick={onDisconnectRequest}
            title="Disconnect"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Gamepad Surface */}
      <div className="ctrl-stage">
        {/* Left Wing */}
        <div className="ctrl-wing" style={opacityStyle}>
          {/* Shoulder & Trigger */}
          <div className="shoulder-cluster">
            <button
              className="btn-trigger"
              onPointerDown={(e) => handleTriggerDown(e, false)}
            >
              <div className="trigger-meter" />
              <span>LT</span>
            </button>
            <button
              className="btn-shoulder"
              onPointerDown={(e) => handleButtonDown(e, XINPUT_BUTTONS.LEFT_SHOULDER)}
              onPointerUp={(e) => handleButtonUp(e, XINPUT_BUTTONS.LEFT_SHOULDER)}
              onPointerCancel={(e) => handleButtonUp(e, XINPUT_BUTTONS.LEFT_SHOULDER)}
            >
              LB
            </button>
            <button
              className="btn-thumb-click"
              onPointerDown={(e) =>
                handleButtonDown(
                  e,
                  !settings.southpaw ? XINPUT_BUTTONS.LEFT_THUMB : XINPUT_BUTTONS.RIGHT_THUMB
                )
              }
              onPointerUp={(e) =>
                handleButtonUp(
                  e,
                  !settings.southpaw ? XINPUT_BUTTONS.LEFT_THUMB : XINPUT_BUTTONS.RIGHT_THUMB
                )
              }
              onPointerCancel={(e) =>
                handleButtonUp(
                  e,
                  !settings.southpaw ? XINPUT_BUTTONS.LEFT_THUMB : XINPUT_BUTTONS.RIGHT_THUMB
                )
              }
              title="Left Stick Click (L3)"
            >
              {!settings.southpaw ? 'LS' : 'RS'}
            </button>
          </div>

          {/* Left Analog Stick & D-Pad */}
          <div className="lower-cluster">
            {/* Left Analog Stick (or Southpaw swap) */}
            {!settings.southpaw ? (
              <VirtualJoystick
                label="LS"
                onMove={handleLeftStickMove}
                onClick={(pressed) => handleStickClick(XINPUT_BUTTONS.LEFT_THUMB, pressed)}
                deadzone={settings.stickDeadzone}
                sensitivity={settings.stickSensitivity}
                invertY={settings.invertYLeft}
              />
            ) : (
              <VirtualJoystick
                label="RS"
                onMove={handleRightStickMove}
                onClick={(pressed) => handleStickClick(XINPUT_BUTTONS.RIGHT_THUMB, pressed)}
                deadzone={settings.stickDeadzone}
                sensitivity={settings.stickSensitivity}
                invertY={settings.invertYRight}
              />
            )}

            {/* D-Pad Cross with Unified Gliding & Diagonal Touch */}
            <div
              ref={dpadContainerRef}
              className="dpad-container"
              onPointerDown={handleDpadDown}
              onPointerMove={handleDpadMove}
              onPointerUp={handleDpadEnd}
              onPointerCancel={handleDpadEnd}
            >
              <div className="dpad-btn dpad-up">▲</div>
              <div className="dpad-btn dpad-down">▼</div>
              <div className="dpad-btn dpad-left">◀</div>
              <div className="dpad-btn dpad-right">▶</div>
              <div className="dpad-center-hub" />
            </div>
          </div>
        </div>

        {/* Center Cluster: Back, Guide, Start */}
        <div className="ctrl-center" style={opacityStyle}>
          {/* Guide Button */}
          <button
            className="btn-guide"
            onPointerDown={(e) => handleButtonDown(e, XINPUT_BUTTONS.GUIDE)}
            onPointerUp={(e) => handleButtonUp(e, XINPUT_BUTTONS.GUIDE)}
            onPointerCancel={(e) => handleButtonUp(e, XINPUT_BUTTONS.GUIDE)}
          >
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
              <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.5" />
            </svg>
          </button>

          {/* System row: Back & Start */}
          <div className="center-sys-row">
            <button
              className="btn-sys"
              onPointerDown={(e) => handleButtonDown(e, XINPUT_BUTTONS.BACK)}
              onPointerUp={(e) => handleButtonUp(e, XINPUT_BUTTONS.BACK)}
              onPointerCancel={(e) => handleButtonUp(e, XINPUT_BUTTONS.BACK)}
            >
              BACK
            </button>
            <button
              className="btn-sys"
              onPointerDown={(e) => handleButtonDown(e, XINPUT_BUTTONS.START)}
              onPointerUp={(e) => handleButtonUp(e, XINPUT_BUTTONS.START)}
              onPointerCancel={(e) => handleButtonUp(e, XINPUT_BUTTONS.START)}
            >
              START
            </button>
          </div>
        </div>

        {/* Right Wing */}
        <div className="ctrl-wing" style={opacityStyle}>
          {/* Shoulder & Trigger */}
          <div className="shoulder-cluster">
            <button
              className="btn-thumb-click"
              onPointerDown={(e) =>
                handleButtonDown(
                  e,
                  !settings.southpaw ? XINPUT_BUTTONS.RIGHT_THUMB : XINPUT_BUTTONS.LEFT_THUMB
                )
              }
              onPointerUp={(e) =>
                handleButtonUp(
                  e,
                  !settings.southpaw ? XINPUT_BUTTONS.RIGHT_THUMB : XINPUT_BUTTONS.LEFT_THUMB
                )
              }
              onPointerCancel={(e) =>
                handleButtonUp(
                  e,
                  !settings.southpaw ? XINPUT_BUTTONS.RIGHT_THUMB : XINPUT_BUTTONS.LEFT_THUMB
                )
              }
              title="Right Stick Click (R3)"
            >
              {!settings.southpaw ? 'RS' : 'LS'}
            </button>
            <button
              className="btn-shoulder"
              onPointerDown={(e) => handleButtonDown(e, XINPUT_BUTTONS.RIGHT_SHOULDER)}
              onPointerUp={(e) => handleButtonUp(e, XINPUT_BUTTONS.RIGHT_SHOULDER)}
              onPointerCancel={(e) => handleButtonUp(e, XINPUT_BUTTONS.RIGHT_SHOULDER)}
            >
              RB
            </button>
            <button
              className="btn-trigger"
              onPointerDown={(e) => handleTriggerDown(e, true)}
            >
              <div className="trigger-meter" />
              <span>RT</span>
            </button>
          </div>

          {/* Action Diamonds & Right Stick */}
          <div className="lower-cluster">
            {/* Diamond Action Buttons (A, B, X, Y) */}
            <div className="face-diamond">
              <button
                className="btn-face btn-a"
                onPointerDown={(e) => handleButtonDown(e, XINPUT_BUTTONS.A)}
                onPointerUp={(e) => handleButtonUp(e, XINPUT_BUTTONS.A)}
                onPointerCancel={(e) => handleButtonUp(e, XINPUT_BUTTONS.A)}
              >
                A
              </button>
              <button
                className="btn-face btn-b"
                onPointerDown={(e) => handleButtonDown(e, XINPUT_BUTTONS.B)}
                onPointerUp={(e) => handleButtonUp(e, XINPUT_BUTTONS.B)}
                onPointerCancel={(e) => handleButtonUp(e, XINPUT_BUTTONS.B)}
              >
                B
              </button>
              <button
                className="btn-face btn-x"
                onPointerDown={(e) => handleButtonDown(e, XINPUT_BUTTONS.X)}
                onPointerUp={(e) => handleButtonUp(e, XINPUT_BUTTONS.X)}
                onPointerCancel={(e) => handleButtonUp(e, XINPUT_BUTTONS.X)}
              >
                X
              </button>
              <button
                className="btn-face btn-y"
                onPointerDown={(e) => handleButtonDown(e, XINPUT_BUTTONS.Y)}
                onPointerUp={(e) => handleButtonUp(e, XINPUT_BUTTONS.Y)}
                onPointerCancel={(e) => handleButtonUp(e, XINPUT_BUTTONS.Y)}
              >
                Y
              </button>
            </div>

            {/* Right Stick (or Southpaw left stick) */}
            {!settings.southpaw ? (
              <VirtualJoystick
                label="RS"
                onMove={handleRightStickMove}
                onClick={(pressed) => handleStickClick(XINPUT_BUTTONS.RIGHT_THUMB, pressed)}
                deadzone={settings.stickDeadzone}
                sensitivity={settings.stickSensitivity}
                invertY={settings.invertYRight}
              />
            ) : (
              <VirtualJoystick
                label="LS"
                onMove={handleLeftStickMove}
                onClick={(pressed) => handleStickClick(XINPUT_BUTTONS.LEFT_THUMB, pressed)}
                deadzone={settings.stickDeadzone}
                sensitivity={settings.stickSensitivity}
                invertY={settings.invertYLeft}
              />
            )}
          </div>
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onUpdate={onUpdateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
