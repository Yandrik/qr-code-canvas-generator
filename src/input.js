'use strict';

const DEFAULT_MAX_BYTES = Number.parseInt(process.env.MAX_DATA_BYTES || '8192', 10);

function byteLengthUtf8(text) {
  return Buffer.byteLength(text, 'utf8');
}

function assertMaxBytes(bytes, maxBytes = DEFAULT_MAX_BYTES) {
  if (bytes > maxBytes) {
    throw new Error(`Input is too large. Max decoded payload is ${maxBytes} bytes.`);
  }
}

function assertAscii(text) {
  for (const char of text) {
    if (char.codePointAt(0) > 0x7f) {
      throw new Error('ASCII input may only contain characters from 0x00 to 0x7F.');
    }
  }
}

function assertLatin1(text) {
  for (const char of text) {
    if (char.codePointAt(0) > 0xff) {
      throw new Error('Latin-1 input may only contain characters from 0x00 to 0xFF.');
    }
  }
}

function strictBase64ToBuffer(raw, urlSafe = false) {
  const compact = String(raw || '').replace(/\s+/g, '');

  if (!compact) {
    return Buffer.alloc(0);
  }

  const pattern = urlSafe
    ? /^[A-Za-z0-9_-]*={0,2}$/
    : /^[A-Za-z0-9+/]*={0,2}$/;

  if (!pattern.test(compact) || compact.length % 4 === 1) {
    throw new Error(urlSafe ? 'Invalid Base64URL input.' : 'Invalid Base64 input.');
  }

  const normalized = urlSafe
    ? compact.replace(/-/g, '+').replace(/_/g, '/')
    : compact;
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

  return Buffer.from(padded, 'base64');
}

function hexToBuffer(raw) {
  const cleaned = String(raw || '')
    .replace(/0x/gi, '')
    .replace(/[\s:_-]/g, '');

  if (!cleaned) {
    return Buffer.alloc(0);
  }

  if (!/^[0-9a-fA-F]+$/.test(cleaned) || cleaned.length % 2 !== 0) {
    throw new Error('Hex input must contain an even number of hex digits. Separators are allowed.');
  }

  return Buffer.from(cleaned, 'hex');
}

function binaryToBuffer(raw) {
  const cleaned = String(raw || '').replace(/[\s:_-]/g, '');

  if (!cleaned) {
    return Buffer.alloc(0);
  }

  if (!/^[01]+$/.test(cleaned) || cleaned.length % 8 !== 0) {
    throw new Error('Binary input must contain only 0/1 bits and the bit count must be divisible by 8.');
  }

  const bytes = [];
  for (let i = 0; i < cleaned.length; i += 8) {
    bytes.push(Number.parseInt(cleaned.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function decodeInput(rawData, inputFormat = 'text', maxBytes = DEFAULT_MAX_BYTES) {
  const format = String(inputFormat || 'text').trim().toLowerCase();
  const data = rawData == null ? '' : String(rawData);

  switch (format) {
    case 'text':
    case 'utf8': {
      assertMaxBytes(byteLengthUtf8(data), maxBytes);
      return { text: data, binarytext: false, format };
    }

    case 'ascii': {
      assertAscii(data);
      assertMaxBytes(Buffer.byteLength(data, 'ascii'), maxBytes);
      return { text: data, binarytext: false, format };
    }

    case 'latin1':
    case 'binary-string': {
      assertLatin1(data);
      assertMaxBytes(Buffer.byteLength(data, 'latin1'), maxBytes);
      return { text: Buffer.from(data, 'latin1').toString('latin1'), binarytext: true, format: 'latin1' };
    }

    case 'base64': {
      const bytes = strictBase64ToBuffer(data, false);
      assertMaxBytes(bytes.length, maxBytes);
      return { text: bytes.toString('latin1'), binarytext: true, format };
    }

    case 'base64url': {
      const bytes = strictBase64ToBuffer(data, true);
      assertMaxBytes(bytes.length, maxBytes);
      return { text: bytes.toString('latin1'), binarytext: true, format };
    }

    case 'hex':
    case 'hexdump': {
      const bytes = hexToBuffer(data);
      assertMaxBytes(bytes.length, maxBytes);
      return { text: bytes.toString('latin1'), binarytext: true, format: 'hex' };
    }

    case 'binary':
    case 'bits': {
      const bytes = binaryToBuffer(data);
      assertMaxBytes(bytes.length, maxBytes);
      return { text: bytes.toString('latin1'), binarytext: true, format: 'binary' };
    }

    case 'urlencoded':
    case 'url': {
      let decoded;
      try {
        decoded = decodeURIComponent(data.replace(/\+/g, ' '));
      } catch {
        throw new Error('Invalid URL-encoded input.');
      }
      assertMaxBytes(byteLengthUtf8(decoded), maxBytes);
      return { text: decoded, binarytext: false, format: 'urlencoded' };
    }

    case 'json':
    case 'json-string': {
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        throw new Error('Invalid JSON input. Expected a JSON string or JSON value.');
      }
      const text = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
      assertMaxBytes(byteLengthUtf8(text), maxBytes);
      return { text, binarytext: false, format: 'json' };
    }

    default:
      throw new Error('Unsupported input format. Use text, ascii, latin1, base64, base64url, hex, binary, urlencoded, or json.');
  }
}

module.exports = {
  decodeInput,
  strictBase64ToBuffer,
  hexToBuffer,
  binaryToBuffer
};
