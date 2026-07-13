#!/usr/bin/env node
'use strict';
// Generates assets/icon.png and assets/adaptive-icon.png using only Node built-ins.
// Run once: node scripts/generate-icon.js

const fs   = require('fs');
const zlib = require('zlib');
const path = require('path');

const SIZE = 1024;
const CX   = SIZE / 2; // 512

// ── helpers ──────────────────────────────────────────────────────────────────

function lerp(a, b, t) { return a + (b - a) * t; }

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function blendOver(buf, i, r, g, b, a) {
  const fa = a / 255;
  const oa = buf[i + 3] / 255;
  const na = fa + oa * (1 - fa);
  if (na < 0.001) return;
  buf[i]     = ((r * fa + buf[i]     * oa * (1 - fa)) / na) | 0;
  buf[i + 1] = ((g * fa + buf[i + 1] * oa * (1 - fa)) / na) | 0;
  buf[i + 2] = ((b * fa + buf[i + 2] * oa * (1 - fa)) / na) | 0;
  buf[i + 3] = (na * 255) | 0;
}

// ── background gradient ───────────────────────────────────────────────────────

function fillGradient(buf) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const t = (x + y) / (2 * SIZE);
      const i = (y * SIZE + x) * 4;
      buf[i]     = lerp(0x4B, 0x7B, t) | 0; // #4B2FBA → #7B4ED4
      buf[i + 1] = lerp(0x2F, 0x4E, t) | 0;
      buf[i + 2] = lerp(0xBA, 0xD4, t) | 0;
      buf[i + 3] = 255;
    }
  }
}

// ── SDF primitives ────────────────────────────────────────────────────────────

function sdfCircle(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) - r;
}

function sdfRoundBox(x, y, cx, cy, hw, hh, r) {
  const dx = Math.abs(x - cx) - hw + r;
  const dy = Math.abs(y - cy) - hh + r;
  return (dx > 0 || dy > 0
    ? Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
    : Math.max(dx, dy)) - r;
}

// Bell geometry
const DOME_CY      = 490;
const DOME_R       = 225;
const SKIRT_BOT_Y  = 695;
const SKIRT_BOT_HW = 285;

function bellBodySDF(x, y) {
  // Dome (circle)
  const dDome = sdfCircle(x, y, CX, DOME_CY, DOME_R);

  // Skirt — trapezoid below dome centre
  let dSkirt = Infinity;
  if (y >= DOME_CY && y <= SKIRT_BOT_Y) {
    const t = (y - DOME_CY) / (SKIRT_BOT_Y - DOME_CY);
    dSkirt = Math.abs(x - CX) - lerp(DOME_R, SKIRT_BOT_HW, t);
  }

  // Bottom rim (rounded box that caps the skirt)
  const dRim  = sdfRoundBox(x, y, CX, SKIRT_BOT_Y, SKIRT_BOT_HW, 22, 18);

  // Handle stem
  const dStem = sdfRoundBox(x, y, CX, 325, 38, 90, 19);

  // Handle ball
  const dBall = sdfCircle(x, y, CX, 220, 38);

  return Math.min(dDome, dSkirt, dRim, dStem, dBall);
}

function clapperSDF(x, y) {
  return sdfCircle(x, y, CX, 770, 43);
}

// Draw a shape into buf using an SDF (pixels where SDF < 0 get the colour)
function drawShape(buf, sdfFn, r, g, b) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const d = sdfFn(x, y);
      if (d > 2) continue;
      const a = ((1 - smoothstep(-1, 1, d)) * 255) | 0;
      if (a <= 0) continue;
      blendOver(buf, (y * SIZE + x) * 4, r, g, b, a);
    }
  }
}

// ── Sound arcs ────────────────────────────────────────────────────────────────
// Three concentric arcs centred near the top of the dome, left and right.

const ARC_CX       = CX;
const ARC_CY       = 380;                    // above dome centre (490)
const ARC_RADII    = [310, 365, 420];
const ARC_HALF     = 35 * Math.PI / 180;    // ±35° from horizontal
const ARC_THICK    = 20;
const ARC_OPACITIES = [0.95, 0.70, 0.45];  // inner → outer

function drawArc(buf, radius, midAngle, halfAngle, opacity) {
  const startA = midAngle - halfAngle;
  const span   = halfAngle * 2;

  const bx0 = Math.max(0,        (ARC_CX - radius - ARC_THICK - 2) | 0);
  const bx1 = Math.min(SIZE - 1, (ARC_CX + radius + ARC_THICK + 2) | 0);
  const by0 = Math.max(0,        (ARC_CY - radius - ARC_THICK - 2) | 0);
  const by1 = Math.min(SIZE - 1, (ARC_CY + radius + ARC_THICK + 2) | 0);

  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      const dx   = x - ARC_CX;
      const dy   = y - ARC_CY;
      const dist = Math.hypot(dx, dy);
      const dRing = Math.abs(dist - radius) - ARC_THICK / 2;
      if (dRing > 2) continue;

      let angle = Math.atan2(dy, dx);
      let da    = angle - startA;
      while (da >  Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      if (da < 0 || da > span) continue;

      const t    = da / span;
      const edge = smoothstep(0, 0.07, t) * (1 - smoothstep(0.93, 1, t));
      const a    = ((1 - smoothstep(-1, 1, dRing)) * edge * opacity * 255) | 0;
      if (a <= 0) continue;
      blendOver(buf, (y * SIZE + x) * 4, 255, 255, 255, a);
    }
  }
}

function drawAllArcs(buf) {
  ARC_RADII.forEach((r, i) => {
    drawArc(buf, r, 0,         ARC_HALF, ARC_OPACITIES[i]); // right
    drawArc(buf, r, Math.PI,   ARC_HALF, ARC_OPACITIES[i]); // left
  });
}

// ── Bell drawing ──────────────────────────────────────────────────────────────

function drawBell(buf) {
  drawShape(buf, bellBodySDF, 255, 255, 255);
  drawShape(buf, clapperSDF,  255, 255, 255);
  drawAllArcs(buf);
}

// ── PNG encoder ───────────────────────────────────────────────────────────────

function writePNG(buf, outPath) {
  // Build CRC-32 table
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c;
  }
  function crc32(b) {
    let c = 0xFFFFFFFF;
    for (const byte of b) c = crcTable[(c ^ byte) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function makeChunk(type, data) {
    const len  = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const tp   = Buffer.from(type);
    const crcBuf = Buffer.concat([tp, data]);
    const crc  = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcBuf));
    return Buffer.concat([len, tp, data, crc]);
  }

  // IHDR: 1024×1024, 8-bit RGBA (colour type 6)
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; ihdr[9] = 6;

  // Raw scanlines: filter byte (0 = None) + RGBA row
  const rowSize = 1 + SIZE * 4;
  const raw = Buffer.allocUnsafe(SIZE * rowSize);
  for (let y = 0; y < SIZE; y++) {
    raw[y * rowSize] = 0;
    for (let x = 0; x < SIZE; x++) {
      const src = (y * SIZE + x) * 4;
      const dst = y * rowSize + 1 + x * 4;
      raw[dst]     = buf[src];
      raw[dst + 1] = buf[src + 1];
      raw[dst + 2] = buf[src + 2];
      raw[dst + 3] = buf[src + 3];
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);

  fs.writeFileSync(outPath, png);
  console.log(`  ${outPath}  (${(png.length / 1024).toFixed(0)} KB)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '..');

console.log('Generating icons…');

// icon.png — gradient background + bell
const iconBuf = new Uint8Array(SIZE * SIZE * 4);
fillGradient(iconBuf);
drawBell(iconBuf);
writePNG(iconBuf, path.join(ROOT, 'assets', 'icon.png'));

// adaptive-icon.png — transparent background + white bell (Android adaptive layer)
const adaBuf = new Uint8Array(SIZE * SIZE * 4); // all zeros = fully transparent
drawBell(adaBuf);
writePNG(adaBuf, path.join(ROOT, 'assets', 'adaptive-icon.png'));

console.log('Done!');
