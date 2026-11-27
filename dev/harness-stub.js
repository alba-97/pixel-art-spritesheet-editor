const params = new URLSearchParams(window.location.search);
const systemLanguage = 'en';
let preference = params.get('lang') === 'es' || params.get('lang') === 'en' ? params.get('lang') : 'auto';
let language = preference === 'auto' ? systemLanguage : preference;

function languageInfo() {
  return { language, preference, systemLanguage };
}

window.__sendAction = (action) => {
  window.postMessage({ type: 'action', action }, '*');
};

const cell = 16;
const frames = 4;
const palette = {
  outline: '#12301c',
  body: '#3fae49',
  light: '#7be07f',
  shine: '#c8f7b5',
  eye: '#0b1f12',
  eyeShine: '#ffffff',
  shadow: 'rgba(0, 0, 0, 0.28)'
};

let cachedSheet = null;

function fillSpan(ctx, ox, cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y += 1) {
    const ny = (y + 0.5 - cy) / ry;
    const span = rx * Math.sqrt(Math.max(0, 1 - ny * ny));
    const x0 = Math.round(cx - span);
    const x1 = Math.round(cx + span);
    if (x1 > x0) {
      ctx.fillRect(ox + x0, y, x1 - x0, 1);
    }
  }
}

function drawSlime(ctx, ox, phase) {
  const shapes = [
    { cy: 11, rx: 5.2, ry: 3.1, blink: false },
    { cy: 9.5, rx: 4.4, ry: 4.4, blink: false },
    { cy: 7.5, rx: 3.8, ry: 5.2, blink: false },
    { cy: 9.5, rx: 4.8, ry: 4, blink: true }
  ];
  const shape = shapes[phase];
  fillSpan(ctx, ox, 8, 14.5, 5.4, 1, palette.shadow);
  fillSpan(ctx, ox, 8, shape.cy, shape.rx + 1, shape.ry + 1, palette.outline);
  fillSpan(ctx, ox, 8, shape.cy, shape.rx, shape.ry, palette.body);
  fillSpan(ctx, ox, 7, shape.cy - shape.ry * 0.45, shape.rx * 0.42, shape.ry * 0.3, palette.light);
  ctx.fillStyle = palette.shine;
  ctx.fillRect(ox + 5, Math.round(shape.cy - shape.ry * 0.72), 2, 1);
  ctx.fillStyle = palette.eye;
  const eyeY = Math.round(shape.cy - shape.ry * 0.15);
  ctx.fillRect(ox + 6, eyeY, 1, shape.blink ? 1 : 2);
  ctx.fillRect(ox + 10, eyeY, 1, shape.blink ? 1 : 2);
  if (!shape.blink) {
    ctx.fillStyle = palette.eyeShine;
    ctx.fillRect(ox + 6, eyeY, 1, 1);
    ctx.fillRect(ox + 10, eyeY, 1, 1);
  }
  ctx.fillStyle = palette.eye;
  ctx.fillRect(ox + 8, eyeY + 2, 2, 1);
}

function buildSheet() {
  if (cachedSheet) {
    return cachedSheet;
  }
  const canvas = document.createElement('canvas');
  canvas.width = cell * frames;
  canvas.height = cell;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let index = 0; index < frames; index += 1) {
    drawSlime(ctx, index * cell, index);
  }
  cachedSheet = canvas.toDataURL('image/png');
  return cachedSheet;
}

function postInit() {
  window.postMessage({
    type: 'init',
    dataUrl: buildSheet(),
    fileName: 'slime.png',
    format: 'png',
    ...languageInfo()
  }, '*');
}

window.__messages = [];
window.__state = undefined;
window.__serialized = undefined;

window.acquireVsCodeApi = () => ({
  postMessage(message) {
    window.__messages.push(message);
    if (message.type === 'ready') {
      window.setTimeout(postInit, 80);
    } else if (message.type === 'save') {
      window.setTimeout(() => window.postMessage({ type: 'serialize', id: 1, format: 'png' }, '*'), 30);
    } else if (message.type === 'serialized') {
      window.__serialized = message.dataUrl;
      window.setTimeout(() => window.postMessage({ type: 'saved', historyIndex: message.historyIndex }, '*'), 30);
    } else if (message.type === 'setLanguage') {
      preference = message.preference;
      language = preference === 'auto' ? systemLanguage : preference;
      window.setTimeout(() => window.postMessage({ type: 'language', ...languageInfo() }, '*'), 30);
    }
  },
  getState() {
    return window.__state;
  },
  setState(state) {
    window.__state = state;
  }
});
