import { h } from 'preact';

interface PhonePreviewGraphicProps {
  playerNumber?: number;
  width?: number;
  height?: number;
}

export function PhonePreviewGraphic({
  playerNumber = 1,
  width = 175,
  height = 98,
}: PhonePreviewGraphicProps) {
  // Accent colors per player: P1 red, P2 blue, P3 amber, P4 green
  const accentColor =
    playerNumber === 1
      ? '#ff303b'
      : playerNumber === 2
      ? '#3b82f6'
      : playerNumber === 3
      ? '#f59e0b'
      : '#10b981';

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 160 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="phone-preview-svg"
    >
      <defs>
        <linearGradient id={`phoneBezel-${playerNumber}`} x1="0" y1="0" x2="160" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#2d303a" />
          <stop offset="100%" stop-color="#14151a" />
        </linearGradient>
        <radialGradient id={`screenGlow-${playerNumber}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color={accentColor} stop-opacity="0.15" />
          <stop offset="100%" stop-color="#070709" stop-opacity="1" />
        </radialGradient>
      </defs>

      {/* Phone Outer Chassis */}
      <rect x="2" y="2" width="156" height="86" rx="10" fill={`url(#phoneBezel-${playerNumber})`} stroke="#3b3e4c" stroke-width="1.2" />

      {/* Phone Screen Display */}
      <rect x="7" y="6" width="146" height="78" rx="6" fill={`url(#screenGlow-${playerNumber})`} />

      {/* Camera punch-hole / notch (landscape left side or top) */}
      <circle cx="12" cy="45" r="2" fill="#0c0d10" stroke="#1f2129" stroke-width="0.8" />

      {/* Top Bar of Virtual Controller */}
      <rect x="20" y="9" width="120" height="7" rx="3" fill="#13141a" opacity="0.8" />
      <circle cx="26" cy="12.5" r="1.5" fill={accentColor} />
      <text x="32" y="14" font-size="4" fill="#a0a4b8" font-family="sans-serif">PocketPad P{playerNumber}</text>
      <text x="130" y="14" font-size="4" fill="#10b981" font-family="sans-serif">● 6ms</text>

      {/* Left Stick (LS) */}
      <circle cx="34" cy="48" r="14" fill="#151720" stroke="#2c2f3d" stroke-width="1" />
      <circle cx="34" cy="48" r="7" fill="#20222e" stroke={accentColor} stroke-width="1" />

      {/* D-Pad (Center-Left) */}
      <path
        d="M60 43 h4 v-4 h4 v4 h4 v4 h-4 v4 h-4 v-4 h-4 z"
        fill="#1e202a"
        stroke="#333748"
        stroke-width="0.8"
      />

      {/* Right Stick (RS) */}
      <circle cx="102" cy="55" r="14" fill="#151720" stroke="#2c2f3d" stroke-width="1" />
      <circle cx="102" cy="55" r="7" fill="#20222e" stroke={accentColor} stroke-width="1" />

      {/* ABXY Diamond (Top-Right) */}
      <g transform="translate(130, 44)">
        {/* Y */}
        <circle cx="0" cy="-8" r="3.2" fill="#1b1c24" stroke="#eab308" stroke-width="0.8" />
        <text x="0" y="-6.5" font-size="3.5" fill="#eab308" text-anchor="middle" font-family="sans-serif" font-weight="bold">Y</text>
        {/* X */}
        <circle cx="-8" cy="0" r="3.2" fill="#1b1c24" stroke="#3b82f6" stroke-width="0.8" />
        <text x="0" y="1.5" transform="translate(-8, 0)" font-size="3.5" fill="#3b82f6" text-anchor="middle" font-family="sans-serif" font-weight="bold">X</text>
        {/* B */}
        <circle cx="8" cy="0" r="3.2" fill="#1b1c24" stroke="#ef4444" stroke-width="0.8" />
        <text x="0" y="1.5" transform="translate(8, 0)" font-size="3.5" fill="#ef4444" text-anchor="middle" font-family="sans-serif" font-weight="bold">B</text>
        {/* A */}
        <circle cx="0" cy="8" r="3.2" fill="#1b1c24" stroke="#22c55e" stroke-width="0.8" />
        <text x="0" y="9.5" font-size="3.5" fill="#22c55e" text-anchor="middle" font-family="sans-serif" font-weight="bold">A</text>
      </g>
    </svg>
  );
}

