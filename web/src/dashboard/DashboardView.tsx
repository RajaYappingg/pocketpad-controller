import { h } from 'preact';
import { useState } from 'preact/hooks';
import { HostInfo, SlotInfo } from '../protocol/types';
import { QRCode } from '../components/qrcode';

interface DashboardViewProps {
  hostInfo: HostInfo;
  onDisconnectClient: (slot?: number) => void;
  onOpenMobileController: () => void;
}

export function DashboardView({
  hostInfo,
  onDisconnectClient,
  onOpenMobileController,
}: DashboardViewProps) {
  const [copied, setCopied] = useState(false);
  const [selectedIp, setSelectedIp] = useState<string>('');

  const defaultSlots: SlotInfo[] = Array.from({ length: hostInfo.controllerSlots || 4 }, (_, i) => ({
    slotIndex: i,
    connected: i === 0 ? hostInfo.activeClientConnected : false,
    clientIp: i === 0 ? hostInfo.activeClientIp : undefined,
    rttMs: i === 0 ? hostInfo.rttMs : undefined,
    packetsReceived: i === 0 ? hostInfo.packetsReceived : 0,
  }));
  const displaySlots = hostInfo.slots && hostInfo.slots.length > 0 ? hostInfo.slots : defaultSlots;

  const detectedHost = hostInfo.serverUrl.replace(/^https?:\/\//, '').split(':')[0] || '127.0.0.1';
  const currentIp = selectedIp || detectedHost;
  const effectiveServerUrl = `http://${currentIp}:${hostInfo.port}`;
  const controllerUrl = `${effectiveServerUrl}/?mode=controller&code=${hostInfo.pairingCode}`;
  const qrSvg = QRCode.generateSVG(controllerUrl, 180, 4);

  const copyUrl = () => {
    navigator.clipboard.writeText(controllerUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-wrapper">
        {/* Header */}
        <header className="dash-header">
          <div className="brand">
            <div className="brand-logo">
              <svg viewBox="0 0 24 24">
                <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
              </svg>
            </div>
            <div className="brand-text">
              <h1>PocketPad Host</h1>
              <p>Ultra-low-latency Virtual Xbox 360 Controller for Windows</p>
            </div>
          </div>

          <div>
            {hostInfo.activeClientConnected ? (
              <span className="badge badge-ok">
                <span className="dot" /> Phone Connected
              </span>
            ) : (
              <span className="badge badge-warn">
                <span className="dot" /> Waiting for Connection
              </span>
            )}
          </div>
        </header>

        {/* Main Grid */}
        <div className="grid-cards">
          {/* Card 1: QR Code & Pairing */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h2 className="dash-card-title">
                <span>📱</span> Phone Pairing
              </h2>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Scan with Phone</span>
            </div>

            <div className="qr-section">
              <div
                className="qr-box"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />

              {/* IP Selection if multiple interfaces available */}
              {hostInfo.ipAddresses && hostInfo.ipAddresses.length > 1 && (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>HOST IP (Wi-Fi / LAN):</label>
                  <select
                    value={currentIp}
                    onChange={(e) => setSelectedIp((e.target as HTMLSelectElement).value)}
                    style={{
                      background: 'var(--bg-control)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-control)',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '12px',
                      width: '100%',
                    }}
                  >
                    {hostInfo.ipAddresses.map((ip) => (
                      <option key={ip} value={ip}>
                        {ip} {ip === '127.0.0.1' ? '(Loopback/Local only)' : '(Wi-Fi / LAN)'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {currentIp === '127.0.0.1' && (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    fontSize: '11px',
                    color: 'var(--accent-red)',
                    width: '100%',
                    lineHeight: '1.4',
                  }}
                >
                  ⚠️ <strong>Loopback IP Terdeteksi:</strong> HP tidak bisa mengakses 127.0.0.1. Pastikan PC dan smartphone terhubung ke Wi-Fi / Hotspot yang sama.
                </div>
              )}

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  PAIRING CODE
                </div>
                <div className="pairing-code-badge">{hostInfo.pairingCode}</div>
              </div>

              <div className="url-box">
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {controllerUrl}
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                  onClick={copyUrl}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              <button
                className="btn btn-secondary"
                style={{ width: '100%', fontSize: '12px' }}
                onClick={onOpenMobileController}
              >
                🎮 Test Controller in Browser
              </button>
            </div>
          </div>

          {/* Card 2: Driver & System Status */}
          <div className="dash-card">
            <div className="dash-card-header">
              <h2 className="dash-card-title">
                <span>⚙️</span> System & Driver Status
              </h2>
              {hostInfo.driverInstalled ? (
                <span className="badge badge-ok">ViGEmBus Active</span>
              ) : (
                <span className="badge badge-err">Driver Missing</span>
              )}
            </div>

            <table className="info-table">
              <tbody>
                <tr>
                  <td>Virtual Backend</td>
                  <td>{hostInfo.driverName}</td>
                </tr>
                <tr>
                  <td>Driver State</td>
                  <td>
                    {hostInfo.driverInstalled ? (
                      <span style={{ color: 'var(--accent-green)' }}>Loaded & Ready</span>
                    ) : (
                      <span style={{ color: 'var(--accent-red)' }}>Not Installed</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td>Active Client</td>
                  <td>
                    {hostInfo.activeClients}/{hostInfo.controllerSlots}
                    {hostInfo.activeClientIp ? ` (${hostInfo.activeClientIp})` : ''}
                  </td>
                </tr>
                <tr>
                  <td>Latency (RTT)</td>
                  <td>{hostInfo.rttMs !== undefined ? `${hostInfo.rttMs} ms` : '—'}</td>
                </tr>
                <tr>
                  <td>Packets Processed</td>
                  <td>{hostInfo.packetsReceived.toLocaleString()}</td>
                </tr>
                <tr>
                  <td>Host Port</td>
                  <td>{hostInfo.port}</td>
                </tr>
              </tbody>
            </table>

            {!hostInfo.driverInstalled && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '12px',
                  lineHeight: '1.4',
                }}
              >
                <strong>⚠️ ViGEmBus Kernel Driver Not Detected:</strong>
                <p style={{ marginTop: '4px', color: 'var(--text-muted)' }}>
                  Windows requires the ViGEmBus driver to emulate a genuine Xbox 360 controller.
                  Download the official installer from the ViGEmBus GitHub releases:
                </p>
                <a
                  href="https://github.com/nefarius/ViGEmBus/releases"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent-red)', display: 'inline-block', marginTop: '6px' }}
                >
                  Download ViGEmBus Setup →
                </a>
              </div>
            )}

            {hostInfo.activeClientConnected && (
              <button
                className="btn btn-danger"
                style={{ width: '100%', marginTop: 'auto' }}
                onClick={() => onDisconnectClient()}
              >
                Disconnect Phone Session
              </button>
            )}
          </div>
        </div>

        {/* Card: Controller Slots (Multiplayer / Diagnostics) */}
        <div className="dash-card">
          <div className="dash-card-header">
            <h2 className="dash-card-title">
              <span>🎮</span> Controller Slots ({hostInfo.activeClients || 0}/{hostInfo.controllerSlots || 4} Connected)
            </h2>
            {(hostInfo.activeClients || 0) > 0 && (
              <button
                className="btn btn-secondary"
                style={{ fontSize: '11px', padding: '4px 10px' }}
                onClick={() => onDisconnectClient()}
                title="Disconnect all active controller sessions"
              >
                Disconnect All
              </button>
            )}
          </div>

          <div className="slots-grid">
            {displaySlots.map((slot) => (
              <div
                key={slot.slotIndex}
                className={`slot-card ${slot.connected ? 'slot-card-active' : ''}`}
              >
                <div className="slot-card-header">
                  <div className="slot-title">
                    <span className="slot-index-badge">P{slot.slotIndex + 1}</span>
                    <span>Controller {slot.slotIndex + 1}</span>
                  </div>
                  {slot.connected ? (
                    <span className="badge badge-ok" style={{ fontSize: '10px', padding: '2px 8px' }}>
                      <span className="dot" /> Connected
                    </span>
                  ) : (
                    <span className="badge badge-warn" style={{ fontSize: '10px', padding: '2px 8px', opacity: 0.7 }}>
                      <span className="dot" /> Standby
                    </span>
                  )}
                </div>

                <div className="slot-card-body">
                  <div className="slot-stat-row">
                    <span className="slot-stat-label">Client IP</span>
                    <span className="slot-stat-value">{slot.clientIp || '—'}</span>
                  </div>
                  <div className="slot-stat-row">
                    <span className="slot-stat-label">Latency (RTT)</span>
                    <span className="slot-stat-value">
                      {slot.rttMs !== undefined && slot.rttMs !== null ? `${slot.rttMs} ms` : '—'}
                    </span>
                  </div>
                  <div className="slot-stat-row">
                    <span className="slot-stat-label">Packets</span>
                    <span className="slot-stat-value">
                      {(slot.packetsReceived || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {slot.connected && (
                  <button
                    className="btn btn-danger slot-disconnect-btn"
                    onClick={() => onDisconnectClient(slot.slotIndex)}
                  >
                    Disconnect P{slot.slotIndex + 1}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Card 3: Windows Verification & Diagnostics */}
        <div className="dash-card">
          <div className="dash-card-header">
            <h2 className="dash-card-title">
              <span>🎮</span> Windows Game Controller Verification (joy.cpl)
            </h2>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            <p>
              To confirm that Windows recognizes the genuine virtual Xbox 360 controller:
            </p>
            <ol style={{ paddingLeft: '20px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <li>Press <kbd style={{ background: '#222', padding: '2px 6px', borderRadius: '4px' }}>Win + R</kbd> on your keyboard.</li>
              <li>Type <code style={{ color: 'var(--accent-red)' }}>joy.cpl</code> and press <strong>Enter</strong>.</li>
              <li>You will see <strong>"Xbox 360 Controller for Windows"</strong> listed with status <strong>OK</strong>.</li>
              <li>Double-click the controller to test real-time analog sticks, triggers, and button responses.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
