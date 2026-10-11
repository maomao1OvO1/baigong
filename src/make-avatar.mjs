/* ============================================================================
   文件：src/make-avatar.mjs —— 生成邮箱头像（Gravatar / 邮箱服务上传用）
   干什么：产出「蓝底圆角 + 白色 T」为主体、右下角带浅色小字标记（hi / ad）的方形头像。
   为什么要标记（毛毛 2026-10-12 的要求）：
     · 站上两个邮箱分工不同 —— hi@ 收用户反馈、ad@ 接广告投放；
     · 头像主体保持同一个 T（和站点品牌一致，别一个 M 一个 T 让人误会），
       只在右下角用**浅色小字**区分，一眼能分开、又不抢主体。
   设计原则（「头像」和「图标」不是一回事）：
     · 主体居中且留足安全边距（客户端大多会裁成圆形）；
     · 主笔画够粗 —— 缩到 32px 还能认出是 T；
     · 不用渐变与细线（小尺寸下只会糊成一团）；
     · 右下角的标记天生只在中大尺寸看得清，这没问题：它的作用是"放大时能分辨"，
       不是"缩到 16px 也要读出来"。
   零依赖：手写 PNG 编码（IHDR/IDAT/IEND + CRC32），不为几张图去装 canvas / sharp。
   用法：node src/make-avatar.mjs
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* ── PNG 编码 ─────────────────────────────────────────────────────────── */
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
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ── 几何工具：点到线段的距离（画粗笔画用，比逐行填矩形平滑）───────────── */
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/* ── 小写字母笔画表（坐标都在单位方格 [0,1]² 内）─────────────────────────
   为什么自己定义而不是用字体：零依赖原则，且只需要 h/i/a/d 四个字母。
   形状由「线段 + 圆环 + 实心点」组成，判断像素到它们的距离即可。 */
const GLYPHS = {
  h: { w: 0.17, segs: [[0.14, 0.06, 0.14, 1.0], [0.14, 0.52, 0.5, 0.40], [0.5, 0.40, 0.86, 0.50], [0.86, 0.50, 0.86, 1.0]] },
  i: { w: 0.20, segs: [[0.5, 0.36, 0.5, 1.0]], dots: [[0.5, 0.12, 0.11]] },
  a: { w: 0.18, segs: [[0.76, 0.40, 0.76, 1.0]], circles: [[0.46, 0.70, 0.30]] },
  d: { w: 0.18, segs: [[0.74, 0.04, 0.74, 1.0]], circles: [[0.44, 0.70, 0.30]] },
};
function glyphHit(glyph, u, v) {
  const half = glyph.w / 2;
  for (const [x1, y1, x2, y2] of glyph.segs || []) if (distToSeg(u, v, x1, y1, x2, y2) <= half) return true;
  for (const [x, y, r] of glyph.circles || []) if (Math.abs(Math.hypot(u - x, v - y) - r) <= half) return true;
  for (const [x, y, r] of glyph.dots || []) if (Math.hypot(u - x, v - y) <= r) return true;
  return false;
}

/* ── 画头像 ───────────────────────────────────────────────────────────── */
function drawAvatar(size, { bg, fg, mark, round }) {
  const rgba = Buffer.alloc(size * size * 4);
  const S = (v) => v * size;
  const stroke = S(0.085);                      // T 的主笔画粗细
  const corners = S(0.22);                      // 方形版的圆角半径
  const inSquare = (x, y) => {
    if (round) return true;                     // 圆形版由下面的圆形遮罩负责
    const cx = Math.min(Math.max(x, corners), size - corners);
    const cy = Math.min(Math.max(y, corners), size - corners);
    return Math.hypot(x - cx, y - cy) <= corners;
  };
  /* 右下角标记：每个字母一个**正方形格子**（保持比例、不变形），多个字母横向并排。
     位置往内收，免得被圆形裁切切掉。
     ⚠️ 踩过一次：GLYPHS 的键是单字母，一开始直接拿 "hi" 去查 —— 查不到、标记干脆没画，
     两个文件字节数一模一样才发现（所以下面按字母拆开取）。 */
  const CELL = 0.15;                                    // 单个字母格子的边长（相对整图）
  const glyphs = String(mark || "").split("").map((c) => GLYPHS[c]).filter(Boolean);
  const mkW = CELL * glyphs.length;
  // 往右下角放，和 T 之间留出空隙（T 收到 y=0.60，标记从 0.645 起）
  const MK = { x0: 0.88 - mkW, y0: 0.645, w: mkW, h: CELL };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const px = x + 0.5, py = y + 0.5;

      if (round) {
        const d = Math.hypot(px - size / 2, py - size / 2);
        if (d > size / 2 - size * 0.01) { rgba[i + 3] = 0; continue; }
      } else if (!inSquare(px, py)) {
        rgba[i + 3] = 0;
        continue;
      }

      // 主体：白色 T（横杠 + 竖杠）
      const onT =
        (py >= S(0.245) && py <= S(0.245) + stroke && px >= S(0.21) && px <= S(0.79)) ||
        (px >= S(0.4575) && px <= S(0.5425) && py >= S(0.245) && py <= S(0.60));

      // 右下角标记：浅色小字（半透明白 —— "浅"是为了不跟主体抢注意力）
      let onMark = false;
      if (glyphs.length) {
        const u0 = (px - S(MK.x0)) / S(MK.w);
        const v = (py - S(MK.y0)) / S(MK.h);
        if (u0 >= 0 && u0 <= 1 && v >= 0 && v <= 1) {
          const k = Math.min(glyphs.length - 1, Math.floor(u0 * glyphs.length));
          onMark = glyphHit(glyphs[k], u0 * glyphs.length - k, v);
        }
      }

      if (onMark) {
        rgba[i] = 255; rgba[i + 1] = 255; rgba[i + 2] = 255; rgba[i + 3] = 150;   // 浅：透明度 59%
      } else if (onT) {
        rgba[i] = fg[0]; rgba[i + 1] = fg[1]; rgba[i + 2] = fg[2]; rgba[i + 3] = 255;
      } else {
        rgba[i] = bg[0]; rgba[i + 1] = bg[1]; rgba[i + 2] = bg[2]; rgba[i + 3] = 255;
      }
    }
  }
  return encodePng(size, rgba);
}

const BLUE = [0x25, 0x63, 0xeb];
const WHITE = [0xff, 0xff, 0xff];

const OUT = "tmp-avatars";
fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });

/* 只做 T 主体（毛毛：「我的网站是 T，发邮件是 M，这不让人误会吗？用 t 就好」） */
const variants = [
  ["avatar-hi.png", { bg: BLUE, fg: WHITE, mark: "hi", round: true }, "蓝底白 T + 右下角浅色 <hi>（用户反馈用）"],
  ["avatar-ad.png", { bg: BLUE, fg: WHITE, mark: "ad", round: true }, "蓝底白 T + 右下角浅色 <ad>（广告投放用）"],
  ["avatar-hi-square.png", { bg: BLUE, fg: WHITE, mark: "hi", round: false }, "方形版（有些服务不裁圆）"],
  ["avatar-ad-square.png", { bg: BLUE, fg: WHITE, mark: "ad", round: false }, "方形版（有些服务不裁圆）"],
];

for (const [file, opt, desc] of variants) {
  const png = drawAvatar(512, opt);
  fs.writeFileSync(path.join(ROOT, OUT, file), png);
  console.log(`  ✓ ${file}  (512×512, ${png.length} 字节)  ${desc}`);
}
console.log("头像生成完成 —— 主体统一为 T，右下角浅色小字区分 hi / ad");
