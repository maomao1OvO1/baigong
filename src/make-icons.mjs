/* ============================================================================
   文件：src/make-icons.mjs —— 生成 PWA / 桌面应用的图标（小鲸 · 2026-10-12）
   为什么自己画：站点是零依赖的静态站，不想为了几张图标去装 canvas / sharp（几十 MB）。
     PNG 其实很好写：文件头 + IHDR + IDAT（zlib 压缩的扫描线）+ IEND，四个块就完事。
   图案：品牌蓝底 + 白色字母 T（两个矩形）—— 和对角线、渐变的图标相比，
     纯色 + 一个字母在 192px 与 512px 下都清楚，也符合本站「简约美」的六条规则（无渐变）。
   用法：node src/make-icons.mjs   → 写 assets/icon-192.png · icon-512.png · apple-touch-icon.png
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* ── PNG 编码三件套 ───────────────────────────────────────────────────── */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
};

/** 把 RGBA 像素数组编码成 PNG */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;      // 位深 8
  ihdr[9] = 6;      // 颜色类型 6 = RGBA
  // 每行前面要加一个 filter 字节（0 = 不过滤），这是 PNG 的规矩
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ── 画图标：蓝底 + 白色 T + 圆角 ─────────────────────────────────────── */
const BG = [0x25, 0x63, 0xeb];     // --brand
const FG = [0xff, 0xff, 0xff];

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const r = size * 0.22;                       // 圆角半径（和站内 10px 圆角同一路的克制感）
  const inRoundRect = (x, y) => {
    const cx = Math.min(Math.max(x, r), size - r);
    const cy = Math.min(Math.max(y, r), size - r);
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  };
  // T 字：横杠 + 竖杠（用比例定位，任何尺寸都等比）
  const barY0 = size * 0.27, barY1 = size * 0.41;
  const barX0 = size * 0.22, barX1 = size * 0.78;
  const stemX0 = size * 0.435, stemX1 = size * 0.565, stemY1 = size * 0.76;
  const inT = (x, y) =>
    (y >= barY0 && y <= barY1 && x >= barX0 && x <= barX1) ||
    (y > barY1 && y <= stemY1 && x >= stemX0 && x <= stemX1);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inside = inRoundRect(x + 0.5, y + 0.5);
      const isT = inT(x + 0.5, y + 0.5);
      if (!inside) { rgba[i + 3] = 0; continue; }         // 圆角外全透明
      const c = isT ? FG : BG;
      rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

const OUT = [
  [192, "assets/icon-192.png"],
  [512, "assets/icon-512.png"],
  [180, "assets/apple-touch-icon.png"],   // iOS 加到主屏用
];
for (const [size, rel] of OUT) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const png = drawIcon(size);
  fs.writeFileSync(file, png);
  console.log(`  ✓ ${rel}  (${size}×${size}, ${png.length} 字节)`);
}
console.log("图标生成完成 —— 蓝底白 T，无渐变（符合站内简约规则）");
