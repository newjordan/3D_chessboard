#!/usr/bin/env node
import { chromium } from 'playwright';

const URL = process.env.CAPTURE_URL ?? 'http://localhost:3000/dev/board2d';
const OUT = process.env.CAPTURE_OUT ?? 'tmp-board2d-live.png';
const BOARD_ONLY = process.env.BOARD_ONLY === '1';
const VIEWPORT_W = Number(process.env.CAPTURE_W ?? 1440);
const VIEWPORT_H = Number(process.env.CAPTURE_H ?? 900);
const SETTLE_MS = Number(process.env.CAPTURE_SETTLE_MS ?? 700);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

console.log(`[capture] → ${URL}`);
try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 15000 });
} catch (err) {
  console.error(`[capture] could not reach ${URL}`);
  console.error(`[capture] is the dev server running? cd apps/web && npm run dev`);
  console.error(err.message);
  await browser.close();
  process.exit(1);
}

await page.waitForSelector('[data-testid="board2d-root"]', { timeout: 10000 });
await page.waitForTimeout(SETTLE_MS);

if (BOARD_ONLY) {
  const el = await page.$('[data-testid="board2d-root"]');
  await el.screenshot({ path: OUT });
} else {
  await page.screenshot({ path: OUT });
}

console.log(`[capture] ✓ ${OUT}`);
await browser.close();
