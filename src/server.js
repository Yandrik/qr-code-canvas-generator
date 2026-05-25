'use strict';

const path = require('node:path');
const { inflateRawSync } = require('node:zlib');
const express = require('express');
const { renderCodePng } = require('./render');
const { POPULAR_TYPES, sampleForType } = require('./symbologies');

const app = express();
const port = Number.parseInt(process.env.PORT || '8080', 10);
const publicDir = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');
app.set('query parser', 'simple');

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' blob:",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'self'"
  ].join('; '));
  next();
});

app.use(express.static(publicDir, {
  extensions: ['html'],
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));

app.get('/api/types', (req, res) => {
  res.json({
    popular: POPULAR_TYPES,
    note: 'The UI lists popular barcode ids. The backend also accepts any safe bwip-js encoder id in the type query parameter.'
  });
});

app.get('/api/sample/:type', (req, res) => {
  try {
    res.json({ data: sampleForType(req.params.type) });
  } catch (error) {
    res.status(400).json({ error: messageFromError(error) });
  }
});

app.get('/api/code.png', async (req, res) => {
  try {
    const query = decodeShortQuery(req.query);
    const result = await renderCodePng(query);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Code-Type', result.normalized.type);
    res.setHeader('X-Code-Size', String(result.normalized.size));
    res.setHeader('X-Code-Margin', String(result.normalized.margin));
    res.setHeader('X-Output-Size', String(result.normalized.outputSize));
    res.send(result.png);
  } catch (error) {
    const message = messageFromError(error);
    res.status(400);
    if (acceptsJson(req)) {
      res.json({ error: message });
    } else {
      res.type('text/plain').send(message);
    }
  }
});

app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

app.use((req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Code Canvas Generator listening on http://0.0.0.0:${port}`);
});


function decodeShortQuery(query) {
  const encoded = query && query.s;
  if (!encoded || typeof encoded !== 'string') {
    return query;
  }

  const expanded = decodeState(encoded);
  return { ...query, ...expanded };
}

function decodeState(encoded) {
  let jsonBytes;

  if (encoded.startsWith('z.')) {
    const compressed = fromBase64Url(encoded.slice(2));
    jsonBytes = inflateRawSync(compressed);
  } else {
    jsonBytes = fromBase64Url(encoded);
  }

  const payload = JSON.parse(Buffer.from(jsonBytes).toString('utf8'));
  const dict = payload && payload.d ? payload.d : {};
  const output = {};

  for (const [key, value] of Object.entries(dict)) {
    output[KEY_MAP[key] || key] = String(value);
  }

  return output;
}

function fromBase64Url(input) {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

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

function acceptsJson(req) {
  const accept = String(req.headers.accept || '');
  return accept.includes('application/json') || accept.includes('*/*');
}

function messageFromError(error) {
  if (!error) {
    return 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  return error.message || String(error);
}
