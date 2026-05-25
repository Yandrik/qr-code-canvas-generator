'use strict';

const els = {
  form: document.getElementById('controls'),
  type: document.getElementById('type'),
  typeList: document.getElementById('type-list'),
  input: document.getElementById('input'),
  data: document.getElementById('data'),
  size: document.getElementById('size'),
  margin: document.getElementById('margin'),
  scale: document.getElementById('scale'),
  rotate: document.getElementById('rotate'),
  fg: document.getElementById('fg'),
  bg: document.getElementById('bg'),
  includetext: document.getElementById('includetext'),
  textalign: document.getElementById('textalign'),
  heightmm: document.getElementById('heightmm'),
  eclevel: document.getElementById('eclevel'),
  parsefnc: document.getElementById('parsefnc'),
  parse: document.getElementById('parse'),
  sample: document.getElementById('sample'),
  copyPage: document.getElementById('copy-page'),
  copyShortPage: document.getElementById('copy-short-page'),
  copyImage: document.getElementById('copy-image'),
  copyShortImage: document.getElementById('copy-short-image'),
  download: document.getElementById('download'),
  canvas: document.getElementById('canvas'),
  status: document.getElementById('status'),
  meta: document.getElementById('meta'),
  imageUrl: document.getElementById('image-url'),
  shortUrl: document.getElementById('short-url')
};

const SHORT_KEY = 's';
const STATE_VERSION = 1;
const KEY_MAP = {
  t: 'type',
  i: 'input',
  d: 'data',
  z: 'size',
  m: 'margin',
  c: 'scale',
  r: 'rotate',
  f: 'fg',
  b: 'bg',
  x: 'includetext',
  a: 'textalign',
  h: 'heightmm',
  e: 'eclevel',
  n: 'parsefnc',
  p: 'parse'
};
const REVERSE_KEY_MAP = Object.fromEntries(
  Object.entries(KEY_MAP).map(([key, value]) => [value, key])
);

const DEFAULTS = {
  type: 'qrcode',
  input: 'text',
  data: 'https://example.com/?hello=world',
  size: '256',
  margin: '0',
  scale: '4',
  rotate: 'N',
  fg: '#000000',
  bg: '#ffffff',
  includetext: 'false',
  textalign: 'center'
};

let renderGeneration = 0;
let popularTypes = [];
let debounceTimer = null;

main().catch((error) => setStatus(`Startup error: ${error.message || error}`, true));

async function main() {
  await loadTypes();
  await hydrateFromQuery();
  bindEvents();
  registerServiceWorker();
  await render();
}

async function loadTypes() {
  const response = await fetch('/api/types');
  if (!response.ok) {
    throw new Error('Could not load supported code types.');
  }

  const payload = await response.json();
  popularTypes = payload.popular || [];
  els.typeList.innerHTML = '';

  for (const item of popularTypes) {
    const option = document.createElement('option');
    option.value = item.id;
    option.label = `${item.label} · ${item.kind}`;
    els.typeList.appendChild(option);
  }
}

function bindEvents() {
  els.form.addEventListener('input', scheduleRender);
  els.form.addEventListener('change', scheduleRender);

  els.sample.addEventListener('click', async () => {
    const type = els.type.value.trim() || DEFAULTS.type;

    try {
      const response = await fetch(`/api/sample/${encodeURIComponent(type)}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'No sample available.');
      }

      els.data.value = payload.data;
      scheduleRender();
    } catch (error) {
      setStatus(error.message || String(error), true);
    }
  });

  els.copyPage.addEventListener('click', async () => {
    await copyText(buildAbsolutePageUrl(), 'Page URL copied');
  });

  els.copyShortPage.addEventListener('click', async () => {
    await copyText(await buildShortPageUrl(), 'Short page URL copied');
  });

  els.copyImage.addEventListener('click', async () => {
    await copyText(buildAbsoluteImageUrl(), 'Image URL copied');
  });

  els.copyShortImage.addEventListener('click', async () => {
    await copyText(await buildAbsoluteShortImageUrl(), 'Short image URL copied');
  });

  els.download.addEventListener('click', () => {
    const filename = filenameForCurrentCode();

    els.canvas.toBlob(
      (blob) => {
        if (!blob) {
          setStatus('Could not create PNG blob.', true);
          return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setStatus('PNG downloaded');
      },
      'image/png'
    );
  });
}

async function hydrateFromQuery() {
  const params = new URLSearchParams(window.location.search);

  if (params.get(SHORT_KEY)) {
    const expanded = await decodeState(params.get(SHORT_KEY));
    if (expanded) {
      for (const [key, value] of Object.entries(expanded)) {
        params.set(key, value);
      }
    }
  }

  setValue(els.type, params.get('type') || params.get('bcid') || DEFAULTS.type);
  setValue(els.input, params.get('input') || params.get('format') || DEFAULTS.input);
  setValue(els.data, params.get('data') ?? params.get('text') ?? DEFAULTS.data);
  setValue(els.size, params.get('size') || params.get('codeSize') || DEFAULTS.size);
  setValue(els.margin, params.get('margin') || DEFAULTS.margin);
  setValue(els.scale, params.get('scale') || DEFAULTS.scale);
  setValue(els.rotate, params.get('rotate') || DEFAULTS.rotate);
  setValue(
    els.fg,
    normalizeColorForInput(params.get('fg') || params.get('foreground') || DEFAULTS.fg)
  );
  setValue(
    els.bg,
    normalizeColorForInput(params.get('bg') || params.get('background') || DEFAULTS.bg)
  );
  setValue(els.includetext, params.get('includetext') || DEFAULTS.includetext);
  setValue(els.textalign, params.get('textalign') || DEFAULTS.textalign);
  setValue(els.heightmm, params.get('heightmm') || params.get('height') || '');
  setValue(els.eclevel, params.get('eclevel') || '');
  setValue(els.parsefnc, params.get('parsefnc') || '');
  setValue(els.parse, params.get('parse') || '');
}

const setValue = (element, value) => {
  element.value = value;
};

function normalizeColorForInput(value) {
  const stripped = String(value || '').trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(stripped) ? `#${stripped}` : value;
}

function scheduleRender() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(
    () => render().catch((error) => setStatus(error.message || String(error), true)),
    120
  );
}

async function render() {
  const generation = ++renderGeneration;
  const params = buildParams();
  const imagePath = `/api/code.png?${params.toString()}`;
  const imageUrl = `${window.location.origin}${imagePath}`;
  els.imageUrl.value = imageUrl;

  updateMeta();
  els.shortUrl.value = await buildAbsoluteShortPageUrl();
  history.replaceState(null, '', buildRelativePageUrl());
  setStatus('Rendering…');

  const response = await fetch(imagePath, { headers: { Accept: 'image/png, application/json' } });
  if (generation !== renderGeneration) {
    return;
  }

  if (!response.ok) {
    setStatus(await readError(response), true);
    return;
  }

  const blob = await response.blob();
  const image = await blobToImage(blob);
  if (generation !== renderGeneration) {
    URL.revokeObjectURL(image.src);
    return;
  }

  drawImageToCanvas(image);
  URL.revokeObjectURL(image.src);
  setStatus('Ready');
}

function buildParams() {
  const params = new URLSearchParams();
  params.set('type', els.type.value.trim() || DEFAULTS.type);
  params.set('input', els.input.value || DEFAULTS.input);
  params.set('data', els.data.value);
  params.set('size', els.size.value || DEFAULTS.size);
  params.set('margin', els.margin.value || DEFAULTS.margin);
  params.set('scale', els.scale.value || DEFAULTS.scale);
  params.set('rotate', els.rotate.value || DEFAULTS.rotate);
  params.set('fg', stripHash(els.fg.value || DEFAULTS.fg));
  params.set('bg', stripHash(els.bg.value || DEFAULTS.bg));
  params.set('includetext', els.includetext.value || DEFAULTS.includetext);
  params.set('textalign', els.textalign.value || DEFAULTS.textalign);
  setOptional(params, 'heightmm', els.heightmm.value);
  setOptional(params, 'eclevel', els.eclevel.value);
  setOptional(params, 'parsefnc', els.parsefnc.value);
  setOptional(params, 'parse', els.parse.value);
  return params;
}

function setOptional(params, key, value) {
  if (String(value || '').trim()) {
    params.set(key, String(value).trim());
  }
}

function stripHash(color) {
  return String(color || '').replace(/^#/, '').toLowerCase();
}

function buildRelativePageUrl() {
  return `?${buildParams().toString()}`;
}

function buildAbsolutePageUrl() {
  return `${window.location.origin}${window.location.pathname}${buildRelativePageUrl()}`;
}

async function buildShortPageUrl() {
  const encoded = await buildShortStatePayload();
  return `${window.location.pathname}?${SHORT_KEY}=${encodeURIComponent(encoded)}`;
}

async function buildAbsoluteShortPageUrl() {
  return `${window.location.origin}${await buildShortPageUrl()}`;
}

function buildAbsoluteImageUrl() {
  return `${window.location.origin}/api/code.png?${buildParams().toString()}`;
}

async function buildAbsoluteShortImageUrl() {
  const payload = await buildShortStatePayload();
  return `${window.location.origin}/api/code.png?${SHORT_KEY}=${encodeURIComponent(payload)}`;
}

async function buildShortStatePayload() {
  const payload = { v: STATE_VERSION, d: {} };
  const params = buildParams();

  for (const [key, value] of params.entries()) {
    const shortKey = REVERSE_KEY_MAP[key] || key;
    payload.d[shortKey] = value;
  }

  return encodeState(payload);
}

function updateMeta() {
  const size = Number.parseInt(els.size.value || DEFAULTS.size, 10);
  const margin = Number.parseInt(els.margin.value || DEFAULTS.margin, 10);
  const output = Math.max(1, size) + Math.max(0, margin) * 2;
  els.meta.textContent = `Output: ${output} × ${output} px`;
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.dataset.state = isError ? 'error' : 'ok';
}

async function copyText(text, okMessage) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(okMessage);
  } catch {
    setStatus('Clipboard denied. Copy manually.', true);
  }
}

function filenameForCurrentCode() {
  const type = (els.type.value || DEFAULTS.type).replace(/[^a-z0-9_-]+/gi, '-');
  return `${type || 'code'}-${Date.now()}.png`;
}

async function readError(response) {
  try {
    const payload = await response.json();
    if (payload && payload.error) {
      return payload.error;
    }
  } catch {
    // Intentionally ignore JSON parsing errors and fall back to status text.
  }

  return response.statusText || 'Render failed';
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image.'));
    };
    img.src = url;
  });
}

function drawImageToCanvas(image) {
  els.canvas.width = image.naturalWidth;
  els.canvas.height = image.naturalHeight;
  const ctx = els.canvas.getContext('2d');
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  ctx.drawImage(image, 0, 0);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }
}

async function encodeState(payload) {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream === 'undefined') {
    return toBase64Url(json);
  }

  const compressed = await compress(json);
  return `z.${toBase64Url(compressed)}`;
}

async function decodeState(encoded) {
  try {
    if (encoded.startsWith('z.')) {
      if (typeof DecompressionStream === 'undefined') {
        return null;
      }

      const bytes = fromBase64Url(encoded.slice(2));
      const raw = await decompress(bytes);
      return expandState(JSON.parse(new TextDecoder().decode(raw)));
    }

    return expandState(JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))));
  } catch {
    return null;
  }
}

function expandState(payload) {
  const state = {};
  const dict = (payload && payload.d) || {};

  for (const [key, value] of Object.entries(dict)) {
    state[KEY_MAP[key] || key] = String(value);
  }

  return state;
}

async function compress(bytes) {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

async function decompress(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

function toBase64Url(bytes) {
  let str = '';
  for (const byte of bytes) {
    str += String.fromCharCode(byte);
  }

  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);

  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }

  return out;
}
