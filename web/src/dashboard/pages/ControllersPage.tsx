import { h } from 'preact';
import { useState } from 'preact/hooks';
import { HostInfo, SlotInfo } from '../../protocol/types';
import { PhonePreviewGraphic } from '../components/PhonePreviewGraphic';
import { LiveInputPreview } from '../components/LiveInputPreview';

interface ControllersPageProps {
  hostInfo: HostInfo;
  onDisconnectClient: (slot?: number) => void;
  onOpenMobileController: () => void;
  onNavigateToHome: () => void;
  onNavigateToSettings: () => void;
}

export function ControllersPage({
  hostInfo,
  onDisconnectClient,
  onOpenMobileController,
  onNavigateToHome,
  onNavigateToSettings,
}: ControllersPageProps) {
  const [deviceNames, setDeviceNames] = useState<Record<number, string>>({
    0: 'Phone 1',
    1: 'Phone 2',
    2: 'Phone 3',
    3: 'Phone 4',
  });
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [tempName, setTempName] = useState('');

  // Fallback slots if not provided by backend
  const defaultSlots: SlotInfo[] = Array.from({ length: hostInfo.controllerSlots || 4 }, (_, i) => ({
    slotIndex: i,
    connected: i === 0 ? hostInfo.activeClientConnected : false,
    clientIp: i === 0 ? hostInfo.activeClientIp : undefined,
    rttMs: i === 0 ? hostInfo.rttMs : undefined,
    packetsReceived: i === 0 ? hostInfo.packetsReceived : 0,
  }));
  const displaySlots = hostInfo.slots && hostInfo.slots.length > 0 ? hostInfo.slots : defaultSlots;
  const connectedSlots = displaySlots.filter((s) => s.connected);

  const startRename = (slotIndex: number) => {
    setEditingSlot(slotIndex);
    setTempName(deviceNames[slotIndex] || `Phone ${slotIndex + 1}`);
  };

  const saveRename = (slotIndex: number) => {
    if (tempName.trim()) {
      setDeviceNames((prev) => ({ ...prev, [slotIndex]: tempName.trim() }));
    }
    setEditingSlot(null);
  };

  // Player badge themes
  const playerThemes = [
    { name: 'Player 1', bg: 'rgba(255, 48, 59, 0.15)', text: '#ff4650', border: 'rgba(255, 48, 59, 0.4)' },
    { name: 'Player 2', bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.4)' },
    { name: 'Player 3', bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.4)' },
    { name: 'Player 4', bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.4)' },
  ];

  return (
    <div className="controllers-page-layout">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-heading">Controllers</h1>
          <p className="page-subheading">Manage your connected controllers and devices.</p>
        </div>

        <div className="page-header-actions">
          {/* Mode Pill Indicator */}
          <div className="mode-pill-wrap">
            <span className="mode-pill-active">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" stroke-width="3" />
              </svg>
              <span>Wi-Fi Mode</span>
              <span className="mode-sub">Fast & Stable</span>
            </span>

            <span className="mode-pill-inactive">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" />
              </svg>
              <span>Bluetooth Mode</span>
              <span className="mode-sub">Low Latency (Beta)</span>
            </span>
          </div>

          <button
            className="btn btn-outline-danger"
            onClick={onNavigateToHome}
          >
            + Add Controller
          </button>
        </div>
      </div>

      {/* Main Controllers List */}
      <div className="controllers-stack-list">
        {connectedSlots.length > 0 ? (
          connectedSlots.map((slot) => {
            const pTheme = playerThemes[slot.slotIndex % playerThemes.length];
            const isEditing = editingSlot === slot.slotIndex;
            const displayName = deviceNames[slot.slotIndex] || `Phone ${slot.slotIndex + 1}`;

            return (
              <div
                key={slot.slotIndex}
                className={`controller-row-card ${slot.slotIndex === 0 ? 'highlighted-row' : ''}`}
              >
                {/* Section 1: Phone Device Preview */}
                <div className="row-sec-device-preview">
                  <PhonePreviewGraphic playerNumber={slot.slotIndex + 1} />
                </div>

                {/* Section 2: Device Info */}
                <div className="row-sec-device-info">
                  <div className="device-title-row">
                    <span className="status-dot dot-green" />
                    {isEditing ? (
                      <input
                        type="text"
                        className="device-rename-input"
                        value={tempName}
                        onInput={(e) => setTempName((e.target as HTMLInputElement).value)}
                        onBlur={() => saveRename(slot.slotIndex)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(slot.slotIndex);
                          if (e.key === 'Escape') setEditingSlot(null);
                        }}
                        autoFocus
                      />
                    ) : (
                      <span className="device-name-text">{displayName}</span>
                    )}
                    <button
                      className="btn-edit-icon"
                      onClick={() => (isEditing ? saveRename(slot.slotIndex) : startRename(slot.slotIndex))}
                      title="Rename device"
                    >
                      ✏️
                    </button>

                    {/* Player Badge */}
                    <span
                      className="player-badge"
                      style={{
                        background: pTheme.bg,
                        color: pTheme.text,
                        borderColor: pTheme.border,
                      }}
                    >
                      {pTheme.name}
                    </span>
                  </div>

                  <div className="device-subtext">
                    {slot.clientIp ? `Smartphone • ${slot.clientIp}` : 'Android (PocketPad Client)'}
                  </div>

                  {/* Metadata Chips */}
                  <div className="device-meta-chips">
                    <span className="meta-chip">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                      </svg>
                      Wi-Fi
                    </span>

                    <span className="meta-chip">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="2" y="10" width="3" height="11" rx="1" />
                        <rect x="8" y="7" width="3" height="14" rx="1" />
                        <rect x="14" y="4" width="3" height="17" rx="1" />
                        <rect x="20" y="2" width="3" height="19" rx="1" />
                      </svg>
                      {slot.rttMs !== undefined && slot.rttMs !== null ? `${slot.rttMs} ms` : '<1 ms'}
                    </span>

                    <span className="meta-chip meta-chip-battery">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
                        <rect x="2" y="7" width="16" height="10" rx="2" />
                        <line x1="20" y1="10" x2="20" y2="14" />
                        <rect x="4" y="9" width="10" height="6" fill="#22c55e" rx="1" />
                      </svg>
                      78%
                    </span>
                  </div>
                </div>

                {/* Section 3: Input Preview */}
                <div className="row-sec-input-preview">
                  <LiveInputPreview isConnected={slot.connected} />
                </div>

                {/* Section 4: Actions */}
                <div className="row-sec-actions">
                  <button
                    className="card-menu-btn"
                    onClick={() => onDisconnectClient(slot.slotIndex)}
                    title="Disconnect this controller"
                  >
                    •••
                  </button>

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={onOpenMobileController}
                  >
                    🎮 Open Controller
                  </button>

                  <button
                    className="btn btn-outline-secondary btn-sm"
                    onClick={onNavigateToSettings}
                  >
                    ⚙ Settings
                  </button>

                  <button
                    className="btn btn-danger btn-xs"
                    onClick={() => onDisconnectClient(slot.slotIndex)}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          /* Empty State when no controllers are connected */
          <div className="controllers-empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ff303b" stroke-width="1.8">
                <rect x="2" y="6" width="20" height="12" rx="4" />
                <line x1="7" y1="12" x2="11" y2="12" />
                <line x1="9" y1="10" x2="9" y2="14" />
                <circle cx="16" cy="10" r="1.5" fill="#eab308" />
                <circle cx="18" cy="12" r="1.5" fill="#ef4444" />
              </svg>
            </div>
            <h3 className="empty-state-title">No Controllers Connected</h3>
            <p className="empty-state-desc">
              Scan the QR code from the home page with your phone camera to pair your first controller.
            </p>
            <button className="btn btn-primary" onClick={onNavigateToHome}>
              + Connect Controller
            </button>
          </div>
        )}

        {/* Add New Controller Dashed Card (Reference Image 2) */}
        <div
          className="controller-row-card card-add-wide"
          onClick={onNavigateToHome}
        >
          <div className="add-icon-circle-lg">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <div className="add-wide-text">
            <div className="add-wide-title">Add New Controller</div>
            <div className="add-wide-desc">
              Scan the QR code from the home page or enter the pairing code manually.
            </div>
          </div>
          <div className="add-wide-arrow">›</div>
        </div>
      </div>
    </div>
  );
}

