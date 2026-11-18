import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['maskable-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size; const v = y / size;
    let color = [15, 23, 42, 255];
    const rect = (l, t, r, b) => u >= l && u <= r && v >= t && v <= b;
    if (rect(.22, .25, .78, .64) || rect(.46, .64, .54, .73) || rect(.34, .72, .66, .76)) color = [248, 250, 252, 255];
    if (rect(.255, .285, .745, .59)) color = [37, 99, 235, 255];
    if ((rect(.36, .42, .42, .48)) || (Math.abs(v - (u + .06)) < .025 && u >= .36 && u <= .46) || (Math.abs(v - (-u + .98)) < .025 && u >= .45 && u <= .64)) color = [255, 255, 255, 255];
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    raw.set(color, offset);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  writeFileSync(new URL(name, out), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
