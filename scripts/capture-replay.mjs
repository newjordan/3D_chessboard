#!/usr/bin/env node
import { chromium } from 'playwright';
import { program } from 'commander';
import fs from 'fs';
import path from 'path';

// Usage: node scripts/capture-replay.mjs --pgn "..." --ply 10 --out board.png
// or use environment variables

const URL_BASE = process.env.CAPTURE_URL ?? 'http://localhost:3000/dev/board2d';
const DEFAULT_OUT = 'tmp-capture-replay.png';

async function capture(options) {
  const { pgn, ply, out, width, height, scale, wait } = options;

  const url = new URL(URL_BASE);
  if (pgn) url.searchParams.set('pgn', pgn);
  if (ply !== undefined) url.searchParams.set('ply', ply.toString());

  console.log(`[capture] Launching browser...`);
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: parseInt(width), height: parseInt(height) },
    deviceScaleFactor: parseFloat(scale),
  });
  const page = await context.newPage();

  console.log(`[capture] → ${url.toString()}`);
  try {
    await page.goto(url.toString(), { waitUntil: 'networkidle', timeout: 30000 });
  } catch (err) {
    console.error(`[capture] could not reach ${url.toString()}`);
    console.error(`[capture] is the dev server running? cd apps/web && npm run dev`);
    await browser.close();
    process.exit(1);
  }

  // Wait for the board to be ready
  await page.waitForSelector('[data-testid="board2d-root"]', { timeout: 15000 });
  
  // Wait a bit for animations to settle (though with ply set it should be static-ish)
  console.log(`[capture] Waiting ${wait}ms for settle...`);
  await page.waitForTimeout(parseInt(wait));

  const outPath = out || DEFAULT_OUT;
  
  // We want just the board if possible, or the whole page
  const board = await page.$('[data-testid="board2d-root"]');
  if (board) {
    console.log(`[capture] Taking board screenshot...`);
    await board.screenshot({ path: outPath });
  } else {
    console.log(`[capture] Taking full page screenshot...`);
    await page.screenshot({ path: outPath });
  }

  console.log(`[capture] ✓ ${outPath}`);
  await browser.close();
}

// Simple arg parsing since we might not have 'commander' installed in the root
const args = process.argv.slice(2);
const options = {
  pgn: '',
  ply: 0,
  out: process.env.CAPTURE_OUT || DEFAULT_OUT,
  width: process.env.CAPTURE_W || 1200,
  height: process.env.CAPTURE_H || 1200,
  scale: process.env.CAPTURE_SCALE || 2,
  wait: process.env.CAPTURE_SETTLE_MS || 1000
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--pgn') options.pgn = args[++i];
  if (args[i] === '--ply') options.ply = args[++i];
  if (args[i] === '--out') options.out = args[++i];
  if (args[i] === '--width') options.width = args[++i];
  if (args[i] === '--height') options.height = args[++i];
  if (args[i] === '--scale') options.scale = args[++i];
  if (args[i] === '--wait') options.wait = args[++i];
}

capture(options).catch(err => {
  console.error(err);
  process.exit(1);
});
