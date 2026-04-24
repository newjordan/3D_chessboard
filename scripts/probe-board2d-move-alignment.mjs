#!/usr/bin/env node
import { chromium } from 'playwright';

const URL = process.env.CAPTURE_URL ?? 'http://127.0.0.1:3400/dev/board2d';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 1 });

await page.goto(URL, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForSelector('[data-testid="board2d-root"]', { timeout: 10000 });
await page.keyboard.press('Home');
await page.waitForTimeout(250);
await page.keyboard.press('ArrowRight');

await page.waitForSelector('[data-moving-piece="true"]', { timeout: 2500 });

const samples = [];
for (let i = 0; i < 16; i += 1) {
  const sample = await page.evaluate(() => {
    const moving = document.querySelector('[data-moving-piece="true"]');
    const to = moving?.getAttribute('data-moving-piece-to');
    const square = to ? document.querySelector(`[data-square-id="${to}"]`) : null;
    const rect = moving?.getBoundingClientRect();
    const squareRect = square?.getBoundingClientRect();
    if (!moving || !to || !rect || !squareRect) {
      return { active: false, to: to ?? null };
    }
    const movingCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    const squareCenter = {
      x: squareRect.left + squareRect.width / 2,
      y: squareRect.top + squareRect.height / 2,
    };
    return {
      active: true,
      to,
      moving: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        centerX: movingCenter.x,
        centerY: movingCenter.y,
      },
      square: {
        left: squareRect.left,
        top: squareRect.top,
        width: squareRect.width,
        height: squareRect.height,
        centerX: squareCenter.x,
        centerY: squareCenter.y,
      },
      delta: {
        x: movingCenter.x - squareCenter.x,
        y: movingCenter.y - squareCenter.y,
      },
    };
  });
  samples.push({ t: i * 60, ...sample });
  await page.waitForTimeout(60);
}

console.log(JSON.stringify(samples, null, 2));
await browser.close();
