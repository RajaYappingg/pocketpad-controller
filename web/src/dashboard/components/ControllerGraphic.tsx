import { h } from 'preact';

interface ControllerGraphicProps {
  className?: string;
  width?: number;
  height?: number;
  highlighted?: boolean;
}

export function ControllerGraphic({
  className = '',
  width = 170,
  height = 115,
  highlighted = false,
}: ControllerGraphicProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 200 135"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`controller-graphic-svg ${className}`}
    >
      <defs>
        <linearGradient id="bodyGrad" x1="20" y1="10" x2="180" y2="130" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#24262f" />
          <stop offset="45%" stop-color="#15161b" />
          <stop offset="100%" stop-color="#0d0e12" />
        </linearGradient>
        <linearGradient id="rimRed" x1="0" y1="0" x2="200" y2="130" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color={highlighted ? '#ff4650' : '#e02424'} stop-opacity="0.9" />
          <stop offset="50%" stop-color="#2b2d38" stop-opacity="0.4" />
          <stop offset="100%" stop-color={highlighted ? '#ff4650' : '#e02424'} stop-opacity="0.9" />
        </linearGradient>
        <radialGradient id="thumbstickGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#2b2d38" />
          <stop offset="85%" stop-color="#14151a" />
          <stop offset="100%" stop-color="#090a0d" />
        </radialGradient>
      </defs>

      {/* Main Ergonomic Controller Body */}
      <path
        d="M58 20 C68 12 85 9 100 9 C115 9 132 12 142 20 C156 34 175 68 168 95 C162 120 144 128 132 108 C122 92 112 88 100 88 C88 88 78 92 68 108 C56 128 38 120 32 95 C25 68 44 34 58 20 Z"
        fill="url(#bodyGrad)"
        stroke="url(#rimRed)"
        stroke-width={highlighted ? '2' : '1.5'}
      />

      {/* Bumpers & Triggers outline */}
      <path d="M50 24 C55 18 70 14 85 14" stroke="#373946" stroke-width="3" stroke-linecap="round" />
      <path d="M150 24 C145 18 130 14 115 14" stroke="#373946" stroke-width="3" stroke-linecap="round" />

      {/* Left Thumbstick (Top-Left) */}
      <circle cx="68" cy="48" r="14" fill="url(#thumbstickGlow)" stroke="#2f313d" stroke-width="1.5" />
      <circle cx="68" cy="48" r="8" fill="#1b1c22" stroke="#ff303b" stroke-width="1" stroke-dasharray="2 2" />

      {/* D-Pad (Bottom-Left) */}
      <g transform="translate(86, 68)">
        <path
          d="M-5 -12 h10 v7 h7 v10 h-7 v7 h-10 v-7 h-7 v-10 h7 z"
          fill="#1b1c23"
          stroke="#323440"
          stroke-width="1.2"
        />
        <circle cx="0" cy="0" r="3" fill="#121317" />
      </g>

      {/* Xbox Center Guide Button */}
      <circle cx="100" cy="38" r="11" fill="#1a1c22" stroke="#ffffff" stroke-width="1.2" />
      {/* Xbox X logo mark */}
      <path d="M94 32 L106 44 M106 32 L94 44" stroke="#ff303b" stroke-width="2.2" stroke-linecap="round" />

      {/* Back and Start buttons */}
      <circle cx="86" cy="38" r="2.5" fill="#323440" />
      <circle cx="114" cy="38" r="2.5" fill="#323440" />

      {/* Right Thumbstick (Bottom-Center-Right) */}
      <circle cx="118" cy="68" r="14" fill="url(#thumbstickGlow)" stroke="#2f313d" stroke-width="1.5" />
      <circle cx="118" cy="68" r="8" fill="#1b1c22" stroke="#ff303b" stroke-width="1" stroke-dasharray="2 2" />

      {/* ABXY Button Diamond Cluster */}
      {/* Y Button (Top) */}
      <circle cx="132" cy="36" r="4.5" fill="#1a1b22" stroke="#eab308" stroke-width="1" />
      <text x="132" y="38.5" font-size="5" fill="#eab308" font-weight="bold" text-anchor="middle" font-family="sans-serif">Y</text>

      {/* X Button (Left) */}
      <circle cx="123" cy="45" r="4.5" fill="#1a1b22" stroke="#3b82f6" stroke-width="1" />
      <text x="123" y="47.5" font-size="5" fill="#3b82f6" font-weight="bold" text-anchor="middle" font-family="sans-serif">X</text>

      {/* B Button (Right) */}
      <circle cx="141" cy="45" r="4.5" fill="#1a1b22" stroke="#ef4444" stroke-width="1" />
      <text x="141" y="47.5" font-size="5" fill="#ef4444" font-weight="bold" text-anchor="middle" font-family="sans-serif">B</text>

      {/* A Button (Bottom) */}
      <circle cx="132" cy="54" r="4.5" fill="#1a1b22" stroke="#22c55e" stroke-width="1" />
      <text x="132" y="56.5" font-size="5" fill="#22c55e" font-weight="bold" text-anchor="middle" font-family="sans-serif">A</text>
    </svg>
  );
}

