#!/usr/bin/env node
// Clicks the "Next" button N times then captures mid-pulse to verify the circuit animation.
import { chromium } from 'playwright';

const URL = 'http://localhost:3000/dev/board2d';
const OUT = process.env.CAPTURE_OUT ?? 'tmp-board2d-pulse.png';
const CLICKS = Number(process.env.CLICKS ?? 1);
const POST_CLICK_MS = Number(process.env.POST_CLICK_MS ?? 450);
const BOARD_ONLY = process.env.BOARD_ONLY === '1';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1800, height: 1200 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

console.log(`[capture] → ${URL}`);
await page.goto(URL, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForSelector('[data-testid="board2d-root"]', { timeout: 10000 });
await page.waitForTimeout(1200);

for (let i = 0; i < CLICKS; i++) {
  await page.click('button[title="Next"]');
  console.log(`[capture] clicked Next (${i + 1}/${CLICKS})`);
  if (i < CLICKS - 1) await page.waitForTimeout(300);
}
await page.waitForTimeout(POST_CLICK_MS);

if (BOARD_ONLY) {
  const el = await page.$('[data-testid="board2d-root"]');
  await el.screenshot({ path: OUT });
} else {
  await page.screenshot({ path: OUT });
}
console.log(`[capture] ✓ ${OUT}`);
await browser.close();
