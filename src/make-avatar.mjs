/* ============================================================================
   文件：src/make-avatar.mjs —— 生成邮箱头像（Gravatar / 邮箱服务上传用）
   为什么自己画：邮箱头像最终要上传到 Gravatar 之类的服务，我们只需要几张
     尺寸规整、圆形裁切后依然好看的方形 PNG。为了几张图去装 canvas / sharp
     不值得（手机上一个依赖包就是几十 MB），PNG 本来就能手写：
     文件头 + IHDR + IDAT（zlib 压缩的扫描线）+ IEND。
   设计考虑（这几点是「头像」和「图标」的区别）：
     · 头像在客户端里常被**裁成圆形** ⇒ 主体必须居中、四周留足安全边距；
     · 显示尺寸常常只有 32~48px ⇒ 只用一个字母、笔画够粗，缩小后还能认出来；
     · 不做渐变、不做细线 —— 缩到 32px 时它们会糊成一团。
   用法：node src/make-avatar.mjs  → 写到 _deliver/ 下供交付
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

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
  ihdr[8] = 8; ihdr[9] = 6;      // 8 位深、RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;                       // 每行一个 filter 字节（0 = 不过滤）
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 点到线段的距离 —— 用来画粗斜线（M 的两撇），比逐行填矩形平滑得多 */
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx, qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
}

/** 画一版头像：底 + 一个字母（T 或 M）；round = true 时切成圆形（Gravatar 会自己裁圆，这里只做预览友好） */
function drawAvatar(size, { bg, fg, letter, round }) {
  const rgba = Buffer.alloc(size * size * 4);
  const S = (v) => v * size;                    // 比例 → 像素
  const cx = size / 2;
  const stroke = S(0.085);                      // 笔画粗细：够粗才能在 32px 下看清

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const px = x + 0.5, py = y + 0.5;
      // 圆形遮罩（留 1% 余量，避免边缘毛刺）
      if (round) {
        const d = Math.hypot(px - cx, py - cx);
        if (d > size / 2 - size * 0.01) { rgba[i + 3] = 0; continue; }
      }
      let on = false;
      if (letter === "T") {
        // 横杠 + 竖杠
        on = (py >= S(0.30) && py <= S(0.30) + stroke && px >= S(0.24) && px <= S(0.76)) ||
             (px >= S(0.4575) && px <= S(0.5425) && py >= S(0.30) && py <= S(0.70));
      } else if (letter === "M") {
        // 左右两竖 + 中间两撇（用点到线段距离画，粗细一致）
        on = (px >= S(0.24) && px <= S(0.24) + stroke && py >= S(0.30) && py <= S(0.70)) ||
             (px >= S(0.76) - stroke && px <= S(0.76) && py >= S(0.30) && py <= S(0.70)) ||
             distToSeg(px, py, S(0.24 + 0.0425), S(0.30), S(0.5), S(0.62)) <= stroke / 2 ||
             distToSeg(px, py, S(0.76 - 0.0425), S(0.30), S(0.5), S(0.62)) <= stroke / 2;
      }
      const c = on ? fg : bg;
      rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255;
    }
  }
  return encodePng(size, rgba);
}

const BLUE = [0x25, 0x63, 0xeb];
const DARK = [0x17, 0x18, 0x1c];
const WHITE = [0xff, 0xff, 0xff];

const OUT = "tmp-avatars";
fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });

const variants = [
  ["avatar-1-blue-M.png",    { bg: BLUE, fg: WHITE, letter: "M", round: true },  "蓝底 + 白 M（maomaowang 首字母，个人识别度最高）"],
  ["avatar-2-blue-T.png",    { bg: BLUE, fg: WHITE, letter: "T", round: true },  "蓝底 + 白 T（与 ToolPocket 图标同一套视觉）"],
  ["avatar-3-dark-T.png",    { bg: DARK, fg: WHITE, letter: "T", round: true },  "深灰底 + 白 T（更沉稳，护眼）"],
  ["avatar-4-blue-M-square.png", { bg: BLUE, fg: WHITE, letter: "M", round: false }, "蓝底 + 白 M（方形版 · 有些服务不裁圆）"],
];

for (const [file, opt, desc] of variants) {
  const png = drawAvatar(512, opt);
  fs.writeFileSync(path.join(ROOT, OUT, file), png);
  console.log(`  ✓ ${file}  (512×512, ${png.length} 字节)  ${desc}`);
}
console.log("头像生成完成 —— 主体居中、笔画加粗，缩到 32px 仍可辨认");
