// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { addMove, updateTimer } from './ui.js';

describe('move history and timer', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="timer"></div>
      <div id="move-history-box"><div id="moves"></div></div>
    `;
  });

  it('appends a numbered move and scrolls the history', () => {
    const box = document.getElementById('move-history-box');
    Object.defineProperty(box, 'scrollHeight', { value: 240, configurable: true });

    addMove(1, 'e2-e4', 'e7-e5');

    const row = document.querySelector('#moves div');
    expect(row.querySelector('.move-num').textContent).toBe('1.');
    expect(row.querySelector('.move-white').textContent).toBe('e2-e4');
    expect(row.querySelector('.move-black').textContent).toBe('e7-e5');
    expect(box.scrollTop).toBe(240);
  });

  it('leaves the page alone when the history node is missing', () => {
    document.body.innerHTML = '';
    expect(() => addMove(2, 'Ng1-f3')).not.toThrow();
    expect(() => updateTimer('03:00')).not.toThrow();
  });

  it('writes the clock text', () => {
    updateTimer('02:15');
    expect(document.getElementById('timer').textContent).toBe('02:15');
  });
});
