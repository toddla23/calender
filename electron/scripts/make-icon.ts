/**
 * 앱 아이콘(resources/icon.png, 256x256)을 생성한다. 외부 의존성 없이 zlib로 PNG를 직접 만든다.
 * 실행: npx tsx scripts/make-icon.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

const S = 256;
const px = Buffer.alloc(S * S * 4); // RGBA, 투명

function inRoundRect(x: number, y: number, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
  const cx = x < x0 + r ? x0 + r : x >= x1 - r ? x1 - r - 1 : x;
  const cy = y < y0 + r ? y0 + r : y >= y1 - r ? y1 - r - 1 : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function put(x: number, y: number, c: [number, number, number]) {
  const i = (y * S + x) * 4;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
  px[i + 3] = 255;
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (!inRoundRect(x, y, 16, 16, 240, 240, 36)) continue;
    // 흰 종이 + 상단 파란 띠
    let c: [number, number, number] = y < 80 ? [79, 142, 247] : [250, 251, 253];
    // 날짜 점 (5x3 격자)
    if (y >= 104 && y < 216) {
      const gx = Math.floor((x - 44) / 36);
      const gy = Math.floor((y - 108) / 36);
      const lx = (x - 44) % 36;
      const ly = (y - 108) % 36;
      if (gx >= 0 && gx < 5 && gy >= 0 && gy < 3 && lx >= 0 && ly >= 0 && (lx - 12) ** 2 + (ly - 12) ** 2 <= 49) {
        c = gx === 0 ? [244, 106, 106] : [120, 130, 150];
      }
    }
    put(x, y, c);
  }
}

// PNG 인코딩
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Buffer) => {
  let c = 0xffffffff;
  for (const v of b) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = join(__dirname, '..', 'resources', 'icon.png');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log('생성:', out, png.length, 'bytes');
