import WebGL from 'three/addons/capabilities/WebGL.js';
import { WEBGL_FALLBACK } from './logic/messages.js';

export function webGL2IsAvailable() {
  return WebGL.isWebGL2Available();
}

/**
 * Show the fallback and clear any canvas that was created before WebGL failed.
 * The message copy lives in logic/messages.js so it can be tested without a GPU.
 */
export function showWebGLFallback(doc = document) {
  let panel = doc.getElementById('webgl-fallback');
  if (!panel) {
    panel = doc.createElement('div');
    panel.id = 'webgl-fallback';
    panel.className = 'webgl-fallback';
    panel.setAttribute('role', 'alert');
    panel.innerHTML = '<div class="webgl-fallback-card"><h2></h2><p></p></div>';
    doc.body.appendChild(panel);
  }

  panel.classList.add('webgl-fallback');
  panel.setAttribute('role', 'alert');
  panel.querySelector('h2').textContent = WEBGL_FALLBACK.title;
  panel.querySelector('p').textContent = WEBGL_FALLBACK.body;
  panel.hidden = false;

  const app = doc.getElementById('app');
  if (app) app.replaceChildren();
  return panel;
}
