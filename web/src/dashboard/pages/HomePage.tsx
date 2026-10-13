import { h } from 'preact';
import { useState, useMemo } from 'preact/hooks';
import { HostInfo, SlotInfo } from '../../protocol/types';
import { QRCode } from '../../components/qrcode';
import { ControllerGraphic } from '../components/ControllerGraphic';
import { HeroControllerBackdrop } from '../components/ArtworkBackground';

interface HomePageProps {
  hostInfo: HostInfo;
  onDisconnectClient: (slot?: number) => void;
  onOpenMobileController: () => void;
  onNavigateToControllers: () => void;
  onNavigateToSettings: () => void;
}

export function HomePage({
  hostInfo,
  onDisconnectClient,
  onOpenMobileController,
  onNavigateToControllers,
  onNavigateToSettings,
}: HomePageProps) {
  const [pairingTab, setPairingTab] = useState<'qr' | 'manual'>('qr');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [selectedIp, setSelectedIp] = useState<string>('');

  // Fallback slots if not provided by backend
  const defaultSlots: SlotInfo[] = Array.from({ length: hostInfo.controllerSlots || 4 }, (_, i) => ({
    slotIndex: i,
    connected: i === 0 ? hostInfo.activeClientConnected : false,
    clientIp: i === 0 ? hostInfo.activeClientIp : undefined,
    rttMs: i === 0 ? hostInfo.rttMs : undefined,
    packetsReceived: i === 0 ? hostInfo.packetsReceived : 0,
  }));
  const displaySlots = hostInfo.slots && hostInfo.slots.length > 0 ? hostInfo.slots : defaultSlots;
  const connectedCount = displaySlots.filter((s) => s.connected).length;
  const totalSlots = hostInfo.controllerSlots || 4;

  const detectedHost = hostInfo.serverUrl.replace(/^https?:\/\//, '').split(':')[0] || '127.0.0.1';
  const currentIp = selectedIp || detectedHost;
  const effectiveServerUrl = `http://${currentIp}:${hostInfo.port}`;
  // P0: /api/status redacts pairingCode for non-loopback callers. When empty,
  // the dashboard is viewed remotely — direct the user to the host screen.
  const hasPairingCode = (hostInfo.pairingCode || '').length > 0;
  const controllerUrl = hasPairingCode
    ? `${effectiveServerUrl}/?mode=controller&code=${hostInfo.pairingCode}`
    : `${effectiveServerUrl}/?mode=controller`;
  // P1: QR generation walks ~1-4k modules with string concat — memoize so
  // the 1.5s status poll doesn't rebuild it on every render.
  const qrSvg = useMemo(
    () => (hasPairingCode ? QRCode.generateSVG(controllerUrl, 180, 4) : ''),
    [controllerUrl, hasPairingCode],
  );

  const pairingCodeChars = (hostInfo.pairingCode || '------').split('');

  const copyCode = () => {
    if (!hasPairingCode) return;
    navigator.clipboard.writeText(hostInfo.pairingCode).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }).catch(() => {});
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(controllerUrl).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="home-page-layout">
      {/* Left/Main Column */}
      <div className="home-main-col">
        {/* Hero Section with Controller Backdrop */}
        <section className="home-hero-card">
          <HeroControllerBackdrop />
          <div className="home-hero-content">
            <h1 className="home-hero-title">
              Ready to <span className="text-accent">Play</span>
            </h1>
            <p className="home-hero-subtitle">
              Turn your phone into a real Xbox 360 controller.
            </p>
          </div>
        </section>

        {/* Connection Mode Bar */}
        <section className="connection-mode-bar">
          {/* Wi-Fi Mode (Active) */}
          <div className="mode-toggle-card mode-toggle-active">
            <div className="mode-icon-circle mode-icon-wifi">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" stroke-width="3" />
              </svg>
            </div>
            <div className="mode-info">
              <div className="mode-title">Wi-Fi Mode</div>
              <div className="mode-desc">Fast and reliable</div>
            </div>
            <div className="mode-switch-active" title="Wi-Fi Mode Active">
              <div className="mode-switch-knob" />
            </div>
          </div>

          {/* Bluetooth Mode (Beta / Standby) */}
          <div className="mode-toggle-card mode-toggle-disabled">
            <div className="mode-icon-circle mode-icon-bt">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" />
              </svg>
            </div>
            <div className="mode-info">
              <div className="mode-title">Bluetooth Mode</div>
              <div className="mode-desc">Low latency (beta)</div>
            </div>
            <div className="mode-switch-inactive" title="Bluetooth mode is in beta testing">
              <div className="mode-switch-knob" />
            </div>
          </div>
        </section>

        {/* Controllers Grid Section */}
        <section className="home-controllers-section">
          <div className="section-header-row">
            <div className="section-title-wrap">
              <h2 className="section-title">Controllers</h2>
              <span className="count-pill">
                {connectedCount} / {totalSlots} Connected
              </span>
            </div>
            <button
              className="btn btn-outline-danger btn-sm"
              onClick={onNavigateToControllers}
            >
              + Add Controller
            </button>
          </div>

          <div className="home-controllers-grid">
            {/* Connected Slot Cards */}
            {displaySlots
              .filter((slot) => slot.connected)
              .map((slot) => (
                <div key={slot.slotIndex} className="home-controller-card card-connected">
                  <div className="ctrl-card-top">
                    <span className="status-indicator-badge">
                      <span className="dot dot-green" /> Connected
                    </span>
                    <button
                      className="card-menu-btn"
                      onClick={() => onDisconnectClient(slot.slotIndex)}
                      title="Disconnect session"
                      aria-label={`Disconnect ${slot.slotIndex + 1}`}
                    >
                      •••
                    </button>
                  </div>

                  <div className="ctrl-card-illustration">
                    <ControllerGraphic width={150} height={100} highlighted />
                  </div>

                  <div className="ctrl-card-meta">
                    <div className="ctrl-device-name">Phone {slot.slotIndex + 1}</div>
                    <div className="ctrl-device-model">
                      {slot.clientIp ? `Device (${slot.clientIp})` : `Player ${slot.slotIndex + 1}`}
                    </div>
                  </div>

                  <div className="ctrl-card-metrics">
                    <div className="metric-item">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" opacity="0.7">
                        <rect x="2" y="10" width="3" height="11" rx="1" />
                        <rect x="8" y="7" width="3" height="14" rx="1" />
                        <rect x="14" y="4" width="3" height="17" rx="1" />
                        <rect x="20" y="2" width="3" height="19" rx="1" />
                      </svg>
                      <span>{slot.rttMs !== undefined && slot.rttMs !== null ? `${slot.rttMs} ms` : '<1 ms'} Latency</span>
                    </div>

                    <div className="metric-item">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                        <line x1="12" y1="20" x2="12.01" y2="20" stroke-width="2" />
                      </svg>
                      <span>Wi-Fi Mode</span>
                    </div>

                    <div className="metric-battery">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
                        <rect x="2" y="7" width="16" height="10" rx="2" />
                        <line x1="20" y1="10" x2="20" y2="14" />
                        <rect x="4" y="9" width="10" height="6" fill="#22c55e" rx="1" />
                      </svg>
                      <span>78%</span>
                    </div>
                  </div>

                  <button
                    className="btn btn-card-action"
                    onClick={onOpenMobileController}
                  >
                    <span>🎮 Open Controller</span>
                    <span className="arrow-icon">›</span>
                  </button>
                </div>
              ))}

            {/* Empty Slot 1: Add Controller Action Card */}
            <div
              className="home-controller-card card-add-placeholder"
              onClick={() => {
                const el = document.getElementById('qr-panel');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <div className="add-icon-circle">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <div className="add-card-title">Add Controller</div>
              <p className="add-card-desc">
                Scan the QR code or enter the pairing code to connect a new device.
              </p>
            </div>

            {/* Empty Slot 2: Controller Slot Available */}
            {connectedCount < totalSlots - 1 && (
              <div className="home-controller-card card-slot-available">
                <div className="slot-avail-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4a4d5e" stroke-width="1.8">
                    <rect x="2" y="6" width="20" height="12" rx="4" />
                    <line x1="7" y1="12" x2="11" y2="12" />
                    <line x1="9" y1="10" x2="9" y2="14" />
                    <circle cx="16" cy="10" r="1" fill="#4a4d5e" />
                    <circle cx="18" cy="12" r="1" fill="#4a4d5e" />
                  </svg>
                </div>
                <div className="slot-avail-title">Controller Slot Available</div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Right Column: Connect a New Controller Panel */}
      <aside className="home-side-col" id="qr-panel">
        <div className="pairing-card-panel">
          <h2 className="pairing-panel-title">Connect a New Controller</h2>

          {/* QR Code / Manual Tabs */}
          <div className="pairing-tab-headers">
            <button
              className={`pairing-tab-btn ${pairingTab === 'qr' ? 'active' : ''}`}
              onClick={() => setPairingTab('qr')}
            >
              QR Code
            </button>
            <button
              className={`pairing-tab-btn ${pairingTab === 'manual' ? 'active' : ''}`}
              onClick={() => setPairingTab('manual')}
            >
              Manual
            </button>
          </div>

          {pairingTab === 'qr' ? (
            <div className="pairing-tab-content">
              {!hasPairingCode ? (
                <div className="pairing-steps-list">
                  <div className="pairing-step-item">
                    <span className="step-text">Pairing code is only shown on the host PC screen. Open this dashboard directly on the PC (http://localhost) to pair a new phone.</span>
                  </div>
                </div>
              ) : (
              <div style="display:contents">
              {/* QR Code with Red Glowing Border */}
              <div className="qr-glowing-frame">
                <div
                  className="qr-embed-box"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              </div>

              {/* Pairing Code Digit Display */}
              <div className="pairing-digits-section">
                <div className="pairing-digits-label">Pairing Code</div>
                <div className="digits-row">
                  <div className="digit-boxes-wrap">
                    {pairingCodeChars.map((char, idx) => (
                      <span key={idx} className="digit-box">
                        {char}
                      </span>
                    ))}
                  </div>
                  <button
                    className="btn-copy-code"
                    onClick={copyCode}
                    title="Copy pairing code"
                    aria-label="Copy pairing code"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>
                {copiedCode && <div className="copy-toast">Code copied!</div>}
              </div>

              {/* Numbered Steps */}
              <div className="pairing-steps-list">
                <div className="pairing-step-item">
                  <span className="step-number">1</span>
                  <span className="step-text">Open the controller page on your phone.</span>
                </div>
                <div className="pairing-step-item">
                  <span className="step-number">2</span>
                  <span className="step-text">Scan this QR code or enter the pairing code.</span>
                </div>
                <div className="pairing-step-item">
                  <span className="step-number">3</span>
                  <span className="step-text">Allow the connection.</span>
                </div>
                <div className="pairing-step-item">
                  <span className="step-number">4</span>
                  <span className="step-text">Start playing.</span>
                </div>
              </div>
              </div>
              )}
            </div>
          ) : (
            <div className="pairing-tab-content manual-content">
              {/* Manual Connection Mode */}
              <div className="manual-field-group">
                <label className="manual-label">Host IP Interface</label>
                {hostInfo.ipAddresses && hostInfo.ipAddresses.length > 1 ? (
                  <select
                    className="manual-select"
                    value={currentIp}
                    onChange={(e) => setSelectedIp((e.target as HTMLSelectElement).value)}
                  >
                    {hostInfo.ipAddresses.map((ip) => (
                      <option key={ip} value={ip}>
                        {ip} {ip === '127.0.0.1' ? '(Loopback)' : '(Wi-Fi / LAN)'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="manual-static-value">{currentIp}</div>
                )}
              </div>

              <div className="manual-field-group">
                <label className="manual-label">Port</label>
                <div className="manual-static-value">{hostInfo.port}</div>
              </div>

              <div className="manual-field-group">
                <label className="manual-label">Pairing Code</label>
                <div className="manual-code-value">{hasPairingCode ? hostInfo.pairingCode : '— (see host PC screen)'}</div>
              </div>

              <div className="manual-field-group">
                <label className="manual-label">Direct Connection URL</label>
                <div className="manual-url-box">
                  <span className="manual-url-text">{controllerUrl}</span>
                  <button className="btn btn-secondary btn-sm" onClick={copyUrl}>
                    {copiedUrl ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <p className="manual-hint">
                Open the URL above in Google Chrome or Safari on your phone connected to the same Wi-Fi network.
              </p>
            </div>
          )}

          {/* Browser Controller Test Button */}
          <div className="pairing-panel-footer">
            <button
              className="btn btn-secondary btn-w100"
              onClick={onOpenMobileController}
            >
              🎮 Test Controller in Browser
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

