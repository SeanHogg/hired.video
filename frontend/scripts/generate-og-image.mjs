#!/usr/bin/env node

/**
 * Generates a static og-image.png (1200x630) for social sharing.
 *
 * Uses an inline SVG rendered to a data URL, then written as an SVG file.
 * For production, replace with a high-fidelity raster PNG from Figma/Canva
 * and name it og-image.png in public/.
 *
 * Run: node scripts/generate-og-image.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');

// 1200x630 OG image as SVG (works as og-image.svg, and social platforms
// that require raster images will need a PNG export from Figma/Canva).
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#7c3aed;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#6d28d9;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#a78bfa;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#60a5fa;stop-opacity:1" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)" />

  <!-- Subtle grid pattern -->
  <g opacity="0.06">
    ${Array.from({ length: 20 }, (_, i) => `<line x1="${i * 60}" y1="0" x2="${i * 60}" y2="630" stroke="white" stroke-width="1"/>`).join('\n    ')}
    ${Array.from({ length: 11 }, (_, i) => `<line x1="0" y1="${i * 60}" x2="1200" y2="${i * 60}" stroke="white" stroke-width="1"/>`).join('\n    ')}
  </g>

  <!-- Decorative circles -->
  <circle cx="1050" cy="120" r="180" fill="white" opacity="0.04" />
  <circle cx="150" cy="530" r="120" fill="white" opacity="0.04" />

  <!-- Video icon (from favicon) -->
  <g transform="translate(80, 200) scale(3.5)" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.9">
    <rect x="2" y="6" width="14" height="12" rx="2"/>
    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/>
  </g>

  <!-- Sparkles icon -->
  <g transform="translate(155, 175) scale(2)" stroke="#60a5fa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.8">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
  </g>

  <!-- Brand name -->
  <text x="100" y="340" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="72" font-weight="800" fill="white" letter-spacing="-2">
    hired.video
  </text>

  <!-- Tagline -->
  <text x="100" y="395" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="28" font-weight="400" fill="url(#accent)">
    AI Video Resumes &amp; Career Tools
  </text>

  <!-- Sub-tagline -->
  <text x="100" y="440" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="20" font-weight="300" fill="white" opacity="0.7">
    Create a video resume in 60 seconds. Score, tailor, and match with AI.
  </text>

  <!-- Feature pills -->
  <g transform="translate(100, 480)">
    <rect x="0" y="0" width="170" height="36" rx="18" fill="white" opacity="0.15" />
    <text x="85" y="24" font-family="system-ui, sans-serif" font-size="14" font-weight="500" fill="white" text-anchor="middle">Video Resumes</text>

    <rect x="185" y="0" width="150" height="36" rx="18" fill="white" opacity="0.15" />
    <text x="260" y="24" font-family="system-ui, sans-serif" font-size="14" font-weight="500" fill="white" text-anchor="middle">AI Resume Tools</text>

    <rect x="350" y="0" width="150" height="36" rx="18" fill="white" opacity="0.15" />
    <text x="425" y="24" font-family="system-ui, sans-serif" font-size="14" font-weight="500" fill="white" text-anchor="middle">Job Matching</text>

    <rect x="515" y="0" width="130" height="36" rx="18" fill="white" opacity="0.15" />
    <text x="580" y="24" font-family="system-ui, sans-serif" font-size="14" font-weight="500" fill="white" text-anchor="middle">Free to Start</text>
  </g>

  <!-- Bottom bar -->
  <rect x="0" y="600" width="1200" height="30" fill="black" opacity="0.2" />
  <text x="600" y="622" font-family="system-ui, sans-serif" font-size="14" font-weight="400" fill="white" opacity="0.6" text-anchor="middle">
    https://hired.video
  </text>
</svg>`;

fs.writeFileSync(path.join(PUBLIC_DIR, 'og-image.svg'), svg, 'utf8');
console.log('✅ Wrote public/og-image.svg (1200x630)');
console.log('');
console.log('⚠️  For best social sharing compatibility, export a PNG version:');
console.log('   1. Open public/og-image.svg in a browser');
console.log('   2. Screenshot at 1200x630 or use Figma/Canva to export as PNG');
console.log('   3. Save as public/og-image.png');
console.log('   4. Update seo.ts references from .svg to .png');
