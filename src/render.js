'use strict';

const bwipjs = require('@bwip-js/node');
const sharp = require('sharp');
const { decodeInput } = require('./input');
const { normalizeBcid } = require('./symbologies');

const DEFAULT_SIZE = 256;
const DEFAULT_MARGIN = 0;
const DEFAULT_SCALE = 4;
const MAX_SIZE = Number.parseInt(process.env.MAX_CODE_SIZE || '4096', 10);
const MAX_MARGIN = Number.parseInt(process.env.MAX_MARGIN || '2000', 10);
const MAX_OUTPUT_PIXELS = Number.parseInt(process.env.MAX_OUTPUT_PIXELS || '67108864', 10); // 8192 * 8192

function asSingle(value) {
  return Array.isArray(value) ? value[0] : value;
}

function parseInteger(query, names, fallback, min, max) {
  const keys = Array.isArray(names) ? names : [names];
  const raw = keys.map((key) => asSingle(query[key])).find((value) => value !== undefined && value !== '');

  if (raw === undefined) {
    return fallback;
  }

  const value = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(value) || String(raw).trim() === '') {
    throw new Error(`${keys[0]} must be an integer.`);
  }

  if (value < min || value > max) {
    throw new Error(`${keys[0]} must be between ${min} and ${max}.`);
  }

  return value;
}

function parseBoolean(query, name, fallback = false) {
  const raw = asSingle(query[name]);
  if (raw === undefined || raw === '') {
    return fallback;
  }

  const value = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(value)) {
    return false;
  }

  throw new Error(`${name} must be true/false or 1/0.`);
}

function normalizeColor(raw, fallback) {
  const value = String(raw || fallback).trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error('Colors must be 6-digit hex values, for example 000000 or ffffff.');
  }
  return value.toLowerCase();
}

function cssColor(hex) {
  return `#${hex}`;
}

function normalizeRotate(raw) {
  const value = String(raw || 'N').trim().toUpperCase();
  if (!['N', 'R', 'L', 'I'].includes(value)) {
    throw new Error('rotate must be one of N, R, L, or I.');
  }
  return value;
}

function normalizeTextAlign(raw) {
  const value = String(raw || 'center').trim().toLowerCase();
  if (!['left', 'center', 'right', 'justify'].includes(value)) {
    throw new Error('textalign must be left, center, right, or justify.');
  }
  return value;
}

function applyOptionalBwippOptions(query, options) {
  const stringOptions = ['eclevel', 'mode', 'version', 'symbolversion', 'primary'];
  const numericOptions = ['columns', 'rows', 'layers', 'securitylevel'];
  const booleanOptions = ['parse', 'parsefnc', 'guardwhitespace', 'dotty'];

  for (const key of stringOptions) {
    const raw = asSingle(query[key]);
    if (raw !== undefined && raw !== '') {
      options[key] = String(raw).trim();
    }
  }

  for (const key of numericOptions) {
    const raw = asSingle(query[key]);
    if (raw !== undefined && raw !== '') {
      const parsed = Number.parseInt(String(raw), 10);
      if (!Number.isFinite(parsed)) {
        throw new Error(`${key} must be an integer.`);
      }
      options[key] = parsed;
    }
  }

  for (const key of booleanOptions) {
    const raw = asSingle(query[key]);
    if (raw !== undefined && raw !== '') {
      options[key] = parseBoolean(query, key, false);
    }
  }
}

function normalizeRequest(query) {
  const type = normalizeBcid(asSingle(query.type) || asSingle(query.bcid) || 'qrcode');
  const input = String(asSingle(query.input) || asSingle(query.format) || 'text').trim().toLowerCase();
  const data = asSingle(query.data) ?? asSingle(query.text) ?? '';
  const size = parseInteger(query, ['size', 'codeSize'], DEFAULT_SIZE, 16, MAX_SIZE);
  const margin = parseInteger(query, 'margin', DEFAULT_MARGIN, 0, MAX_MARGIN);
  const scale = parseInteger(query, 'scale', DEFAULT_SCALE, 1, 20);
  const rotate = normalizeRotate(asSingle(query.rotate));
  const includetext = parseBoolean(query, 'includetext', false);
  const textalign = normalizeTextAlign(asSingle(query.textalign) || asSingle(query.textxalign));
  const fg = normalizeColor(asSingle(query.fg) || asSingle(query.foreground) || asSingle(query.barcolor), '000000');
  const bg = normalizeColor(asSingle(query.bg) || asSingle(query.background) || asSingle(query.backgroundcolor), 'ffffff');
  const heightmmRaw = asSingle(query.heightmm) || asSingle(query.height);
  const heightmm = heightmmRaw === undefined || heightmmRaw === ''
    ? undefined
    : parseInteger(query, ['heightmm', 'height'], 25, 1, 200);

  const outputSize = size + margin * 2;
  if (outputSize * outputSize > MAX_OUTPUT_PIXELS) {
    throw new Error(`Output image is too large. Current limit is ${MAX_OUTPUT_PIXELS} pixels.`);
  }

  return {
    type,
    input,
    data: String(data),
    size,
    margin,
    scale,
    rotate,
    includetext,
    textalign,
    fg,
    bg,
    heightmm,
    outputSize
  };
}

async function trimBarcodeWhitespace(png, background) {
  try {
    return await sharp(png)
      .flatten({ background: cssColor(background) })
      .trim({ background: cssColor(background), threshold: 1 })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    return png;
  }
}

async function renderCodePng(query) {
  const normalized = normalizeRequest(query);
  const decoded = decodeInput(normalized.data, normalized.input);

  const bwipOptions = {
    bcid: normalized.type,
    text: decoded.text,
    scale: normalized.scale,
    rotate: normalized.rotate,
    padding: 0,
    backgroundcolor: normalized.bg,
    barcolor: normalized.fg,
    includetext: normalized.includetext,
    textxalign: normalized.textalign
  };

  if (decoded.binarytext) {
    bwipOptions.binarytext = true;
  }

  if (normalized.heightmm !== undefined) {
    bwipOptions.height = normalized.heightmm;
  }

  applyOptionalBwippOptions(query, bwipOptions);

  const rawPng = await bwipjs.toBuffer(bwipOptions);
  const trimmedPng = await trimBarcodeWhitespace(rawPng, normalized.bg);

  const fittedCode = await sharp(trimmedPng)
    .flatten({ background: cssColor(normalized.bg) })
    .resize({
      width: normalized.size,
      height: normalized.size,
      fit: 'contain',
      background: cssColor(normalized.bg),
      kernel: sharp.kernel.nearest
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const png = normalized.margin === 0
    ? fittedCode
    : await sharp({
      create: {
        width: normalized.outputSize,
        height: normalized.outputSize,
        channels: 3,
        background: cssColor(normalized.bg)
      }
    })
      .composite([{ input: fittedCode, left: normalized.margin, top: normalized.margin }])
      .png({ compressionLevel: 9 })
      .toBuffer();

  return {
    png,
    normalized,
    bwipOptions
  };
}

module.exports = {
  renderCodePng,
  normalizeRequest,
  parseBoolean,
  parseInteger,
  normalizeColor
};
