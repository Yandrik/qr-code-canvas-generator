'use strict';

const POPULAR_TYPES = [
  { id: 'qrcode', label: 'QR Code', kind: '2D', sample: 'https://example.com/?hello=world' },
  { id: 'gs1qrcode', label: 'GS1 QR Code', kind: '2D / GS1', sample: '(01)09501101530003(10)ABC123' },
  { id: 'microqrcode', label: 'Micro QR Code', kind: '2D', sample: 'A12345' },
  { id: 'rectangularmicroqrcode', label: 'Rectangular Micro QR Code', kind: '2D', sample: 'A12345' },
  { id: 'azteccode', label: 'Aztec Code', kind: '2D', sample: 'Aztec payload 123' },
  { id: 'azteccodecompact', label: 'Compact Aztec Code', kind: '2D', sample: 'Compact Aztec 123' },
  { id: 'datamatrix', label: 'Data Matrix', kind: '2D', sample: 'Data Matrix payload 123' },
  { id: 'datamatrixrectangular', label: 'Data Matrix Rectangular', kind: '2D', sample: 'RECT-1234567890' },
  { id: 'gs1datamatrix', label: 'GS1 Data Matrix', kind: '2D / GS1', sample: '(01)09501101530003(17)261231(10)ABC123' },
  { id: 'pdf417', label: 'PDF417', kind: 'Stacked', sample: 'PDF417 payload with more text 1234567890' },
  { id: 'pdf417compact', label: 'Compact PDF417', kind: 'Stacked', sample: 'Compact PDF417 1234567890' },
  { id: 'micropdf417', label: 'MicroPDF417', kind: 'Stacked', sample: 'MicroPDF417 123456' },
  { id: 'maxicode', label: 'MaxiCode', kind: '2D', sample: 'MaxiCode payload 1234567890' },
  { id: 'dotcode', label: 'DotCode', kind: '2D', sample: 'DotCode payload 1234567890' },
  { id: 'hanxin', label: 'Han Xin Code', kind: '2D', sample: 'Han Xin payload 123' },
  { id: 'ultracode', label: 'Ultracode', kind: '2D', sample: 'Ultracode payload 123' },
  { id: 'code128', label: 'Code 128', kind: 'Linear', sample: 'CODE128-1234567890' },
  { id: 'gs1-128', label: 'GS1-128', kind: 'Linear / GS1', sample: '(01)09501101530003(10)ABC123' },
  { id: 'code39', label: 'Code 39', kind: 'Linear', sample: 'CODE39-123' },
  { id: 'code39ext', label: 'Code 39 Extended', kind: 'Linear', sample: 'Code39 extended: abc-123' },
  { id: 'code93', label: 'Code 93', kind: 'Linear', sample: 'CODE93-123' },
  { id: 'code93ext', label: 'Code 93 Extended', kind: 'Linear', sample: 'Code93 extended: abc-123' },
  { id: 'ean13', label: 'EAN-13', kind: 'Retail', sample: '5901234123457' },
  { id: 'ean8', label: 'EAN-8', kind: 'Retail', sample: '96385074' },
  { id: 'upca', label: 'UPC-A', kind: 'Retail', sample: '012345678905' },
  { id: 'upce', label: 'UPC-E', kind: 'Retail', sample: '01234565' },
  { id: 'isbn', label: 'ISBN', kind: 'Retail', sample: '9781565812314' },
  { id: 'itf14', label: 'ITF-14', kind: 'Logistics', sample: '04601234567893' },
  { id: 'interleaved2of5', label: 'Interleaved 2 of 5', kind: 'Linear', sample: '0123456789' },
  { id: 'rationalizedCodabar', label: 'Codabar', kind: 'Linear', sample: 'A0123456789B' },
  { id: 'msi', label: 'MSI Modified Plessey', kind: 'Linear', sample: '0123456789' },
  { id: 'telepen', label: 'Telepen', kind: 'Linear', sample: 'ABC123xyz' },
  { id: 'postnet', label: 'USPS POSTNET', kind: 'Postal', sample: '01234567890' },
  { id: 'planet', label: 'USPS PLANET', kind: 'Postal', sample: '01234567890' },
  { id: 'onecode', label: 'USPS Intelligent Mail', kind: 'Postal', sample: '01234567094987654321-01234567891' },
  { id: 'royalmail', label: 'Royal Mail 4 State', kind: 'Postal', sample: 'LE28HS9Z' }
];

const TYPE_ALIASES = Object.freeze({
  qr: 'qrcode',
  'qr-code': 'qrcode',
  qrcode: 'qrcode',
  aztec: 'azteccode',
  'aztec-code': 'azteccode',
  'compact-aztec': 'azteccodecompact',
  datamatrix: 'datamatrix',
  'data-matrix': 'datamatrix',
  dm: 'datamatrix',
  pdf: 'pdf417',
  pdf417: 'pdf417',
  'compact-pdf417': 'pdf417compact',
  code128: 'code128',
  'code-128': 'code128',
  code39: 'code39',
  'code-39': 'code39',
  ean13: 'ean13',
  'ean-13': 'ean13',
  ean8: 'ean8',
  'ean-8': 'ean8',
  upca: 'upca',
  'upc-a': 'upca',
  upce: 'upce',
  'upc-e': 'upce',
  itf14: 'itf14',
  'itf-14': 'itf14',
  codabar: 'rationalizedCodabar',
  intelligentmail: 'onecode',
  'intelligent-mail': 'onecode'
});

const SAFE_BCID = /^[A-Za-z0-9_-]{2,64}$/;

function normalizeBcid(raw) {
  const requested = String(raw || 'qrcode').trim();
  const alias = TYPE_ALIASES[requested.toLowerCase()] || requested;

  if (!SAFE_BCID.test(alias)) {
    throw new Error('Invalid type. Use a bwip-js encoder id such as qrcode, azteccode, datamatrix, pdf417, code128, or gs1-128.');
  }

  return alias;
}

function sampleForType(type) {
  const normalized = normalizeBcid(type);
  return POPULAR_TYPES.find((item) => item.id === normalized)?.sample || 'Hello from Code Canvas';
}

module.exports = {
  POPULAR_TYPES,
  TYPE_ALIASES,
  normalizeBcid,
  sampleForType
};
