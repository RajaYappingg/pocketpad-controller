import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { HostInfo, ControllerSettings, DEFAULT_SETTINGS } from './protocol/types';
import { BinaryProtocolEncoder, PACKET_TYPE } from './protocol/binary_protocol';
import { DashboardView } from './dashboard/DashboardView';
import { ControllerView } from './controller/ControllerView';

export function App() {
  const [mode, setMode] = useState<'dashboard' | 'controller'>('dashboard');
  const [pairingCodeInput, setPairingCodeInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [pingMs, setPingMs] = useState<number>(-1);
  const [authError, setAuthError] = useState<string | null>(null);

  const [hostInfo, setHostInfo] = useState<HostInfo>({
    status: 'ok',
    driverInstalled: true,
    driverName: 'ViGEmBus (Xbox 360)',
    pairingCode: '1234',
    serverUrl: window.location.origin,
    ipAddresses: ['127.0.0.1'],
    port: window.location.port ? parseInt(window.location.port) : 80,
    activeClientConnected: false,
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

  // Connect WebSocket when in controller mode
  useEffect(() => {
    if (mode !== 'controller') {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let reconnectTimer: number;
    let isDisposed = false;

    const connect = () => {
      if (isDisposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const code = pairingCodeInput || hostInfo.pairingCode;
      const wsUrl = `${protocol}//${window.location.host}/ws?code=${encodeURIComponent(code)}`;

      try {
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          setAuthError(null);

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
              }
            }
          } else if (typeof event.data === 'string') {
            try {
              const msg = JSON.parse(event.data);
              if (msg.error) {
                setAuthError(msg.error);
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
          if (!isDisposed) {
            reconnectTimer = window.setTimeout(connect, 1500);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        if (!isDisposed) {
          reconnectTimer = window.setTimeout(connect, 1500);
        }
      }
    };

    connect();

    return () => {
      isDisposed = true;
      clearTimeout(reconnectTimer);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [mode, pairingCodeInput, hostInfo.pairingCode]);

  const handleDisconnectClient = async () => {
    try {
      await fetch('/api/disconnect', { method: 'POST' });
    } catch {
      // ignore
    }
  };

  const handleDisconnectFromPhone = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setMode('dashboard');
  };

  if (mode === 'controller') {
    return (
      <div style={{ width: '100%', height: '100%' }}>
        {authError && (
          <div
            style={{
              position: 'fixed',
              top: '50px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(239, 68, 68, 0.95)',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: '8px',
              zIndex: 300,
              fontSize: '13px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}
          >
            {authError}
          </div>
        )}
        <ControllerView
          ws={wsRef.current}
          isConnected={isConnected}
          pingMs={pingMs}
          settings={settings}
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
