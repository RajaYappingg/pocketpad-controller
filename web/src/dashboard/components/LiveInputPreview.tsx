import { h } from 'preact';

interface LiveInputPreviewProps {
  thumbLX?: number; // -32768 to 32767
  thumbLY?: number; // -32768 to 32767
  buttons?: number; // bitmask of XINPUT_BUTTONS
  leftTrigger?: number; // 0 to 255
  rightTrigger?: number; // 0 to 255
  isConnected?: boolean;
}

export function LiveInputPreview({
  thumbLX = 0,
  thumbLY = 0,
  buttons = 0,
  leftTrigger = 0,
  rightTrigger = 0,
  isConnected = false,
}: LiveInputPreviewProps) {
  // Normalize thumb position to -8px .. +8px offset
  const normX = (thumbLX / 32767) * 8;
  const normY = -(thumbLY / 32767) * 8; // Invert Y for screen coordinates

  // Check button states if active
  const isA = Boolean(buttons & 0x1000);
  const isB = Boolean(buttons & 0x2000);
  const isX = Boolean(buttons & 0x4000);
  const isY = Boolean(buttons & 0x8000);

  const isDpadUp = Boolean(buttons & 0x0001);
  const isDpadDown = Boolean(buttons & 0x0002);
  const isDpadLeft = Boolean(buttons & 0x0004);
  const isDpadRight = Boolean(buttons & 0x0008);

  const ltPercent = Math.round((leftTrigger / 255) * 100);
  const rtPercent = Math.round((rightTrigger / 255) * 100);

  return (
    <div className="input-preview-group">
      <div className="input-preview-label">Input Preview</div>
      <div className="input-preview-row">
        {/* Analog Stick Circle */}
        <div className="input-stick-container" title="Left Thumbstick">
          <div className="input-stick-outer">
            <div
              className="input-stick-thumb"
              style={{
                transform: `translate(${normX}px, ${normY}px)`,
                borderColor: isConnected ? '#ffffff' : '#6b7280',
              }}
            />
          </div>
        </div>

        {/* D-Pad 4-way Cross */}
        <div className="input-dpad-container" title="D-Pad">
          <svg width="34" height="34" viewBox="0 0 36 36" fill="none">
            {/* Background cross */}
            <path
              d="M13 3 h10 v10 h10 v10 h-10 v10 h-10 v-10 h-10 v-10 h10 z"
              fill="#181920"
              stroke="#2c2d38"
              stroke-width="1.2"
            />
            {/* Center disc */}
            <circle cx="18" cy="18" r="4.5" fill="#121318" />
            {/* Up arrow indicator */}
            <path
              d="M18 6 L15 10 L21 10 Z"
              fill={isDpadUp ? '#ff303b' : '#3d3e4c'}
            />
            {/* Down arrow indicator */}
            <path
              d="M18 30 L15 26 L21 26 Z"
              fill={isDpadDown ? '#ff303b' : '#3d3e4c'}
            />
            {/* Left arrow indicator */}
            <path
              d="M6 18 L10 15 L10 21 Z"
              fill={isDpadLeft ? '#ff303b' : '#3d3e4c'}
            />
            {/* Right arrow indicator */}
            <path
              d="M30 18 L26 15 L26 21 Z"
              fill={isDpadRight ? '#ff303b' : '#3d3e4c'}
            />
          </svg>
        </div>

        {/* ABXY Button Cluster */}
        <div className="input-abxy-container" title="ABXY Buttons">
          <div className="input-abxy-grid">
            {/* Y Button (Top) */}
            <div
              className={`input-btn-badge btn-y ${isY ? 'pressed' : ''}`}
              style={{ gridArea: 'y' }}
            >
              Y
            </div>
            {/* X Button (Left) */}
            <div
              className={`input-btn-badge btn-x ${isX ? 'pressed' : ''}`}
              style={{ gridArea: 'x' }}
            >
              X
            </div>
            {/* B Button (Right) */}
            <div
              className={`input-btn-badge btn-b ${isB ? 'pressed' : ''}`}
              style={{ gridArea: 'b' }}
            >
              B
            </div>
            {/* A Button (Bottom) */}
            <div
              className={`input-btn-badge btn-a ${isA ? 'pressed' : ''}`}
              style={{ gridArea: 'a' }}
            >
              A
            </div>
          </div>
        </div>

        {/* Analog Triggers (LT & RT) */}
        <div className="input-triggers-container">
          {/* Left Trigger (LT) */}
          <div className="input-trigger-bar-wrap">
            <div className="input-trigger-track">
              <div
                className="input-trigger-fill"
                style={{ height: `${Math.max(10, ltPercent)}%` }}
              />
            </div>
            <span className="input-trigger-label">LT</span>
          </div>

          {/* Right Trigger (RT) */}
          <div className="input-trigger-bar-wrap">
            <div className="input-trigger-track">
              <div
                className="input-trigger-fill"
                style={{ height: `${Math.max(10, rtPercent)}%` }}
              />
            </div>
            <span className="input-trigger-label">RT</span>
          </div>
        </div>
      </div>
    </div>
  );
}

