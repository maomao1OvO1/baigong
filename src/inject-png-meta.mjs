/* ============================================================================
   文件：src/inject-png-meta.mjs —— 往 PNG 里注入元数据（作者 / 来源）
   为什么用这条路径：图片的元数据（tEXt 块）**在浏览器里完全不可见** ——
     看图看不出来、右键保存也不影响，只有专门去读文件结构或元数据工具才看得到。
     对"留把柄"这件事来说，这是比注释更安静的一层：删注释的人往往会漏掉图片。
   实现：PNG = 签名 + 一串 chunk（长度 + 类型 + 数据 + CRC32）+ IEND。
     在 IEND 之前插一个 tEXt 块（keyword\0text）即可，显示不受影响。
   注意：插入后必须重算 CRC，否则图片直接损坏（有些工具看图会失败）。
   用法：node src/inject-png-meta.mjs <文件...>   不带参数则处理默认清单
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

/** 读 PNG 的所有 chunk，返回 [{type, data}] */
function readChunks(buf) {
  if (buf.slice(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("不是 PNG");
  const out = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.slice(off + 4, off + 8).toString("ascii");
    const data = buf.slice(off + 8, off + 8 + len);
    out.push({ type, data });
    off += 12 + len;
    if (type === "IEND") break;
  }
  return out;
}

function buildPng(chunks) {
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  for (const { type, data } of chunks) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    parts.push(len, body, crc);
  }
  return Buffer.concat(parts);
}

function inject(file) {
  const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
  const buf = fs.readFileSync(abs);
  const chunks = readChunks(buf);
  const text = (k, v) => ({ type: "tEXt", data: Buffer.concat([Buffer.from(k, "latin1"), Buffer.from([0]), Buffer.from(v, "latin1")]) });
  /* iTXt：UTF-8 版本（tEXt 只支持 Latin-1，中文写进去会乱码 —— 踩过一次）。
     结构：keyword \0 压缩标志 \0 压缩方法 \0 语言标签 \0 翻译键 \0 正文(UTF-8) */
  const itext = (k, v) => ({
    type: "iTXt",
    data: Buffer.concat([
      Buffer.from(k, "latin1"), Buffer.from([0, 0, 0, 0, 0]),
      Buffer.from(v, "utf8"),
    ]),
  });

  // 去掉上次注入的（幂等：重复运行不会越插越多）
  const OUR_KEYS = ["Software", "Author", "Copyright", "Comment", "ts2t"];
  const cleaned = chunks.filter((c) => {
    if (c.type !== "tEXt" && c.type !== "iTXt") return true;
    const key = c.data.slice(0, c.data.indexOf(0)).toString("latin1");
    return !OUR_KEYS.includes(key);
  });

  const d = new Date();
  const stamp = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const meta = [
    text("Software", "Baigong"),
    text("Author", "tools.maomaowang.top"),
    // 非标准键 + base64 值：看着像构建信息，实际是"来源 + 日期"的签名
    text("ts2t", Buffer.from(`tools.maomaowang.top::${stamp}`).toString("base64")),
    itext("Comment", "原创作品 · 保留所有权利 · 请勿删除来源信息"),
  ];
  const iend = cleaned.findIndex((c) => c.type === "IEND");
  cleaned.splice(iend, 0, ...meta);

  const out = buildPng(cleaned);
  fs.writeFileSync(abs, out);
  return out.length;
}

const defaults = [
  "assets/icon-192.png", "assets/icon-512.png", "assets/apple-touch-icon.png",
  "assets/og-zh.png", "assets/og-en.png", "assets/og-ja.png",
];
const targets = process.argv.length > 2 ? process.argv.slice(2) : defaults;
for (const f of targets) {
  try {
    const size = inject(f);
    console.log(`  ✓ ${f}  (${size} 字节，已注入 tEXt 元数据)`);
  } catch (e) {
    console.log(`  ✗ ${f}  ${e.message}`);
  }
}
console.log("完成 —— 图片元数据在浏览器里不可见，只有专门读结构才看得到");
