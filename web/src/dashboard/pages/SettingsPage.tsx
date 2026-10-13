import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { HostInfo, ControllerSettings, DEFAULT_SETTINGS } from '../../protocol/types';

interface SettingsPageProps {
  hostInfo: HostInfo;
  settings?: ControllerSettings;
  onUpdateSettings?: (settings: ControllerSettings) => void;
  onRefreshStatus?: () => void;
}

export function SettingsPage({
  hostInfo,
  settings: initialSettings = DEFAULT_SETTINGS,
  onUpdateSettings,
  onRefreshStatus,
}: SettingsPageProps) {
  const [activeCategory, setActiveCategory] = useState<
    'general' | 'connection' | 'controller' | 'input' | 'appearance' | 'advanced'
  >('general');

  // Local settings state
  const [settings, setSettings] = useState<ControllerSettings>(initialSettings);
  const [serverPort, setServerPort] = useState(hostInfo.port || 8080);
  const [autoOpenDashboard, setAutoOpenDashboard] = useState(true);
  const [startWithWindows, setStartWithWindows] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [vibrationIntensity, setVibrationIntensity] = useState(70);
  const [testVibrationActive, setTestVibrationActive] = useState(false);
  const [triggerSensitivity, setTriggerSensitivity] = useState(1.0);
  const [swapAB, setSwapAB] = useState(false);
  const [controlLayout, setControlLayout] = useState('Xbox 360 (Default)');
  const [language, setLanguage] = useState('English');
  const [theme, setTheme] = useState('Red (Default)');
  const [reduceAnimations, setReduceAnimations] = useState(false);
  const [showLatency, setShowLatency] = useState(true);
  const [showBattery, setShowBattery] = useState(true);
  const [connectionSounds, setConnectionSounds] = useState(true);
  const [maxUpdateRate, setMaxUpdateRate] = useState('120 Hz');
  const [compression, setCompression] = useState('Enabled');
  const [latencySmoothing, setLatencySmoothing] = useState(true);
  const [connectionTimeout, setConnectionTimeout] = useState(2000);
  const [staleThreshold, setStaleThreshold] = useState(250);
  const [connectionMode, setConnectionMode] = useState<'wifi' | 'bluetooth'>('wifi');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  // P4: pick up external changes (e.g. phone SettingsModal editing the same
  // ControllerSettings object) instead of freezing the first props value.
  useEffect(() => {
    setSettings(initialSettings);
  }, [initialSettings]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 2500);
  };

  // P4: pills are navigation (scroll to card), not a filter — every card
  // stays mounted so no setting is ever hidden from search/DOM.
  const scrollToCard = (id: string, category: typeof activeCategory) => {
    setActiveCategory(category);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSettingChange = <K extends keyof ControllerSettings>(
    key: K,
    val: ControllerSettings[K]
  ) => {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    if (onUpdateSettings) {
      onUpdateSettings(updated);
    }
  };

  const handleTestVibration = () => {
    setTestVibrationActive(true);
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([100, 50, 150]);
      } catch {
        // ignore
      }
    }
    showToast('Testing vibration pulse (70%)...');
    setTimeout(() => setTestVibrationActive(false), 600);
  };

  const handleClearPairings = () => {
    try {
      localStorage.removeItem('pocketpad_session_token');
      localStorage.removeItem('pocketpad_pairing_code');
      showToast('All paired devices and local tokens cleared.');
    } catch {
      showToast('Failed to clear local data.');
    }
  };

  const handleResetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    setServerPort(8080);
    setAutoOpenDashboard(true);
    setStartWithWindows(false);
    setMinimizeToTray(true);
    setVibrationIntensity(70);
    setTriggerSensitivity(1.0);
    setSwapAB(false);
    setControlLayout('Xbox 360 (Default)');
    setReduceAnimations(false);
    setShowLatency(true);
    setShowBattery(true);
    setConnectionSounds(true);
    setMaxUpdateRate('120 Hz');
    setCompression('Enabled');
    setLatencySmoothing(true);
    setConnectionTimeout(2000);
    setStaleThreshold(250);
    if (onUpdateSettings) {
      onUpdateSettings(DEFAULT_SETTINGS);
    }
    showToast('Settings restored to defaults.');
  };

  return (
    <div className="settings-page-layout">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="settings-toast">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-heading">Settings</h1>
          <p className="page-subheading">
            Customize your server, controllers, and connection preferences.
          </p>
        </div>
      </div>

      {/* Category Pills Bar — navigation shortcuts (scroll to card) */}
      <div className="settings-categories-nav">
        <button
          className={`settings-cat-pill ${activeCategory === 'general' ? 'active' : ''}`}
          onClick={() => scrollToCard('card-server', 'general')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>General</span>
        </button>

        <button
          className={`settings-cat-pill ${activeCategory === 'connection' ? 'active' : ''}`}
          onClick={() => scrollToCard('card-connection-mode', 'connection')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12.55a11 11 0 0 1 14.08 0" />
            <path d="M1.42 9a16 16 0 0 1 21.16 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" stroke-width="3" />
          </svg>
          <span>Connection</span>
        </button>

        <button
          className={`settings-cat-pill ${activeCategory === 'controller' ? 'active' : ''}`}
          onClick={() => scrollToCard('card-default-controller', 'controller')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="6" width="20" height="12" rx="4" />
            <path d="M6 12h4m-2-2v4" />
            <circle cx="17" cy="10" r="1" />
            <circle cx="15" cy="14" r="1" />
          </svg>
          <span>Controller</span>
        </button>

        <button
          className={`settings-cat-pill ${activeCategory === 'input' ? 'active' : ''}`}
          onClick={() => scrollToCard('card-default-controller', 'input')}
          title="Sensitivity and deadzone sliders live in Default Controller Settings"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="4" y1="21" x2="4" y2="14" />
            <line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" />
            <line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" />
            <line x1="9" y1="8" x2="15" y2="8" />
            <line x1="17" y1="16" x2="23" y2="16" />
          </svg>
          <span>Input & Deadzone</span>
        </button>

        <button
          className={`settings-cat-pill ${activeCategory === 'appearance' ? 'active' : ''}`}
          onClick={() => scrollToCard('card-app', 'appearance')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <span>Appearance</span>
        </button>

        <button
          className={`settings-cat-pill ${activeCategory === 'advanced' ? 'active' : ''}`}
          onClick={() => scrollToCard('card-driver', 'advanced')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          <span>Advanced</span>
        </button>
      </div>

      {/* 3-Column Settings Grid */}
      <div className="settings-grid-3col">
        {/* ================= COLUMN 1 ================= */}
        <div className="settings-col">
          {/* Card: Server Settings (dashboard-local display; host uses --port/POCKETPAD_PORT) */}
          <div className="settings-card" id="card-server">
            <div className="settings-card-head">
              <div className="settings-card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                  <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                  <line x1="6" y1="6" x2="6.01" y2="6" />
                  <line x1="6" y1="18" x2="6.01" y2="18" />
                </svg>
              </div>
              <div>
                <h3 className="settings-card-title">Server Settings</h3>
                <p className="settings-card-desc">Configure how PocketPad runs on your PC.</p>
              </div>
            </div>

            <div className="settings-field-group">
              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Server Port</span>
                  <span className="settings-field-sub">Port for web UI and controller connections. Display only — restart the host with --port N or POCKETPAD_PORT=N to change it.</span>
                </div>
                <div className="settings-field-control">
                  <input
                    type="number"
                    className="settings-input-number"
                    value={serverPort}
                    min={1024}
                    max={65535}
                    onChange={(e) => setServerPort(parseInt((e.target as HTMLInputElement).value) || 8080)}
                  />
                </div>
              </div>

              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Auto Open Dashboard</span>
                  <span className="settings-field-sub">Open the dashboard in your browser when the server starts.</span>
                </div>
                <div className="settings-field-control">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={autoOpenDashboard}
                      onChange={(e) => setAutoOpenDashboard((e.target as HTMLInputElement).checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Start with Windows</span>
                  <span className="settings-field-sub">Automatically start PocketPad when Windows boots.</span>
                </div>
                <div className="settings-field-control">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={startWithWindows}
                      onChange={(e) => setStartWithWindows((e.target as HTMLInputElement).checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Minimize to System Tray</span>
                  <span className="settings-field-sub">Keep running in the background when minimized.</span>
                </div>
                <div className="settings-field-control">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={minimizeToTray}
                      onChange={(e) => setMinimizeToTray((e.target as HTMLInputElement).checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Card: Default Controller Settings */}
          <div className="settings-card" id="card-default-controller">
            <div className="settings-card-head">
              <div className="settings-card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 11h4m-2-2v4M15 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm4 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                  <rect x="2" y="6" width="20" height="12" rx="4" />
                </svg>
              </div>
              <div>
                <h3 className="settings-card-title">Default Controller Settings</h3>
                <p className="settings-card-desc">These settings apply to new controllers.</p>
              </div>
            </div>

            <div className="settings-field-group">
              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Control Layout (local preview only)</span>
                </div>
                <div className="settings-field-control">
                  <select
                    className="settings-select"
                    value={controlLayout}
                    onChange={(e) => setControlLayout((e.target as HTMLSelectElement).value)}
                  >
                    <option value="Xbox 360 (Default)">Xbox 360 (Default)</option>
                    <option value="PlayStation DualShock">PlayStation DualShock</option>
                    <option value="Nintendo Pro">Nintendo Pro</option>
                  </select>
                </div>
              </div>

              <div className="settings-field-row settings-field-slider-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Stick Sensitivity</span>
                </div>
                <div className="settings-slider-wrap">
                  <input
                    type="range"
                    className="settings-range"
                    min="0.5"
                    max="2.0"
                    step="0.05"
                    value={settings.stickSensitivity}
                    onInput={(e) => handleSettingChange('stickSensitivity', parseFloat((e.target as HTMLInputElement).value))}
                  />
                  <span className="settings-slider-value">{settings.stickSensitivity.toFixed(2)}</span>
                </div>
              </div>

              <div className="settings-field-row settings-field-slider-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Stick Deadzone</span>
                </div>
                <div className="settings-slider-wrap">
                  <input
                    type="range"
                    className="settings-range"
                    min="0.0"
                    max="0.3"
                    step="0.01"
                    value={settings.stickDeadzone}
                    onInput={(e) => handleSettingChange('stickDeadzone', parseFloat((e.target as HTMLInputElement).value))}
                  />
                  <span className="settings-slider-value">{settings.stickDeadzone.toFixed(2)}</span>
                </div>
              </div>

              <div className="settings-field-row settings-field-slider-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Control Scale</span>
                  <span className="settings-field-sub">Scales the phone gamepad layout for small screens.</span>
                </div>
                <div className="settings-slider-wrap">
                  <input
                    type="range"
                    className="settings-range"
                    min="0.8"
                    max="1.2"
                    step="0.05"
                    value={settings.controlScale}
                    onInput={(e) => handleSettingChange('controlScale', parseFloat((e.target as HTMLInputElement).value))}
                  />
                  <span className="settings-slider-value">{settings.controlScale.toFixed(2)}</span>
                </div>
              </div>

              <div className="settings-field-row settings-field-slider-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Trigger Sensitivity (local preview only)</span>
                </div>
                <div className="settings-slider-wrap">
                  <input
                    type="range"
                    className="settings-range"
                    min="0.5"
                    max="2.0"
                    step="0.05"
                    value={triggerSensitivity}
                    onInput={(e) => setTriggerSensitivity(parseFloat((e.target as HTMLInputElement).value))}
                  />
                  <span className="settings-slider-value">{triggerSensitivity.toFixed(2)}</span>
                </div>
              </div>

              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Swap A / B Buttons (local preview only)</span>
                </div>
                <div className="settings-field-control">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={swapAB}
                      onChange={(e) => setSwapAB((e.target as HTMLInputElement).checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Invert Y Axis (Left Stick)</span>
                </div>
                <div className="settings-field-control">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={settings.invertYLeft}
                      onChange={(e) => handleSettingChange('invertYLeft', (e.target as HTMLInputElement).checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Invert Y Axis (Right Stick)</span>
                </div>
                <div className="settings-field-control">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={settings.invertYRight}
                      onChange={(e) => handleSettingChange('invertYRight', (e.target as HTMLInputElement).checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ================= COLUMN 2 ================= */}
        <div className="settings-col">
          {/* Card: Connection Mode */}
          <div className="settings-card" id="card-connection-mode">
            <div className="settings-card-head">
              <div className="settings-card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                  <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                  <line x1="12" y1="20" x2="12.01" y2="20" stroke-width="3" />
                </svg>
              </div>
              <div>
                <h3 className="settings-card-title">Connection Mode</h3>
                <p className="settings-card-desc">Choose how controllers connect to your PC.</p>
              </div>
            </div>

            <div className="settings-mode-selector">
              <div
                className={`settings-mode-card ${connectionMode === 'wifi' ? 'active' : ''}`}
                onClick={() => setConnectionMode('wifi')}
              >
                <div className="settings-mode-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                    <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                    <line x1="12" y1="20" x2="12.01" y2="20" stroke-width="3" />
                  </svg>
                </div>
                <div className="settings-mode-label">Wi-Fi Mode</div>
                <div className="settings-mode-sub">Fast & stable</div>
                <div className="settings-mode-radio">
                  <div className={`radio-dot ${connectionMode === 'wifi' ? 'selected' : ''}`} />
                </div>
              </div>

              <div
                className={`settings-mode-card ${connectionMode === 'bluetooth' ? 'active' : ''}`}
                onClick={() => setConnectionMode('bluetooth')}
              >
                <div className="settings-mode-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" />
                  </svg>
                </div>
                <div className="settings-mode-label">Bluetooth Mode</div>
                <div className="settings-mode-sub">Lower latency (beta)</div>
                <div className="settings-mode-radio">
                  <div className={`radio-dot ${connectionMode === 'bluetooth' ? 'selected' : ''}`} />
                </div>
              </div>
            </div>

            <div className="settings-info-notice">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>
                Bluetooth mode requires your PC to have Bluetooth and support Bluetooth HID. Performance may vary.
              </span>
            </div>
          </div>

          {/* Card: Vibration & Haptics */}
          <div className="settings-card" id="card-haptics">
            <div className="settings-card-head">
              <div className="settings-card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                  <path d="M1 9l2 3-2 3" />
                  <path d="M23 9l-2 3 2 3" />
                </svg>
              </div>
              <div>
                <h3 className="settings-card-title">Vibration & Haptics</h3>
                <p className="settings-card-desc">Enable vibration feedback on supported phones.</p>
              </div>
            </div>

            <div className="settings-field-group">
              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Haptic Feedback</span>
                </div>
                <div className="settings-field-control">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={settings.hapticsEnabled}
                      onChange={(e) => handleSettingChange('hapticsEnabled', (e.target as HTMLInputElement).checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="settings-field-row settings-field-slider-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Vibration Intensity</span>
                </div>
                <div className="settings-slider-wrap">
                  <input
                    type="range"
                    className="settings-range"
                    min="0"
                    max="100"
                    step="5"
                    value={vibrationIntensity}
                    disabled={!settings.hapticsEnabled}
                    onInput={(e) => setVibrationIntensity(parseInt((e.target as HTMLInputElement).value))}
                  />
                  <span className="settings-slider-value">{vibrationIntensity}%</span>
                </div>
              </div>

              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Test Vibration</span>
                </div>
                <div className="settings-field-control">
                  <button
                    className={`btn btn-test-vibrate ${testVibrationActive ? 'active-pulse' : ''}`}
                    onClick={handleTestVibration}
                    disabled={!settings.hapticsEnabled}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    <span>Test</span>
                  </button>
                </div>
              </div>

              <div className="settings-info-notice">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>Haptics require browser support on your phone.</span>
              </div>
            </div>
          </div>

          {/* Card: Data & Privacy */}
          <div className="settings-card" id="card-data">
            <div className="settings-card-head">
              <div className="settings-card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <h3 className="settings-card-title">Data & Privacy</h3>
                <p className="settings-card-desc">Manage your local data and application behavior.</p>
              </div>
            </div>

            <div className="settings-field-group">
              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Clear All Pairings</span>
                  <span className="settings-field-sub">Remove all paired devices and saved data.</span>
                </div>
                <div className="settings-field-control">
                  <button className="btn btn-outline-danger btn-sm" onClick={handleClearPairings}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    <span>Clear</span>
                  </button>
                </div>
              </div>

              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Reset to Default Settings</span>
                  <span className="settings-field-sub">Restore all settings to their default values.</span>
                </div>
                <div className="settings-field-control">
                  <button className="btn btn-secondary btn-sm" onClick={handleResetSettings}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="1 4 1 10 7 10" />
                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                    </svg>
                    <span>Reset</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ================= COLUMN 3 ================= */}
        <div className="settings-col">
          {/* Card: App Settings */}
          <div className="settings-card" id="card-app">
            <div className="settings-card-head">
              <div className="settings-card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </div>
              <div>
                <h3 className="settings-card-title">App Settings</h3>
                <p className="settings-card-desc">General application preferences.</p>
              </div>
            </div>

            <div className="settings-field-group">
              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Language</span>
                </div>
                <div className="settings-field-control">
                  <select
                    className="settings-select"
                    value={language}
                    onChange={(e) => setLanguage((e.target as HTMLSelectElement).value)}
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Español</option>
                    <option value="Japanese">日本語</option>
                    <option value="German">Deutsch</option>
                  </select>
                </div>
              </div>

              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Theme</span>
                </div>
                <div className="settings-field-control">
                  <select
                    className="settings-select"
                    value={theme}
                    onChange={(e) => setTheme((e.target as HTMLSelectElement).value)}
                  >
                    <option value="Red (Default)">Red (Default)</option>
                    <option value="Crimson Dark">Crimson Dark</option>
                    <option value="Midnight Blue">Midnight Blue</option>
                    <option value="Cyberpunk Neon">Cyberpunk Neon</option>
                  </select>
                </div>
              </div>

              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Reduce Animations</span>
                </div>
                <div className="settings-field-control">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={reduceAnimations}
                      onChange={(e) => setReduceAnimations((e.target as HTMLInputElement).checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Show Latency Indicator</span>
                </div>
                <div className="settings-field-control">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={showLatency}
                      onChange={(e) => setShowLatency((e.target as HTMLInputElement).checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Show Battery Level</span>
                </div>
                <div className="settings-field-control">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={showBattery}
                      onChange={(e) => setShowBattery((e.target as HTMLInputElement).checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Play Connection Sounds</span>
                </div>
                <div className="settings-field-control">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={connectionSounds}
                      onChange={(e) => setConnectionSounds((e.target as HTMLInputElement).checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Card: Network Settings (display-only in this build; thresholds live in the host watchdog) */}
          <div className="settings-card" id="card-network">
            <div className="settings-card-head">
              <div className="settings-card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                  <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                  <line x1="12" y1="20" x2="12.01" y2="20" stroke-width="3" />
                </svg>
              </div>
              <div>
                <h3 className="settings-card-title">Network Settings</h3>
                <p className="settings-card-desc">Fine-tune network and performance options.</p>
              </div>
            </div>

            <div className="settings-field-group">
              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Max Update Rate</span>
                </div>
                <div className="settings-field-control">
                  <select
                    className="settings-select"
                    value={maxUpdateRate}
                    onChange={(e) => setMaxUpdateRate((e.target as HTMLSelectElement).value)}
                  >
                    <option value="120 Hz">120 Hz</option>
                    <option value="90 Hz">90 Hz</option>
                    <option value="60 Hz">60 Hz</option>
                    <option value="30 Hz">30 Hz</option>
                  </select>
                </div>
              </div>

              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Compression</span>
                </div>
                <div className="settings-field-control">
                  <select
                    className="settings-select"
                    value={compression}
                    onChange={(e) => setCompression((e.target as HTMLSelectElement).value)}
                  >
                    <option value="Enabled">Enabled</option>
                    <option value="Disabled">Disabled</option>
                  </select>
                </div>
              </div>

              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Enable Latency Smoothing</span>
                </div>
                <div className="settings-field-control">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={latencySmoothing}
                      onChange={(e) => setLatencySmoothing((e.target as HTMLInputElement).checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Connection Timeout</span>
                </div>
                <div className="settings-field-control settings-unit-wrap">
                  <input
                    type="number"
                    className="settings-input-number"
                    value={connectionTimeout}
                    step={100}
                    onChange={(e) => setConnectionTimeout(parseInt((e.target as HTMLInputElement).value) || 2000)}
                  />
                  <span className="settings-unit-label">ms</span>
                </div>
              </div>

              <div className="settings-field-row">
                <div className="settings-field-info">
                  <span className="settings-field-label">Stale Input Threshold</span>
                </div>
                <div className="settings-field-control settings-unit-wrap">
                  <input
                    type="number"
                    className="settings-input-number"
                    value={staleThreshold}
                    step={25}
                    onChange={(e) => setStaleThreshold(parseInt((e.target as HTMLInputElement).value) || 250)}
                  />
                  <span className="settings-unit-label">ms</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card: Driver Status (ViGEmBus) */}
          <div className="settings-card" id="card-driver">
            <div className="settings-card-head">
              <div className="settings-card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                  <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                  <line x1="6" y1="6" x2="6.01" y2="6" />
                  <line x1="6" y1="18" x2="6.01" y2="18" />
                </svg>
              </div>
              <div>
                <h3 className="settings-card-title">Driver Status (ViGEmBus)</h3>
                <p className="settings-card-desc">Required for Xbox 360 controller emulation.</p>
              </div>
            </div>

            <div className="settings-driver-box">
              <div className="settings-driver-status-row">
                <div className="settings-driver-status-info">
                  <div className="settings-driver-status-text">
                    <span
                      className={`status-dot ${hostInfo.driverInstalled ? 'dot-green' : 'dot-red'}`}
                    />
                    <span className="driver-ready-text">
                      {hostInfo.driverInstalled ? 'Driver Ready' : 'Driver Missing'}
                    </span>
                  </div>
                  <div className="driver-sub-text">
                    {hostInfo.driverInstalled
                      ? 'ViGEmBus is installed and working correctly.'
                      : hostInfo.driverReason || 'ViGEmBus driver is not detected on this system.'}
                  </div>
                </div>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    if (onRefreshStatus) onRefreshStatus();
                    showToast('Checking driver status...');
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 4v6h-6M1 20v-6h6" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  <span>Check Again</span>
                </button>
              </div>

              <a
                href={hostInfo.helpUrl || 'https://github.com/nefarius/ViGEmBus/releases'}
                target="_blank"
                rel="noreferrer"
                className="settings-driver-guide-link"
              >
                <div className="guide-link-left">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  <span>Open Driver Guide</span>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

