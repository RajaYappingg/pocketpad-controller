import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { HostInfo, ControllerSettings, DEFAULT_SETTINGS } from './protocol/types';
import { BinaryProtocolEncoder, PACKET_TYPE } from './protocol/binary_protocol';
import { DashboardView } from './dashboard/DashboardView';
import { ControllerView } from './controller/ControllerView';

const TOKEN_KEY = 'pocketpad_session_token';
const CODE_KEY = 'pocketpad_pairing_code';

export function App() {
  const [mode, setMode] = useState<'dashboard' | 'controller'>('dashboard');
  const [pairingCodeInput, setPairingCodeInput] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('code') || localStorage.getItem(CODE_KEY) || '';
  });
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_KEY);
  });
  const [playerSlot, setPlayerSlot] = useState<number | null>(null);
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [pairingInputDraft, setPairingInputDraft] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [pingMs, setPingMs] = useState<number>(-1);
  const [authError, setAuthError] = useState<string | null>(null);

  const [hostInfo, setHostInfo] = useState<HostInfo>({
    status: 'ok',
    driverInstalled: true,
    driverName: 'ViGEmBus (Xbox 360)',
    pairingCode: '',
    serverUrl: window.location.origin,
    ipAddresses: ['127.0.0.1'],
    port: window.location.port ? parseInt(window.location.port) : 80,
    activeClientConnected: false,
    activeClients: 0,
    controllerSlots: 4,
    packetsReceived: 0,
  });

  const [settings, setSettings] = useState<ControllerSettings>(() => {
    try {
      const saved = localStorage.getItem('pocketpad_settings');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const rumbleIntervalRef = useRef<number | null>(null);
  const sessionTokenRef = useRef<string | null>(sessionToken);
  sessionTokenRef.current = sessionToken;

  const triggerRumble = (largeMotor: number, smallMotor: number) => {
    if (!settings.hapticsEnabled || !('vibrate' in navigator)) return;

    if (rumbleIntervalRef.current) {
      clearInterval(rumbleIntervalRef.current);
      rumbleIntervalRef.current = null;
    }

    if (largeMotor === 0 && smallMotor === 0) {
      try {
        navigator.vibrate(0);
      } catch {
        // ignore
      }
      return;
    }

    // Map Xbox 360 dual motor parameters to smartphone haptic pulses
    let pulseDuration: number;
    let cycleInterval: number;

    if (largeMotor >= 128) {
      // Heavy low-frequency motor (heavy impact, explosion, crash)
      pulseDuration = Math.round(75 + (largeMotor / 255) * 45); // 75ms - 120ms
      cycleInterval = 110;
    } else if (largeMotor > 0) {
      // Medium low-frequency motor (engine acceleration, rough road)
      pulseDuration = Math.round(45 + (largeMotor / 128) * 30); // 45ms - 75ms
      cycleInterval = 85;
    } else {
      // Light high-frequency motor (gunfire recoil, UI click, surface friction)
      pulseDuration = Math.round(25 + (smallMotor / 255) * 25); // 25ms - 50ms
      cycleInterval = 65;
    }

    try {
      navigator.vibrate(pulseDuration);
    } catch {
      // ignore
    }

    // Keep pulsing continuously as long as game motors remain engaged
    rumbleIntervalRef.current = window.setInterval(() => {
      try {
        navigator.vibrate(pulseDuration);
      } catch {
        // ignore
      }
    }, cycleInterval);
  };

  const handleUpdateSettings = (newSettings: ControllerSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem('pocketpad_settings', JSON.stringify(newSettings));
    } catch {
      // ignore
    }
  };

  // Determine initial mode from query params or screen/touch
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');
    const codeParam = params.get('code');

    if (codeParam) {
      setPairingCodeInput(codeParam);
      localStorage.setItem(CODE_KEY, codeParam);
    }

    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 900;

    if (modeParam === 'controller' || (modeParam !== 'dashboard' && (isTouchDevice || isSmallScreen))) {
      setMode('controller');
    } else {
      setMode('dashboard');
    }
  }, []);

  // Poll host status for dashboard
  useEffect(() => {
    let active = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          const data = await res.json();
          if (active) {
            setHostInfo(prev => ({
              ...prev,
              ...data,
              serverUrl: data.serverUrl || window.location.origin,
            }));
          }
        }
      } catch {
        // host may be starting or offline
      }
    };

    fetchStatus();
    const timer = setInterval(fetchStatus, 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  // Screen Wake Lock API to prevent phone screen from turning off during play
  useEffect(() => {
    if (mode !== 'controller' || !isConnected) return;
    let wakeLock: any = null;

    const acquireLock = async () => {
      if ('wakeLock' in navigator && (navigator as any).wakeLock) {
        try {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        } catch {
          // May fail if low battery mode or backgrounded
        }
      }
    };

    acquireLock();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        acquireLock();
      } else {
        if (rumbleIntervalRef.current) {
          clearInterval(rumbleIntervalRef.current);
          rumbleIntervalRef.current = null;
        }
        try {
          if ('vibrate' in navigator) navigator.vibrate(0);
        } catch {
          // ignore
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
      }
    };
  }, [mode, isConnected]);

  // Connect WebSocket when in controller mode
  useEffect(() => {
    if (mode !== 'controller') {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    // If no credentials yet, prompt user with pairing modal instead of failing
    const currentToken = sessionTokenRef.current;
    const currentCode = pairingCodeInput.trim();

    if (!currentToken && !currentCode) {
      setShowPairingModal(true);
      return;
    }

    let reconnectTimer: number;
    let isDisposed = false;

    const connect = () => {
      if (isDisposed) return;
      let hasOpened = false;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const tokenToUse = sessionTokenRef.current;
      const codeToUse = pairingCodeInput.trim();

      if (!tokenToUse && !codeToUse) {
        setShowPairingModal(true);
        return;
      }

      const authParam = tokenToUse
        ? `token=${encodeURIComponent(tokenToUse)}`
        : `code=${encodeURIComponent(codeToUse)}`;
      const wsUrl = `${protocol}//${window.location.host}/ws?${authParam}`;

      try {
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
          hasOpened = true;
          setIsConnected(true);
          setAuthError(null);
          setShowPairingModal(false);

          // Start ping/pong for RTT latency
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              const pingPacket = BinaryProtocolEncoder.encodePing(performance.now());
              ws.send(pingPacket);
            }
          }, 1000);
        };

        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            const buf = event.data;
            if (buf.byteLength >= 7) {
              const view = new DataView(buf);
              const pType = view.getUint8(2);
              if (pType === PACKET_TYPE.PONG) {
                const sentTime = view.getUint32(3, true);
                const rtt = Math.round(performance.now() - sentTime);
                setPingMs(Math.max(0, rtt));
                ws.send(JSON.stringify({ rttMs: Math.max(0, rtt) }));
              }
            } else if (buf.byteLength >= 5) {
              const rumble = BinaryProtocolEncoder.decodeRumble(buf);
              if (rumble) {
                triggerRumble(rumble.largeMotor, rumble.smallMotor);
              }
            }
          } else if (typeof event.data === 'string') {
            try {
              const msg = JSON.parse(event.data);
              if (msg.token) {
                sessionTokenRef.current = msg.token;
                setSessionToken(msg.token);
                localStorage.setItem(TOKEN_KEY, msg.token);
                setAuthError(null);
                setShowPairingModal(false);
              }
              if (typeof msg.slot === 'number') {
                setPlayerSlot(msg.slot);
              }
              if (msg.disconnected) {
                sessionTokenRef.current = null;
                setSessionToken(null);
                setPlayerSlot(null);
                localStorage.removeItem(TOKEN_KEY);
                setAuthError('Session ended by host.');
                setShowPairingModal(true);
              }
              if (msg.error) {
                setAuthError(msg.error);
                // Purge invalid token and request code
                sessionTokenRef.current = null;
                setSessionToken(null);
                setPlayerSlot(null);
                localStorage.removeItem(TOKEN_KEY);
                setShowPairingModal(true);
              }
            } catch {
              // ignore
            }
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          setPingMs(-1);
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
          if (rumbleIntervalRef.current) {
            clearInterval(rumbleIntervalRef.current);
            rumbleIntervalRef.current = null;
          }
          try {
            if ('vibrate' in navigator) navigator.vibrate(0);
          } catch {
            // ignore
          }

          if (!hasOpened) {
            // Handshake failed before connection could be established
            if (tokenToUse) {
              sessionTokenRef.current = null;
              setSessionToken(null);
              setPlayerSlot(null);
              localStorage.removeItem(TOKEN_KEY);
              setShowPairingModal(true);
              return;
            } else if (codeToUse) {
              setAuthError('Pairing code incorrect or expired. Please check PC screen.');
              setShowPairingModal(true);
              return;
            }
          }

          if (!isDisposed && !authError) {
            reconnectTimer = window.setTimeout(connect, 2000);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        if (!isDisposed && !authError) {
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      }
    };

    connect();

    return () => {
      isDisposed = true;
      clearTimeout(reconnectTimer);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (rumbleIntervalRef.current) {
        clearInterval(rumbleIntervalRef.current);
        rumbleIntervalRef.current = null;
      }
      try {
        if ('vibrate' in navigator) navigator.vibrate(0);
      } catch {
        // ignore
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [mode, pairingCodeInput, sessionToken, authError]);

  const handleDisconnectClient = async (slot?: number) => {
    try {
      const url = slot !== undefined ? `/api/disconnect?slot=${slot}` : '/api/disconnect';
      await fetch(url, { method: 'POST' });
    } catch {
      // ignore
    }
  };

  const handleDisconnectFromPhone = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (rumbleIntervalRef.current) {
      clearInterval(rumbleIntervalRef.current);
      rumbleIntervalRef.current = null;
    }
    try {
      if ('vibrate' in navigator) navigator.vibrate(0);
    } catch {
      // ignore
    }
    setPlayerSlot(null);
    setMode('dashboard');
  };

  const handlePairingSubmit = (code: string) => {
    const clean = code.trim();
    if (clean.length === 4) {
      setPairingCodeInput(clean);
      localStorage.setItem(CODE_KEY, clean);
      setSessionToken(null);
      sessionTokenRef.current = null;
      setPlayerSlot(null);
      localStorage.removeItem(TOKEN_KEY);
      setAuthError(null);
      setShowPairingModal(false);
    }
  };

  if (mode === 'controller') {
    return (
      <div style={{ width: '100%', height: '100%' }}>
        {showPairingModal && (
          <div className="pairing-modal-overlay">
            <div className="pairing-modal-card">
              <div style={{ fontSize: '32px' }}>📱</div>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff' }}>
                  Pair PocketPad Gamepad
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Enter the 4-digit pairing code shown on your Windows desktop screen:
                </p>
              </div>

              {authError && (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: 'var(--accent-red)',
                    fontSize: '12px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontWeight: 600,
                  }}
                >
                  {authError}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handlePairingSubmit(pairingInputDraft);
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="••••"
                  value={pairingInputDraft}
                  onInput={(e) => {
                    const val = (e.target as HTMLInputElement).value
                      .replace(/\D/g, '')
                      .slice(0, 4);
                    setPairingInputDraft(val);
                    if (val.length === 4) {
                      handlePairingSubmit(val);
                    }
                  }}
                  autoFocus
                  className="pairing-input-field"
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: 700 }}
                  disabled={pairingInputDraft.trim().length !== 4}
                >
                  Connect Controller
                </button>
              </form>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '12px' }}
                onClick={() => setMode('dashboard')}
              >
                View Desktop Dashboard
              </button>
            </div>
          </div>
        )}

        <ControllerView
          ws={wsRef.current}
          isConnected={isConnected}
          pingMs={pingMs}
          settings={settings}
          playerSlot={playerSlot}
          onUpdateSettings={handleUpdateSettings}
          onDisconnectRequest={handleDisconnectFromPhone}
        />
      </div>
    );
  }

  return (
    <DashboardView
      hostInfo={hostInfo}
      onDisconnectClient={handleDisconnectClient}
      onOpenMobileController={() => setMode('controller')}
    />
  );
}
