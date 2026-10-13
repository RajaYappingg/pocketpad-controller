import { h } from 'preact';
import { PhonePreviewGraphic } from '../components/PhonePreviewGraphic';

interface AboutPageProps {
  onNavigateToHome?: () => void;
}

export function AboutPage({ onNavigateToHome: _onNavigateToHome }: AboutPageProps) {
  return (
    <div className="about-page-layout">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-heading">About</h1>
          <p className="page-subheading">
            PocketPad — Turn your phone into a real Xbox 360 controller.
          </p>
        </div>
      </div>

      {/* Hero Card */}
      <div className="about-hero-card">
        <div className="about-hero-left">
          <div className="about-brand-row">
            <div className="about-brand-logo">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="#ff303b">
                <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
              </svg>
            </div>
            <div>
              <div className="about-brand-title">
                Pocket<span className="text-accent">Pad</span>
              </div>
              <div className="about-brand-tagline">PHONE TO PC. PLAY ANYWHERE.</div>
            </div>
          </div>

          <div className="about-badges-row">
            <span className="about-badge-version">v0.1.0</span>
            <span className="about-badge-status">Early Access</span>
          </div>

          <p className="about-hero-desc">
            A lightweight, open-source application that turns your Android phone into a real virtual Xbox 360 controller for Windows. Designed for low latency, simplicity, and freedom.
          </p>

          <div className="about-actions-row">
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline-danger"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
              <span>View on GitHub</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>

            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <span>Documentation</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        </div>

        {/* Hero Right Visual: Battle Station & Phone Graphic */}
        <div className="about-hero-right">
          <div className="about-battlestation-wrap">
            {/* Background PC Monitor Setup */}
            <div className="about-monitor-mockup">
              <div className="monitor-screen">
                <div className="monitor-gamepad-icon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5">
                    <rect x="2" y="6" width="20" height="12" rx="4" />
                    <path d="M6 12h4m-2-2v4" />
                    <circle cx="17" cy="10" r="1" />
                    <circle cx="15" cy="14" r="1" />
                  </svg>
                </div>
                <div className="monitor-status-text">
                  <span className="monitor-status-dot" />
                  <span>Controller (Xbox 360)</span>
                </div>
                <span className="monitor-subtext">Ready to use</span>
              </div>
              <div className="monitor-stand" />
              <div className="monitor-base" />
            </div>

            {/* Foreground Phone Graphic */}
            <div className="about-phone-foreground">
              <PhonePreviewGraphic />
            </div>
          </div>
        </div>
      </div>

      {/* 6-Card Grid: 3 columns x 2 rows */}
      <div className="about-grid-6cards">
        {/* Card 1: Project Information */}
        <div className="about-info-card">
          <div className="about-card-head">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <h3 className="about-card-title">Project Information</h3>
          </div>
          <div className="about-info-rows">
            <div className="about-info-row">
              <span className="info-row-key">Name</span>
              <span className="info-row-val">PocketPad</span>
            </div>
            <div className="about-info-row">
              <span className="info-row-key">Version</span>
              <span className="info-row-val text-accent">v0.1.0 (Early Access)</span>
            </div>
            <div className="about-info-row">
              <span className="info-row-key">License</span>
              <span className="info-row-val">MIT</span>
            </div>
            <div className="about-info-row">
              <span className="info-row-key">Platform</span>
              <span className="info-row-val">Windows 10/11 (x64)</span>
            </div>
            <div className="about-info-row">
              <span className="info-row-key">Client</span>
              <span className="info-row-val">Android (Web Browser)</span>
            </div>
            <div className="about-info-row">
              <span className="info-row-key">Repository</span>
              <a
                href="https://github.com/yourusername/pocketpad"
                target="_blank"
                rel="noreferrer"
                className="info-row-val text-accent-link"
              >
                <span>github.com/yourusername/pocketpad</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Card 2: Features */}
        <div className="about-info-card">
          <div className="about-card-head">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <h3 className="about-card-title">Features</h3>
          </div>
          <ul className="about-features-list">
            <li>
              <span className="feature-icon">🎮</span>
              <span>Real Xbox 360 controller emulation</span>
            </li>
            <li>
              <span className="feature-icon">📶</span>
              <span>Wi-Fi and Bluetooth connection</span>
            </li>
            <li>
              <span className="feature-icon">👥</span>
              <span>Multiple controller support</span>
            </li>
            <li>
              <span className="feature-icon">⏱</span>
              <span>Low latency and lightweight</span>
            </li>
            <li>
              <span className="feature-icon">🚫</span>
              <span>No paid features or subscriptions</span>
            </li>
            <li>
              <span className="feature-icon">🛡</span>
              <span>Privacy focused (local network only)</span>
            </li>
            <li>
              <span className="feature-icon">&lt;/&gt;</span>
              <span>Open source</span>
            </li>
          </ul>
        </div>

        {/* Card 3: Built With */}
        <div className="about-info-card">
          <div className="about-card-head">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            <h3 className="about-card-title">Built With</h3>
          </div>
          <div className="about-built-grid">
            <div className="built-item">
              <div className="built-icon built-rust">🦀</div>
              <div>
                <div className="built-name">Rust</div>
                <div className="built-desc">Backend • Web server • Virtual controller</div>
              </div>
            </div>
            <div className="built-item">
              <div className="built-icon built-vite">⚡</div>
              <div>
                <div className="built-name">Vite</div>
                <div className="built-desc">Frontend build tool</div>
              </div>
            </div>
            <div className="built-item">
              <div className="built-icon built-preact">⚛</div>
              <div>
                <div className="built-name">Preact</div>
                <div className="built-desc">Frontend framework</div>
              </div>
            </div>
            <div className="built-item">
              <div className="built-icon built-vigem">🎮</div>
              <div>
                <div className="built-name">ViGEmBus</div>
                <div className="built-desc">Xbox 360 controller emulation</div>
              </div>
            </div>
            <div className="built-item">
              <div className="built-icon built-ts">TS</div>
              <div>
                <div className="built-name">TypeScript</div>
                <div className="built-desc">Frontend logic</div>
              </div>
            </div>
            <div className="built-item">
              <div className="built-icon built-pnpm">📦</div>
              <div>
                <div className="built-name">PNPM</div>
                <div className="built-desc">Package management</div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Disclaimer */}
        <div className="about-info-card">
          <div className="about-card-head">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <h3 className="about-card-title">Disclaimer</h3>
          </div>
          <div className="about-disclaimer-content">
            <p>
              PocketPad is an independent, open-source project and is not affiliated with, endorsed, or sponsored by Microsoft or Xbox.
            </p>
            <p>
              &ldquo;Xbox 360&rdquo; is a trademark of Microsoft Corporation. This project uses ViGEmBus to emulate an Xbox 360 controller on Windows.
            </p>
          </div>
        </div>

        {/* Card 5: Driver Information */}
        <div className="about-info-card">
          <div className="about-card-head">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" />
              <line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
            <h3 className="about-card-title">Driver Information</h3>
          </div>
          <div className="about-driver-content">
            <p>
              PocketPad uses ViGEmBus to create a virtual Xbox 360 controller. ViGEmBus is an archived, end-of-life project.
            </p>
            <p>You may need to install the ViGEmBus driver separately.</p>
            <a
              href="https://github.com/nefarius/ViGEmBus/releases"
              target="_blank"
              rel="noreferrer"
              className="about-guide-link"
            >
              <span>View Driver Guide</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        </div>

        {/* Card 6: Credits */}
        <div className="about-info-card">
          <div className="about-card-head">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <h3 className="about-card-title">Credits</h3>
          </div>
          <div className="about-credits-content">
            <p>
              Thanks to the open-source community and all contributors who make projects like this possible.
            </p>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', marginTop: '8px' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>View Contributors</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

