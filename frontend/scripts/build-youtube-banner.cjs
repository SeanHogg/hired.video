const path = require('path');
const sharp = require('sharp');

const W = 2048;
const H = 1152;

// YouTube safe area (visible on every device, incl. mobile): 1235x338, centered.
const SAFE_W = 1235;
const SAFE_H = 338;
const SAFE_X = (W - SAFE_W) / 2; // 406.5
const SAFE_Y = (H - SAFE_H) / 2; // 407

// Logo placement: bottom-right, 360x360 inside a white card with padding.
const LOGO_SIZE = 360;
const CARD_PAD_INNER = 48;     // padding inside card around logo
const CARD_SIZE = LOGO_SIZE + CARD_PAD_INNER * 2; // 456
const CARD_RADIUS = 64;
const CORNER_PAD = 80;         // distance from canvas edges
const CARD_X = W - CARD_SIZE - CORNER_PAD; // 1512
const CARD_Y = H - CARD_SIZE - CORNER_PAD; // 616
const LOGO_X = CARD_X + CARD_PAD_INNER;
const LOGO_Y = CARD_Y + CARD_PAD_INNER;

const logoPath = path.resolve(__dirname, '../public/pwa-512x512.png');
const outPath = path.resolve(__dirname, '../public/youtube-banner.png');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"  stop-color="#0f0a2b"/>
      <stop offset="40%" stop-color="#3b2098"/>
      <stop offset="80%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"  stop-color="#a78bfa"/>
      <stop offset="100%" stop-color="#60a5fa"/>
    </linearGradient>
    <radialGradient id="glow1" cx="50%" cy="50%" r="50%">
      <stop offset="0%"  stop-color="#a78bfa" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="50%" cy="50%" r="50%">
      <stop offset="0%"  stop-color="#60a5fa" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#60a5fa" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Base gradient -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- Soft glows -->
  <circle cx="280"  cy="240"  r="520" fill="url(#glow1)"/>
  <circle cx="1750" cy="980"  r="600" fill="url(#glow2)"/>
  <circle cx="1100" cy="200"  r="380" fill="url(#glow1)" opacity="0.5"/>

  <!-- Subtle grid -->
  <g opacity="0.05" stroke="white" stroke-width="1">
    ${Array.from({ length: Math.floor(W / 80) + 1 }, (_, i) => `<line x1="${i * 80}" y1="0" x2="${i * 80}" y2="${H}"/>`).join('')}
    ${Array.from({ length: Math.floor(H / 80) + 1 }, (_, i) => `<line x1="0" y1="${i * 80}" x2="${W}" y2="${i * 80}"/>`).join('')}
  </g>

  <!-- Decorative dotted star/sparkle accents -->
  <g fill="#c4b5fd" opacity="0.5">
    <circle cx="320"  cy="900" r="4"/>
    <circle cx="380"  cy="940" r="3"/>
    <circle cx="1700" cy="160" r="4"/>
    <circle cx="1640" cy="220" r="3"/>
    <circle cx="240"  cy="160" r="3"/>
  </g>

  <!-- Logo backing card (drawn here so the PNG composites cleanly on top) -->
  <g>
    <rect x="${CARD_X + 10}" y="${CARD_Y + 14}" width="${CARD_SIZE}" height="${CARD_SIZE}"
          rx="${CARD_RADIUS}" fill="black" opacity="0.25"/>
    <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_SIZE}" height="${CARD_SIZE}"
          rx="${CARD_RADIUS}" fill="white"/>
  </g>

  <!-- Safe-area content (1235x338 centered) -->
  <g transform="translate(${SAFE_X}, ${SAFE_Y})">
    <!-- Eyebrow -->
    <text x="0" y="36" font-family="Segoe UI, system-ui, -apple-system, sans-serif"
          font-size="28" font-weight="600" fill="url(#accent)" letter-spacing="6">
      AI VIDEO RESUMES &#183; AI JOB SEARCH
    </text>

    <!-- Brand wordmark -->
    <text x="0" y="150" font-family="Segoe UI, system-ui, -apple-system, sans-serif"
          font-size="132" font-weight="800" fill="white" letter-spacing="-3">
      hired.video
    </text>

    <!-- Tagline -->
    <text x="0" y="220" font-family="Segoe UI, system-ui, -apple-system, sans-serif"
          font-size="40" font-weight="500" fill="white" opacity="0.92">
      Turn your resume into a video. Get matched. Get hired.
    </text>

    <!-- Feature pills -->
    <g transform="translate(0, 262)">
      <g>
        <rect x="0" y="0" width="240" height="56" rx="28" fill="white" fill-opacity="0.14"/>
        <text x="120" y="36" text-anchor="middle"
              font-family="Segoe UI, system-ui, sans-serif"
              font-size="22" font-weight="600" fill="white">Video Resumes</text>
      </g>
      <g transform="translate(260, 0)">
        <rect x="0" y="0" width="240" height="56" rx="28" fill="white" fill-opacity="0.14"/>
        <text x="120" y="36" text-anchor="middle"
              font-family="Segoe UI, system-ui, sans-serif"
              font-size="22" font-weight="600" fill="white">Resume Builder</text>
      </g>
      <g transform="translate(520, 0)">
        <rect x="0" y="0" width="240" height="56" rx="28" fill="white" fill-opacity="0.14"/>
        <text x="120" y="36" text-anchor="middle"
              font-family="Segoe UI, system-ui, sans-serif"
              font-size="22" font-weight="600" fill="white">AI Job Match</text>
      </g>
      <g transform="translate(780, 0)">
        <rect x="0" y="0" width="240" height="56" rx="28" fill="white" fill-opacity="0.14"/>
        <text x="120" y="36" text-anchor="middle"
              font-family="Segoe UI, system-ui, sans-serif"
              font-size="22" font-weight="600" fill="white">Free to Start</text>
      </g>
    </g>
  </g>
</svg>`;

(async () => {
  const bg = await sharp(Buffer.from(svg)).png().toBuffer();
  const logo = await sharp(logoPath).resize(LOGO_SIZE, LOGO_SIZE).toBuffer();

  await sharp(bg)
    .composite([{ input: logo, left: Math.round(LOGO_X), top: Math.round(LOGO_Y) }])
    .png()
    .toFile(outPath);

  const meta = await sharp(outPath).metadata();
  console.log(`Wrote ${outPath} ${meta.width}x${meta.height}`);
})().catch((e) => { console.error(e); process.exit(1); });
