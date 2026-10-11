/* ============================================================================
   文件：test/check.mjs —— 上传前的自动检查（小鲸 · 2026-10-11）
   为什么要有它：毛毛的原话「你能不能检查完之后再上传啊」——因为上一版出现过
     ① 单位换算的重量/数据两类算出 NaN（脚本写死 units["m"]，可表里没有 m）
     ② 页面根本没生成 #output，脚本往空元素写值直接报错
   这两类问题「语法检查」和「访问返回 200」都发现不了，必须靠契约检查 + 算法单测。
   跑法：cd toolbox && node test/check.mjs        （失败时退出码为 1，可直接用于门禁）
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TOOLS = JSON.parse(fs.readFileSync(path.join(ROOT, "src/tools.json"), "utf8")).tools;
const GLOBAL_UI = JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/ui.json"), "utf8"));
const LANGS = ["en", "zh", "ja"];

let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log("  ✅ " + name); };
const bad = (name, detail) => { fail++; console.log("  ❌ " + name + (detail ? "\n       → " + detail : "")); };

/* ── ① DOM 契约：脚本要的 id，页面里必须都有 ──────────────────────────── */
console.log("\n① DOM 契约检查（脚本 $(\"id\") ↔ 页面 id）");
for (const tool of TOOLS) {
  const script = fs.readFileSync(path.join(ROOT, "assets/tools", tool.script), "utf8");
  const needed = new Set([...script.matchAll(/\$\("([\w-]+)"\)/g)].map((m) => m[1]));
  // 临时元素（不在模板里，脚本自己创建的）不算契约
  ["input2", "output2"].forEach((x) => needed.delete(x));
  const page = fs.readFileSync(path.join(ROOT, "tools", tool.id + ".html"), "utf8");
  const present = new Set([...page.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
  const missing = [...needed].filter((id) => !present.has(id));
  if (missing.length) bad(`${tool.id}：页面缺少 ${missing.join(", ")}`, "脚本会拿到 null 并抛错");
  else ok(`${tool.id}：${needed.size} 个必需 id 全部存在`);
}

/* ── ② 文案契约：脚本引用的 T.xxx 必须在三语文案里都有 ────────────────── */
console.log("\n② 文案契约检查（脚本 T.xxx ↔ 三语文案键）");
for (const tool of TOOLS) {
  const script = fs.readFileSync(path.join(ROOT, "assets/tools", tool.script), "utf8");
  const keys = new Set([...script.matchAll(/T\.([A-Za-z_]\w*)/g)].map((m) => m[1]));
  const i18n = JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/tools", tool.i18n + ".json"), "utf8"));
  for (const lang of LANGS) {
    // 能用的文案 = 全局 UI（按语言拍平）+ 该工具自己的 ui
    const flatGlobal = Object.fromEntries(
      Object.entries(GLOBAL_UI)
        .filter(([, v]) => v && typeof v === "object" && !Array.isArray(v))
        .map(([k, v]) => [k, v[lang]])
    );
    const ui = Object.assign({}, flatGlobal, i18n[lang].ui || {});
    const missing = [...keys].filter((k) => !(k in ui));
    if (missing.length) bad(`${tool.id} [${lang}] 缺文案键: ${missing.join(", ")}`, "界面上会显示 undefined / [object Object]");
  }
  const noMissing = LANGS.every((l) => {
    const flatGlobal = Object.fromEntries(
      Object.entries(GLOBAL_UI)
        .filter(([, v]) => v && typeof v === "object" && !Array.isArray(v))
        .map(([k, v]) => [k, v[l]])
    );
    const ui = Object.assign({}, flatGlobal, i18n[l].ui || {});
    return [...keys].every((k) => k in ui);
  });
  if (noMissing) ok(`${tool.id}：${keys.size} 个文案键三语齐全`);
}

/* ── ③ 算法单测：把关键逻辑抄成纯函数跑一遍（不依赖浏览器） ────────────── */
console.log("\n③ 算法单测");
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// 单位换算：长度 / 重量 / 数据 / 温度
const tables = {
  length: { base: "m", units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 } },
  weight: { base: "kg", units: { mg: 1e-6, g: 0.001, kg: 1, t: 1000, oz: 0.028349523125, lb: 0.45359237 } },
  data: { base: "MB", units: { B: 1e-6, KB: 0.001, MB: 1, GB: 1000, TB: 1e6 } },
};
const conv = (v, cat, unit) => v * tables[cat].units[tables[cat].base] / tables[cat].units[unit];
[
  [100, "length", "cm", 10000], [1, "length", "in", 39.3700787], [100, "weight", "lb", 220.462262],
  [100, "data", "GB", 0.1], [1, "data", "KB", 1000], [2000, "weight", "t", 2],
].forEach(([v, cat, unit, want]) => {
  const got = conv(v, cat, unit);
  if (near(got, want, 1e-6)) ok(`换算 ${v} ${tables[cat].base}(${cat}) = ${got.toFixed(4)} ${unit}`);
  else bad(`换算 ${v} ${tables[cat].base}(${cat}) → ${unit}，得到 ${got}，应为 ${want}`);
});
const cToF = (c) => c * 9 / 5 + 32, cToK = (c) => c + 273.15;
if (near(cToF(100), 212)) ok("温度 100°C = 212°F"); else bad("温度换算 °C→°F");
if (near(cToK(0), 273.15)) ok("温度 0°C = 273.15K"); else bad("温度换算 °C→K");

// Base64：UTF-8 往返（中文/日文/emoji）
const b64encode = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const b64decode = (s) => {
  const bin = atob(s.replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
};
["hello", "中文测试", "日本語のテスト", "emoji 🐋🐳", "mixed 中文 (abc) ✔"].forEach((s) => {
  const rt = b64decode(b64encode(s));
  if (rt === s) ok(`Base64 往返：${s.slice(0, 14)}`);
  else bad(`Base64 往返失败：${s} → ${rt}`);
});

// 颜色：HEX ↔ RGB ↔ HSL
const hexToRgb = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h);
  return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
};
const rgbToHsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
};
const rgb1 = hexToRgb("#2f6df6");
if (rgb1.r === 47 && rgb1.g === 109 && rgb1.b === 246) ok("#2f6df6 → rgb(47,109,246)"); else bad("HEX→RGB 出错 " + JSON.stringify(rgb1));
const hsl1 = rgbToHsl(255, 0, 0);
if (hsl1.h === 0 && hsl1.s === 100 && hsl1.l === 50) ok("rgb(255,0,0) → hsl(0,100%,50%)"); else bad("RGB→HSL 出错 " + JSON.stringify(hsl1));

// 文本工具：去重 / 排序 / 计数
const dedup = (t) => { const seen = new Set(), out = []; t.split("\n").forEach((l) => { const k = l.trim(); if (k && !seen.has(k)) { seen.add(k); out.push(k); } }); return out.join("\n"); };
const sortLines = (t) => t.split("\n").filter((l) => l.trim()).sort((a, b) => a.localeCompare(b)).join("\n");
if (dedup("b\na\nb\nc") === "b\na\nc") ok("去重：b/a/b/c → b/a/c"); else bad("去重逻辑");
if (sortLines("c\na\nb") === "a\nb\nc") ok("排序：c/a/b → a/b/c"); else bad("排序逻辑");

/* ── ④ 站内引用：每个 HTML 引用的本地资源都要存在 ──────────────────────── */
console.log("\n④ 站内引用检查");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? (e.name === "src" ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]);
const htmls = walk(ROOT).filter((f) => f.endsWith(".html"));
let broken = 0;
for (const f of htmls) {
  const text = fs.readFileSync(f, "utf8");
  for (const m of text.matchAll(/(?:href|src)="(\/[^"]+)"/g)) {
    // 去掉查询串与锚点再判断 —— 否则 /index.html#search 这种会被当成不存在的文件（测过一次假红）
    const 路径 = m[1].split("#")[0].split("?")[0];
    if (!路径 || 路径 === "/") continue;
    if (!fs.existsSync(path.join(ROOT, 路径.slice(1)))) { broken++; bad(`${path.relative(ROOT, f)} → ${m[1]}`); }
  }
}
if (!broken) ok(`${htmls.length} 个 HTML 的本地资源引用全部有效`);

console.log(`\n结果：${pass} 项通过，${fail} 项失败`);
process.exit(fail ? 1 : 0);
