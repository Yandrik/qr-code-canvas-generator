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
  copyImage: document.getElementById('copy-image'),
  download: document.getElementById('download'),
  canvas: document.getElementById('canvas'),
  status: document.getElementById('status'),
  meta: document.getElementById('meta'),
  imageUrl: document.getElementById('image-url')
};

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

main().catch((error) => {
  setStatus(`Startup error: ${error.message || error}`, true);
});

async function main() {
  await loadTypes();
  hydrateFromQuery();
  bindEvents();
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
    const url = buildPageUrl();
    await copyText(url, 'Page URL copied');
  });

  els.copyImage.addEventListener('click', async () => {
    const url = buildAbsoluteImageUrl();
    await copyText(url, 'Image URL copied');
  });

  els.download.addEventListener('click', () => {
    const filename = filenameForCurrentCode();
    els.canvas.toBlob((blob) => {
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
    }, 'image/png');
  });
}

function hydrateFromQuery() {
  const params = new URLSearchParams(window.location.search);

  setValue(els.type, params.get('type') || params.get('bcid') || DEFAULTS.type);
  setValue(els.input, params.get('input') || params.get('format') || DEFAULTS.input);
  setValue(els.data, params.get('data') ?? params.get('text') ?? DEFAULTS.data);
  setValue(els.size, params.get('size') || params.get('codeSize') || DEFAULTS.size);
  setValue(els.margin, params.get('margin') || DEFAULTS.margin);
  setValue(els.scale, params.get('scale') || DEFAULTS.scale);
  setValue(els.rotate, params.get('rotate') || DEFAULTS.rotate);
  setValue(els.fg, normalizeColorForInput(params.get('fg') || params.get('foreground') || DEFAULTS.fg));
  setValue(els.bg, normalizeColorForInput(params.get('bg') || params.get('background') || DEFAULTS.bg));
  setValue(els.includetext, params.get('includetext') || DEFAULTS.includetext);
  setValue(els.textalign, params.get('textalign') || DEFAULTS.textalign);
  setValue(els.heightmm, params.get('heightmm') || params.get('height') || '');
  setValue(els.eclevel, params.get('eclevel') || '');
  setValue(els.parsefnc, params.get('parsefnc') || '');
  setValue(els.parse, params.get('parse') || '');
}

function setValue(element, value) {
  element.value = value;
}

function normalizeColorForInput(value) {
  const stripped = String(value || '').trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(stripped) ? `#${stripped}` : value;
}

function scheduleRender() {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    render().catch((error) => setStatus(error.message || String(error), true));
  }, 120);
}

async function render() {
  const generation = ++renderGeneration;
  const params = buildParams();
  const imagePath = `/api/code.png?${params.toString()}`;
  const imageUrl = `${window.location.origin}${imagePath}`;

  els.imageUrl.value = imageUrl;
  updateMeta();
  window.history.replaceState(null, '', buildPageUrl());
  setStatus('Rendering…');

  const response = await fetch(imagePath, { headers: { Accept: 'image/png, application/json' } });
  if (generation !== renderGeneration) {
    return;
  }

  if (!response.ok) {
    const message = await readError(response);
    setStatus(message, true);
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
  if (value !== undefined && String(value).trim() !== '') {
    params.set(key, String(value).trim());
  }
}

function buildPageUrl() {
  return `${window.location.origin}${window.location.pathname}?${buildParams().toString()}`;
}

function buildAbsoluteImageUrl() {
  return `${window.location.origin}/api/code.png?${buildParams().toString()}`;
}

function stripHash(color) {
  return String(color || '').replace(/^#/, '');
}

function updateMeta() {
  const size = Math.max(0, Number.parseInt(els.size.value || DEFAULTS.size, 10));
  const margin = Math.max(0, Number.parseInt(els.margin.value || DEFAULTS.margin, 10));
  const output = size + margin * 2;
  els.meta.textContent = `Output: ${output} × ${output} px`;
}

function drawImageToCanvas(image) {
  const canvas = els.canvas;
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load generated image.'));
    };
    img.src = url;
  });
}

async function readError(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    return payload.error || `Render failed with HTTP ${response.status}`;
  }
  return response.text();
}

async function copyText(text, successMessage) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackCopy(text);
    }
    setStatus(successMessage);
  } catch (error) {
    setStatus(`Copy failed: ${error.message || error}`, true);
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function filenameForCurrentCode() {
  const safeType = (els.type.value || DEFAULTS.type).replace(/[^a-z0-9_-]+/gi, '-').slice(0, 64);
  const size = els.size.value || DEFAULTS.size;
  const margin = els.margin.value || DEFAULTS.margin;
  return `${safeType}-${size}px-m${margin}.png`;
}

function setStatus(message, error = false) {
  els.status.textContent = message;
  els.status.dataset.error = error ? 'true' : 'false';
}
