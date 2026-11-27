import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  typeBytes.copy(out, 4);
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(width, height, pixels) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0;
    Buffer.from(pixels.buffer, y * width * 4, width * 4).copy(raw, y * stride + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

class Bitmap {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  blend(x, y, color) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return;
    }
    const index = (y * this.width + x) * 4;
    const sa = color[3] / 255;
    if (sa <= 0) {
      return;
    }
    const da = this.data[index + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) {
      return;
    }
    this.data[index] = (color[0] * sa + this.data[index] * da * (1 - sa)) / oa;
    this.data[index + 1] = (color[1] * sa + this.data[index + 1] * da * (1 - sa)) / oa;
    this.data[index + 2] = (color[2] * sa + this.data[index + 2] * da * (1 - sa)) / oa;
    this.data[index + 3] = oa * 255;
  }

  fill(x, y, w, h, color) {
    for (let py = y; py < y + h; py += 1) {
      for (let px = x; px < x + w; px += 1) {
        this.blend(px, py, color);
      }
    }
  }

  span(cx, cy, rx, ry, color) {
    for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y += 1) {
      const ny = (y + 0.5 - cy) / ry;
      const span = rx * Math.sqrt(Math.max(0, 1 - ny * ny));
      const x0 = Math.round(cx - span);
      const x1 = Math.round(cx + span);
      if (x1 > x0) {
        this.fill(x0, y, x1 - x0, 1, color);
      }
    }
  }
}

function hex(value, alpha = 255) {
  const number = Number.parseInt(value.slice(1), 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255, alpha];
}

const palette = {
  outline: hex('#12301c'),
  body: hex('#3fae49'),
  light: hex('#7be07f'),
  shine: hex('#c8f7b5'),
  eye: hex('#0b1f12'),
  white: hex('#ffffff'),
  shadow: hex('#000000', 70)
};

function drawSlime(bitmap, ox, oy, phase) {
  const shapes = [
    { cy: 11, rx: 5.2, ry: 3.1, blink: false },
    { cy: 9.5, rx: 4.4, ry: 4.4, blink: false },
    { cy: 7.5, rx: 3.8, ry: 5.2, blink: false },
    { cy: 9.5, rx: 4.8, ry: 4, blink: true }
  ];
  const shape = shapes[phase];
  bitmap.span(ox + 8, oy + 14.5, 5.4, 1, palette.shadow);
  bitmap.span(ox + 8, oy + shape.cy, shape.rx + 1, shape.ry + 1, palette.outline);
  bitmap.span(ox + 8, oy + shape.cy, shape.rx, shape.ry, palette.body);
  bitmap.span(ox + 7, oy + shape.cy - shape.ry * 0.45, shape.rx * 0.42, shape.ry * 0.3, palette.light);
  bitmap.fill(ox + 5, oy + Math.round(shape.cy - shape.ry * 0.72), 2, 1, palette.shine);
  const eyeY = oy + Math.round(shape.cy - shape.ry * 0.15);
  bitmap.fill(ox + 6, eyeY, 1, shape.blink ? 1 : 2, palette.eye);
  bitmap.fill(ox + 10, eyeY, 1, shape.blink ? 1 : 2, palette.eye);
  if (!shape.blink) {
    bitmap.fill(ox + 6, eyeY, 1, 1, palette.white);
    bitmap.fill(ox + 10, eyeY, 1, 1, palette.white);
  }
  bitmap.fill(ox + 8, eyeY + 2, 2, 1, palette.eye);
}

function makeSample() {
  const sheet = new Bitmap(64, 16);
  for (let index = 0; index < 4; index += 1) {
    drawSlime(sheet, index * 16, 0, index);
  }
  return encodePng(sheet.width, sheet.height, sheet.data);
}

function insideRounded(x, y, inset, radius) {
  const min = inset + radius;
  const max = 127 - inset - radius;
  const dx = x < min ? min - x : x > max ? x - max : 0;
  const dy = y < min ? min - y : y > max ? y - max : 0;
  return dx * dx + dy * dy <= radius * radius;
}

function makeIcon() {
  const icon = new Bitmap(128, 128);
  const background = hex('#101a13');
  const border = hex('#2d4d36');
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      if (!insideRounded(x, y, 0, 18)) {
        continue;
      }
      icon.fill(x, y, 1, 1, insideRounded(x, y, 3, 15) ? background : border);
    }
  }
  const art = new Bitmap(16, 16);
  drawSlime(art, 0, 0, 1);
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const index = (y * 16 + x) * 4;
      const alpha = art.data[index + 3];
      if (alpha === 0) {
        continue;
      }
      icon.fill(16 + x * 6, 16 + y * 6, 6, 6, [
        art.data[index],
        art.data[index + 1],
        art.data[index + 2],
        alpha
      ]);
    }
  }
  return encodePng(icon.width, icon.height, icon.data);
}

mkdirSync('media', { recursive: true });
mkdirSync('dev', { recursive: true });
writeFileSync('media/icon.png', makeIcon());
writeFileSync('dev/sample.png', makeSample());
console.log('Generados media/icon.png y dev/sample.png');
