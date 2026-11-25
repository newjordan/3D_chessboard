// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { WEBGL_FALLBACK } from './logic/messages.js';
import { showWebGLFallback, webGL2IsAvailable } from './webgl.js';

describe('WebGL fallback', () => {
  it('describes why the board cannot start', () => {
    expect(WEBGL_FALLBACK.title).toMatch(/WebGL 2/);
    expect(WEBGL_FALLBACK.body).toMatch(/hardware acceleration/);
  });

  it('treats a DOM without a WebGL 2 context as unsupported', () => {
    expect(webGL2IsAvailable()).toBe(false);
  });

  it('reveals the message and removes a canvas that never drew', () => {
    document.body.innerHTML = `
      <div id="app"><canvas id="stale"></canvas></div>
      <div id="webgl-fallback" class="webgl-fallback" hidden>
        <div class="webgl-fallback-card"><h2></h2><p></p></div>
      </div>
    `;

    const panel = showWebGLFallback();
    expect(panel.hidden).toBe(false);
    expect(panel.getAttribute('role')).toBe('alert');
    expect(panel.querySelector('h2').textContent).toBe(WEBGL_FALLBACK.title);
    expect(panel.querySelector('p').textContent).toBe(WEBGL_FALLBACK.body);
    expect(document.querySelector('#app canvas')).toBeNull();
  });
});
