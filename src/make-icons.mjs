/* ============================================================================
   文件：src/make-icons.mjs —— 生成品牌图像：PWA 图标 + 社交分享图
   为什么自己画：站点是零依赖的静态站，不想为了几张图去装 canvas / sharp（几十 MB）。
      PNG 其实很好写：文件头 + IHDR + IDAT（zlib 压缩的扫描线）+ IEND，四个块就完事。
     ⚠️ 也正因为手写，**画不出文字**（没有字体渲染）—— 所以社交分享图上不放字，
        文字信息交给 og:title / og:description 承担（平台会把它们渲染在图片旁边）。

   2026-10-14 从 ToolPocket 改名为「百工 / Baigong」，图案随之从字母 T 换成**「工」字**：
     · 笔画全是直线（三横一竖）⇒ 手写像素也能画得干净，192px 下依然清楚；
     · 中、日、英三语的访客都认得出这个字形 —— 汉字本身就是最有辨识度的品牌符号；
     · 含义正对：百工＝各种工匠，工＝做工的地方。

   用法：node src/make-icons.mjs
         → assets/icon-192.png · icon-512.png · apple-touch-icon.png（应用图标）
         → assets/og-en.png · og-zh.png · og-ja.png（分享图，1200×630）
   注意：重新生成会丢掉图片里的作者元数据，接着跑：node src/inject-png-meta.mjs
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

/* ── 品牌色与形状 ─────────────────────────────────────────────────────── */
const BRAND = [0x25, 0x63, 0xeb];   // --brand
const WHITE = [0xff, 0xff, 0xff];
const PAPER = [0xf6, 0xf7, 0xf9];   // 分享图的浅灰底

/**
 * 「工」字的三个矩形（比例定位，任何尺寸都等比）。
 * 上横 / 中竖 / 下横 —— 全是直线，所以能用纯矩形拼出来，不需要字体。
 * 用比例而不是像素，是为了 180 / 192 / 512 / 分享图里的大图标共用同一套形状。
 *
 * ⚠️ 比例是调出来的，不是随手写的（前两版都不像汉字：
 *    第一版横画 0.14 高、中竖只 0.20 长 ⇒ 像个"工字钢"剖面，笨重；
 *    第二版把横收短到 0.48、竖拉到 0.30 ⇒ 反而变成大写 I（衬线体）。
 *    真正的关键在**横竖的长短比**：汉字「工」的横要明显长（约占字宽 8 成），
 *    竖高大约是横长的 4 成 —— 横长 ≈ 竖高 × 2.4 才有那个宽扁的汉字感。）
 *      · 横画压到 0.12 高（横比竖细，汉字的结构如此）；
 *      · 中竖 0.28 长、0.12 宽，居中；
 *      · 横拉到 0.16–0.84（长 0.68），让字形宽扁起来。
 */
function strokesGong(size, ox, oy) {
  const u = (v) => v * size;   // 比例 → 像素
  return [
    { x0: u(0.16), x1: u(0.84), y0: u(0.24), y1: u(0.36) },   // 上横（要长）
    { x0: u(0.44), x1: u(0.56), y0: u(0.36), y1: u(0.64) },   // 中竖
    { x0: u(0.16), x1: u(0.84), y0: u(0.64), y1: u(0.76) },   // 下横（要长）
  ];
}

/** 点 (x,y) 是否落在某个矩形里（矩形坐标是相对图标原点的） */
const inRects = (rects, x, y, ox, oy) =>
  rects.some((r) => x - ox >= r.x0 && x - ox <= r.x1 && y - oy >= r.y0 && y - oy <= r.y1);

/** 圆角方块的内部判定（圆角半径按比例给） */
function inRoundRect(x, y, ox, oy, size, radiusRatio) {
  const r = size * radiusRatio;
  const cx = Math.min(Math.max(x - ox, r), size - r);
  const cy = Math.min(Math.max(y - oy, r), size - r);
  const dx = x - ox - cx, dy = y - oy - cy;
  return dx * dx + dy * dy <= r * r;
}

/* ── ① 应用图标：蓝底 + 白色「工」+ 圆角 ──────────────────────────────── */
function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const rects = strokesGong(size, 0, 0);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!inRoundRect(x + 0.5, y + 0.5, 0, 0, size, 0.22)) { rgba[i + 3] = 0; continue; }
      const c = inRects(rects, x + 0.5, y + 0.5, 0, 0) ? WHITE : BRAND;
      rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

/* ── ② 分享图：浅灰底 + 居中大图标 + 一条品牌色横条 ────────────────────── */
/* 为什么不做成"图标 + 大标题"那种常见样式：这台机器没有字体渲染工具链
   （ImageMagick / Pillow / Chrome 都没有，浏览器截图口也关着），画不出文字。
   与其塞一张写着错字的图，不如把图做成纯品牌视觉 ——
   站点名与卖点由 og:title / og:description 负责，平台会把它们渲染在图的旁边。 */
function drawShare() {
  const W = 1200, H = 630;
  const rgba = Buffer.alloc(W * H * 4);

  const iconSize = 380;
  const iconX = (W - iconSize) / 2;
  const iconY = 96;
  const rects = strokesGong(iconSize, iconX, iconY);

  const barW = 420, barH = 12;
  const barX = (W - barW) / 2, barY = 528;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let c = PAPER, a = 255;

      if (inRoundRect(x + 0.5, y + 0.5, iconX, iconY, iconSize, 0.22)) {
        c = inRects(rects, x + 0.5, y + 0.5, iconX, iconY) ? WHITE : BRAND;
      } else if (x >= barX && x <= barX + barW && y >= barY && y <= barY + barH) {
        c = BRAND;   // 呼应「工」的横画，也是一条视觉落点
      }

      rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = a;
    }
  }
  return encodePng(W, H, rgba);
}

/* ── 输出 ─────────────────────────────────────────────────────────────── */
const write = (rel, buf) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  console.log(`  ✓ ${rel}  (${buf.length} 字节)`);
};

for (const [size, rel] of [
  [192, "assets/icon-192.png"],
  [512, "assets/icon-512.png"],
  [180, "assets/apple-touch-icon.png"],   // iOS 加到主屏用
]) {
  write(rel, drawIcon(size));
}

const share = drawShare();
for (const lang of ["en", "zh", "ja"]) {
  write(`assets/og-${lang}.png`, share);   // 三语共用同一张（纯品牌视觉，无文字）
}

console.log("生成完成 —— 蓝底白「工」，无渐变（符合站内简约规则）");
console.log("⚠️ 接着跑：node src/inject-png-meta.mjs （补回图片元数据）");
