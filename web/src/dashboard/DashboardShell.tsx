import { h, ComponentChildren } from 'preact';
import { HostInfo } from '../protocol/types';
import { SidebarArtwork } from './components/ArtworkBackground';

export type DashboardTab = 'home' | 'controllers' | 'settings' | 'about';

interface DashboardShellProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  hostInfo: HostInfo;
  onRefreshStatus?: () => void;
  children: ComponentChildren;
}

export function DashboardShell({
  activeTab,
  onTabChange,
  hostInfo,
  onRefreshStatus,
  children,
}: DashboardShellProps) {
  // Connected controllers count calculation
  const totalSlots = hostInfo.controllerSlots || 4;
  const connectedCount = hostInfo.slots
    ? hostInfo.slots.filter((s) => s.connected).length
    : hostInfo.activeClientConnected
    ? 1
    : 0;

  // Latency calculation: average of connected slots or hostInfo.rttMs
  const connectedWithRtt = hostInfo.slots
    ? hostInfo.slots.filter((s) => s.connected && typeof s.rttMs === 'number' && (s.rttMs as number) > 0)
    : [];
  let avgLatency: number | null = null;
  if (connectedWithRtt.length > 0) {
    const sum = connectedWithRtt.reduce((acc, s) => acc + (s.rttMs || 0), 0);
    avgLatency = Math.round(sum / connectedWithRtt.length);
  } else if (typeof hostInfo.rttMs === 'number' && hostInfo.rttMs > 0) {
    avgLatency = hostInfo.rttMs;
  }

  // Active IP address
  const detectedIp =
    hostInfo.serverUrl.replace(/^https?:\/\//, '').split(':')[0] ||
    (hostInfo.ipAddresses && hostInfo.ipAddresses[0]) ||
    '127.0.0.1';

  return (
    <div className="dashboard-app-root">
      {/* ================= LEFT SIDEBAR ================= */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand-block">
          <div className="sidebar-brand-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="#ff303b">
              <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
            </svg>
          </div>
          <div>
            <div className="sidebar-brand-name">
              Pocket<span className="text-accent">Pad</span>
            </div>
            <div className="sidebar-brand-tagline">PHONE TO PC. PLAY ANYWHERE.</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`sidebar-nav-item ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => onTabChange('home')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Home</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'controllers' ? 'active' : ''}`}
            onClick={() => onTabChange('controllers')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="6" width="20" height="12" rx="4" />
              <path d="M6 12h4m-2-2v4" />
              <circle cx="17" cy="10" r="1" />
              <circle cx="15" cy="14" r="1" />
            </svg>
            <span>Controllers</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => onTabChange('settings')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => onTabChange('about')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>About</span>
          </button>
        </nav>

        {/* Torii Gate Artwork Container in bottom of sidebar */}
        <SidebarArtwork />
      </aside>

      {/* ================= MAIN CONTAINER ================= */}
      <div className="dashboard-main-viewport">
        {/* Top bar with server status badge and window controls */}
        <header className="dashboard-topbar">
          <div className="topbar-status-indicator">
            <span
              className={`topbar-status-dot ${
                hostInfo.status === 'ok' ? 'dot-green' : 'dot-warn'
              }`}
            />
            <div className="topbar-status-text">
              <span className="topbar-title">Server Running</span>
              <span className="topbar-version">v0.1.0</span>
            </div>
          </div>

          <div className="window-controls">
            <button className="win-btn" title="Minimize">
              <svg width="10" height="2" viewBox="0 0 10 2" fill="currentColor">
                <rect width="10" height="2" />
              </svg>
            </button>
            <button className="win-btn" title="Maximize">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.2">
                <rect x="0.6" y="0.6" width="8.8" height="8.8" />
              </svg>
            </button>
            <button className="win-btn win-btn-close" title="Close">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.4">
                <line x1="1" y1="1" x2="9" y2="9" />
                <line x1="9" y1="1" x2="1" y2="9" />
              </svg>
            </button>
          </div>
        </header>

        {/* Scrollable Main Content Area */}
        <main className="dashboard-content-scroll">{children}</main>

        {/* ================= PERSISTENT BOTTOM STATUS BAR ================= */}
        <footer className="dashboard-statusbar">
          {/* Segment 1: Server Status */}
          <div className="statusbar-segment">
            <div className="statusbar-label">Server Status</div>
            <div className="statusbar-value-row">
              <span className="status-dot dot-green" />
              <span className="statusbar-val-bold">Running</span>
            </div>
            <div className="statusbar-sub">
              Listening on {detectedIp}:{hostInfo.port}
            </div>
          </div>

          <div className="statusbar-divider" />

          {/* Segment 2: Connected Controllers */}
          <div className="statusbar-segment">
            <div className="statusbar-label">Connected Controllers</div>
            <div className="statusbar-value-row">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="6" width="20" height="12" rx="4" />
                <path d="M6 12h4m-2-2v4" />
                <circle cx="17" cy="10" r="1" />
                <circle cx="15" cy="14" r="1" />
              </svg>
              <span className="statusbar-val-bold">
                {connectedCount} / {totalSlots}
              </span>
            </div>
            <div className="statusbar-progress-bar">
              <div
                className="statusbar-progress-fill"
                style={{ width: `${(connectedCount / totalSlots) * 100}%` }}
              />
            </div>
          </div>

          <div className="statusbar-divider" />

          {/* Segment 3: Input Latency */}
          <div className="statusbar-segment">
            <div className="statusbar-label">Input Latency (Avg)</div>
            <div className="statusbar-value-row">
              <div className="latency-bars-icon">
                <span className="bar bar-1 active" />
                <span className="bar bar-2 active" />
                <span className="bar bar-3 active" />
                <span className={`bar bar-4 ${avgLatency && avgLatency < 20 ? 'active' : ''}`} />
              </div>
              <span className="statusbar-val-bold">
                {avgLatency !== null ? `${avgLatency} ms` : '—'}
              </span>
            </div>
          </div>

          <div className="statusbar-divider" />

          {/* Segment 4: Network Mode */}
          <div className="statusbar-segment">
            <div className="statusbar-label">Network Mode</div>
            <div className="statusbar-value-row">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" stroke-width="3" />
              </svg>
              <span className="statusbar-val-bold">Wi-Fi</span>
            </div>
            <div className="statusbar-sub">{detectedIp}</div>
          </div>

          <div className="statusbar-divider" />

          {/* Segment 5: Driver Status */}
          <div className="statusbar-segment statusbar-segment-driver">
            <div className="statusbar-label">Driver Status</div>
            <div className="statusbar-value-row">
              <span
                className={`status-dot ${
                  hostInfo.driverInstalled ? 'dot-green' : 'dot-red'
                }`}
              />
              <span className="statusbar-val-bold">
                {hostInfo.driverInstalled ? 'ViGEmBus Ready' : 'Driver Missing'}
              </span>
            </div>
            <div className="statusbar-sub">Xbox 360 controller emulation</div>
          </div>

          {onRefreshStatus && (
            <div className="statusbar-segment-action">
              <button
                className="btn btn-secondary btn-sm"
                onClick={onRefreshStatus}
                title="Refresh Driver Status"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M23 4v6h-6M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                <span>Check Again</span>
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}

