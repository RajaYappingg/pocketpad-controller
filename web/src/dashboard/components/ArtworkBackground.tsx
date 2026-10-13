import { h } from 'preact';

/**
 * Red Torii Gate & Mountain Landscape silhouette in deep dark crimson.
 * Displayed in the bottom-left corner behind the sidebar and page content.
 */
export function SidebarArtwork() {
  return (
    <div className="sidebar-artwork-container" aria-hidden="true">
      <svg
        viewBox="0 0 320 280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="sidebar-artwork-svg"
      >
        {/* Subtle red moon / sun glow */}
        <circle cx="90" cy="110" r="45" fill="url(#moonGlow)" opacity="0.6" />

        {/* Distant Mountain range */}
        <path
          d="M0 280 L0 185 L55 145 L130 195 L220 125 L320 210 L320 280 Z"
          fill="url(#mountainGradFar)"
          opacity="0.45"
        />

        {/* Foreground Mountain ridges */}
        <path
          d="M0 280 L0 215 L45 180 L110 225 L180 170 L260 230 L320 190 L320 280 Z"
          fill="url(#mountainGradNear)"
          opacity="0.75"
        />

        {/* Japanese Torii Gate silhouette */}
        <g opacity="0.85" transform="translate(45, 145) scale(0.65)">
          {/* Top curved roof bar */}
          <path
            d="M-15 0 C25 -8 75 -8 115 0 L110 8 C75 2 25 2 -10 8 Z"
            fill="#d9242d"
          />
          {/* Second crossbar */}
          <rect x="0" y="16" width="100" height="6" rx="1" fill="#b91c1c" />
          {/* Center plaque support */}
          <rect x="47" y="5" width="6" height="13" fill="#b91c1c" />
          {/* Left post */}
          <rect x="16" y="8" width="10" height="85" rx="1" fill="#7f1d1d" />
          {/* Right post */}
          <rect x="74" y="8" width="10" height="85" rx="1" fill="#7f1d1d" />
          {/* Base supports */}
          <rect x="13" y="90" width="16" height="6" rx="1" fill="#450a0a" />
          <rect x="71" y="90" width="16" height="6" rx="1" fill="#450a0a" />
        </g>

        <defs>
          <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#ff303b" stop-opacity="0.7" />
            <stop offset="60%" stop-color="#991b1b" stop-opacity="0.25" />
            <stop offset="100%" stop-color="#000000" stop-opacity="0" />
          </radialGradient>
          <linearGradient id="mountainGradFar" x1="0" y1="120" x2="0" y2="280" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#801016" stop-opacity="0.6" />
            <stop offset="100%" stop-color="#090a0d" stop-opacity="0.9" />
          </linearGradient>
          <linearGradient id="mountainGradNear" x1="0" y1="170" x2="0" y2="280" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#b91c1c" stop-opacity="0.7" />
            <stop offset="100%" stop-color="#060608" stop-opacity="1" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

/**
 * Atmospheric Xbox 360 controller silhouette backdrop for the Home hero section.
 */
export function HeroControllerBackdrop() {
  return (
    <div className="hero-controller-backdrop" aria-hidden="true">
      <svg
        viewBox="0 0 600 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="hero-controller-svg"
      >
        <defs>
          <radialGradient id="heroRedGlow" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stop-color="#ff303b" stop-opacity="0.35" />
            <stop offset="45%" stop-color="#b91c1c" stop-opacity="0.12" />
            <stop offset="100%" stop-color="#050507" stop-opacity="0" />
          </radialGradient>
          <linearGradient id="controllerBodyGrad" x1="100" y1="50" x2="500" y2="350" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#1e1f26" />
            <stop offset="50%" stop-color="#121317" />
            <stop offset="100%" stop-color="#0a0a0d" />
          </linearGradient>
          <linearGradient id="rimLightGrad" x1="0" y1="0" x2="600" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#ff303b" stop-opacity="0.6" />
            <stop offset="50%" stop-color="#ff4650" stop-opacity="0.2" />
            <stop offset="100%" stop-color="#ff303b" stop-opacity="0.7" />
          </linearGradient>
        </defs>

        {/* Ambient Red Glow */}
        <ellipse cx="320" cy="190" rx="260" ry="160" fill="url(#heroRedGlow)" />

        {/* Controller body silhouette */}
        <path
          d="M170 120 C190 90 250 80 300 80 C350 80 410 90 430 120 C465 170 515 280 475 335 C445 375 390 320 370 270 C345 235 255 235 230 270 C210 320 155 375 125 335 C85 280 135 170 170 120 Z"
          fill="url(#controllerBodyGrad)"
          stroke="url(#rimLightGrad)"
          stroke-width="2.5"
          opacity="0.7"
        />

        {/* Xbox Center Guide Button */}
        <circle cx="300" cy="150" r="28" fill="#18191f" stroke="#ff303b" stroke-width="2" opacity="0.85" />
        <path d="M285 140 L315 160 M315 140 L285 160" stroke="#ff303b" stroke-width="4" stroke-linecap="round" opacity="0.9" />

        {/* Left Thumbstick */}
        <circle cx="215" cy="175" r="32" fill="#14151a" stroke="#2a2c35" stroke-width="2" opacity="0.8" />
        <circle cx="215" cy="175" r="18" fill="#1e2028" stroke="#ff303b" stroke-width="1.5" opacity="0.6" />

        {/* D-Pad */}
        <path
          d="M250 225 h15 v-15 h12 v15 h15 v12 h-15 v15 h-12 v-15 h-15 z"
          fill="#1c1d24"
          stroke="#2a2c35"
          stroke-width="1.5"
          opacity="0.8"
        />

        {/* Right Thumbstick */}
        <circle cx="355" cy="235" r="32" fill="#14151a" stroke="#2a2c35" stroke-width="2" opacity="0.8" />
        <circle cx="355" cy="235" r="18" fill="#1e2028" stroke="#ff303b" stroke-width="1.5" opacity="0.6" />

        {/* ABXY Cluster */}
        <circle cx="390" cy="175" r="12" fill="#1e2028" stroke="#22c55e" stroke-width="1.5" opacity="0.8" /> {/* A */}
        <circle cx="415" cy="150" r="12" fill="#1e2028" stroke="#ef4444" stroke-width="1.5" opacity="0.8" /> {/* B */}
        <circle cx="365" cy="150" r="12" fill="#1e2028" stroke="#3b82f6" stroke-width="1.5" opacity="0.8" /> {/* X */}
        <circle cx="390" cy="125" r="12" fill="#1e2028" stroke="#eab308" stroke-width="1.5" opacity="0.8" /> {/* Y */}
      </svg>
    </div>
  );
}

