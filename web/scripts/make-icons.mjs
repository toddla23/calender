// 앱 아이콘 PNG 생성 (외부 의존성 없음). icon.svg 와 같은 도형을 직접 래스터화한다.
// 사용: node scripts/make-icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// [x, y, w, h, r, color] (64 단위 좌표)
const shapes = [
  [0, 0, 64, 64, 14, '#2f6fde'],
  [12, 16, 40, 36, 5, '#ffffff'],
  [12, 16, 40, 9, 4, '#d6e3fb'],
  [18, 30, 6, 5, 1, '#2f6fde'], [29, 30, 6, 5, 1, '#2f6fde'], [40, 30, 6, 5, 1, '#e04848'],
  [18, 40, 6, 5, 1, '#2f6fde'], [29, 40, 6, 5, 1, '#2f6fde'],
];
function inside(px, py, [x, y, w, h, r]) {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}
function render(size) {
  const ss = 4, s = 64 / size;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const px = (x + (sx + 0.5) / ss) * s, py = (y + (sy + 0.5) / ss) * s;
        let col = null;
        for (const sh of shapes) if (inside(px, py, sh)) col = hex(sh[5]);
        if (col) { r += col[0]; g += col[1]; b += col[2]; a++; }
      }
      const n = ss * ss, o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = a ? r / a : 0; raw[o + 1] = a ? g / a : 0; raw[o + 2] = a ? b / a : 0; raw[o + 3] = Math.round((a / n) * 255);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const v of buf) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const out = new URL('../public/icons/', import.meta.url);
for (const size of [192, 512]) fs.writeFileSync(new URL(`icon-${size}.png`, out), render(size));
fs.mkdirSync(new URL('../../desktop/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../../desktop/app-icon.png', import.meta.url), render(1024));
console.log('아이콘 생성 완료');
