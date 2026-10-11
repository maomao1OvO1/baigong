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

/* ── ⑤ 搜索契约：search.js 依赖的 id 必须在「生成出来的首页」里真实存在 ────────
   为什么单独加这项：2026-10-12 的 bug 就是搜索脚本依赖一个页面上并不存在的 id（外层容器 search），
   脚本第一行就 return ⇒ 输入任何东西都没反应；而当时的运行时测试沙箱里恰好造了那个元素，
   于是测试全绿、真机全瞎。凡是「脚本找 DOM」的依赖，都得拿真实页面核对。 */
console.log("\n⑤ 搜索契约（search.js 的 DOM 依赖 ↔ 三个语言的首页）");
{
  const js = fs.readFileSync(path.join(ROOT, "assets", "search.js"), "utf8");
  const needed = [...new Set([...js.matchAll(/getElementById\("([\w-]+)"\)/g)].map((m) => m[1]))];
  for (const lang of LANGS) {
    const file = lang === "en" ? "index.html" : lang + "/index.html";
    const page = fs.readFileSync(path.join(ROOT, file), "utf8");
    const present = new Set([...page.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
    const missing = needed.filter((id) => !present.has(id));
    if (missing.length) bad(`${file}：搜索脚本要的 id 不存在 → ${missing.join(", ")}`, "脚本会直接 return，输入毫无反应");
    else ok(`${file}：搜索依赖的 ${needed.length} 个 id 都在`);
    if (page.includes("TP_INDEX_URL")) ok(`${file}：注入了索引绝对路径`);
    else bad(`${file}：缺 TP_INDEX_URL 注入`, "在 /zh/ 与 /ja/ 下 fetch 会 404");
  }
}

/* ── ⑥ 移动端自检：viewport + 小屏断点 ─────────────────────────────────────
   毛毛 2026-10-12：「手机端没有适配，只有网页端适配了 UI」。这条检查只保证"该有的都在"，
   真正的观感仍要靠人眼，但少一项就会整站变成"桌面缩小版"。 */
console.log("\n⑥ 移动端自检");
{
  const css = fs.readFileSync(path.join(ROOT, "assets", "style.css"), "utf8");
  if (/@media \(max-width: 560px\)/.test(css)) ok("样式里有手机断点（560px）");
  else bad("样式里没有手机断点", "小屏会变成桌面缩小版");
  if (/min-height: 44px|padding: 6px 8px|padding: 10px 14px/.test(css)) ok("触控目标做了放大（≥44px 量级）");
  else bad("没有触控目标放大规则", "手指点不准");
  if (/h1 \{ font-size: clamp\(/.test(css)) ok("标题字号自适应（clamp）");
  else bad("标题是固定字号", "小屏上会过大");

  let noViewport = 0;
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === "src" ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]);
  const pages = walk(ROOT).filter((f) => f.endsWith(".html"));
  for (const f of pages) {
    if (!/name="viewport"/.test(fs.readFileSync(f, "utf8"))) noViewport++;
  }
  if (!noViewport) ok(`${pages.length} 个页面都有 viewport meta`);
  else bad(`${noViewport} 个页面缺 viewport meta`, "手机上会按桌面宽度渲染");
}

/* ── ⑦ PWA 自检（装成桌面应用的必要条件）──────────────────────────────────
   Chrome 判定「可安装」要同时满足：HTTPS + manifest（name/short_name/start_url/display/icons）
   + 注册了带 fetch 处理器的 service worker + 192 与 512 两种图标。少一样就装不上，
   而浏览器不会给你报错 —— 只是那个安装图标永远不出现。所以这里逐条核对。 */
console.log("\n⑦ PWA 自检（桌面应用安装条件）");
{
  const need = ["manifest.webmanifest", "zh/manifest.webmanifest", "ja/manifest.webmanifest", "sw.js",
                "assets/icon-192.png", "assets/icon-512.png", "assets/apple-touch-icon.png", "assets/app.js"];
  const missing = need.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  if (!missing.length) ok(`${need.length} 个 PWA 文件都在`);
  else bad("缺 PWA 文件：" + missing.join(", "), "少了就装不上桌面应用");

  for (const [dir, want] of [["", "/"], ["zh/", "/zh/"], ["ja/", "/ja/"]]) {
    const mf = path.join(ROOT, dir + "manifest.webmanifest");
    if (!fs.existsSync(mf)) continue;
    const m = JSON.parse(fs.readFileSync(mf, "utf8"));
    const bads = [];
    if (!m.name || !m.short_name) bads.push("缺 name/short_name");
    if (m.start_url !== want) bads.push(`start_url 应为 ${want}，实际 ${m.start_url}`);
    if (m.display !== "standalone") bads.push("display 不是 standalone");
    const sizes = (m.icons || []).map((i) => i.sizes);
    if (!sizes.includes("192x192") || !sizes.includes("512x512")) bads.push("缺 192 或 512 图标");
    if (bads.length) bad("manifest " + (dir || "(根)") + "：" + bads.join(" · "));
    else ok("manifest " + (dir || "(根)") + "：start_url=" + m.start_url + " · 图标齐全");
  }

  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  if (/addEventListener\("fetch"/.test(sw)) ok("service worker 有 fetch 处理器（可安装的硬条件）");
  else bad("sw.js 没有 fetch 处理器", "Chrome 不会认为它可安装");
  if (/addEventListener\("install"/.test(sw) && /addEventListener\("activate"/.test(sw)) ok("service worker 有 install / activate（能预缓存与清旧缓存）");
  else bad("sw.js 缺 install 或 activate");

  const home = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  if (home.includes('rel="manifest"') && home.includes("app.js")) ok("首页引用了 manifest 与 app.js");
  else bad("首页没引用 manifest 或 app.js");
}

/* ── ⑧ 文案注入检查（window.T）──────────────────────────────────────────
   2026-10-12 毛毛截图报「这个你没翻译？」：中文首页搜不到结果时蹦出英文 No tool matches that。
   根因是**首页没给脚本注入文案对象**（工具页有、首页漏了），于是掉进脚本里的英文硬编码兜底。
   这类问题靠肉眼很难发现（只有特定操作才触发），所以按页面逐个核对。 */
console.log("\n⑧ 文案注入检查（window.T）");
{
  const spot = ["index.html", "zh/index.html", "ja/index.html",
                "advertise.html", "zh/advertise.html", "ja/advertise.html",
                "tools/base64.html", "zh/tools/json-format.html", "ja/tools/hash.html"];
  let miss = 0;
  for (const f of spot) {
    if (!fs.readFileSync(path.join(ROOT, f), "utf8").includes("window.T = ")) {
      miss++; bad(`${f}：没有注入 window.T`, "脚本文案会掉回英文硬编码兜底");
    }
  }
  if (!miss) ok(`${spot.length} 个代表性页面都注入了文案对象`);

  const ui = JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/ui.json"), "utf8"));
  const vals = ["en", "zh", "ja"].map((l) => ui.noResults[l]);
  if (new Set(vals).size === 3 && /[\u4e00-\u9fa5]/.test(ui.noResults.zh)) ok("空结果文案三语互不相同，中文确实是中文");
  else bad("空结果文案不对", JSON.stringify(vals));

  const asks = ["en", "zh", "ja"].filter((l) => !ui.noResultsAsk || !ui.noResultsAsk[l]);
  if (!asks.length) ok("空结果引导文案三语齐全（noResultsAsk）");
  else bad("空结果引导文案缺语言：" + asks.join(", "));

  const js = fs.readFileSync(path.join(ROOT, "assets", "search.js"), "utf8");
  if (js.includes("fb-btn") && js.includes("noResultsAsk")) ok("搜索空结果里带了反馈按钮与引导句");
  else bad("搜索空结果没接上反馈入口");

  const home = fs.readFileSync(path.join(ROOT, "zh/index.html"), "utf8");
  if (home.includes('id="feedbackBtn"') && home.includes("data-u=")) ok("页脚有反馈入口（邮箱拆成 data 属性）");
  else bad("页脚缺反馈入口");
  if (!/mailto:[^"]*@/.test(home)) ok("页面源码里没有明文邮箱（防爬虫）");
  else bad("页面里出现了明文邮箱", "会被垃圾邮件爬虫抓走");
}

/* ── ⑨ 404 页检查 ──────────────────────────────────────────────────────
   GitHub Pages 只认**站点根目录**的 404.html，而且 /zh/ 与 /ja/ 下的失效链接也走这一份 ——
   所以三个语言的文案必须内联在一个文件里。它还可能在任何深度被打开（/a/b/c），
   因此凡引用一律绝对路径，相对路径必炸。这几条都属于"错了就很难发现"，逐条核对。 */
console.log("\n⑨ 404 页检查");
{
  const f = path.join(ROOT, "404.html");
  if (fs.existsSync(f)) ok("404.html 在站点根目录（GitHub Pages 只认这个位置）");
  else bad("缺 404.html", "访问不存在的地址会看到 GitHub 的默认 404");

  const html = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
  const langs = ["en", "zh", "ja"].filter((l) => html.includes('data-lang="' + l + '"'));
  if (langs.length === 3) ok("三语文案内联在同一个文件里（按路径前缀 → 浏览器语言挑一份显示）");
  else bad("404 页缺语言块", langs.join(", "));

  const rel = [...html.matchAll(/(?<!data-)(?:href|src)="(?!\/|#|http|mailto)([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
  if (!rel.length) ok("链接与资源全部使用绝对路径");
  else bad("404 页存在相对路径引用", rel.join(", "));

  if (html.includes("noindex")) ok("标了 noindex（不让搜索引擎把 404 页收进去）");
  else bad("404 页缺 noindex");

  if (html.includes('id="searchInput"') && html.includes('id="feedbackBtn"')) ok("带搜索框与反馈入口（迷路的人先给条路）");
  else bad("404 页缺搜索框或反馈入口");
}

/* ── ⑩ 内联脚本语法检查 ───────────────────────────────────────────────
   2026-10-12 的教训（毛毛截图报「这啥」）：404 页内联脚本里，模板字符串中的 \/ 被解析成 /，
   于是生成出 `/^/zh(/|$)/` 这种语法错误的正则 —— 浏览器里**整段脚本不执行**：
   语言块全部保持隐藏、文案节点全空、页脚全是 undefined。
   更坑的是：前面那些"结构性检查"（有没有三语块、有没有相对路径、有没有 noindex）**全都通过**。
   所以必须真的把脚本解析一遍。 */
console.log("\n⑩ 内联脚本语法检查");
{
  const files = ["404.html", "index.html", "zh/index.html", "ja/index.html",
                 "advertise.html", "zh/advertise.html", "tools/base64.html"];
  let n = 0, bads = 0;
  for (const f of files) {
    const html = fs.readFileSync(path.join(ROOT, f), "utf8");
    const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((c) => c.trim());
    for (const code of blocks) {
      n++;
      try { new Function(code); }
      catch (e) { bads++; bad(`${f} 的内联脚本语法错误：${e.message.slice(0, 70)}`, "浏览器里整段不执行 —— 页面文字会消失/文案变 undefined"); }
    }
  }
  if (!bads) ok(`${files.length} 个页面的 ${n} 段内联脚本语法都正确`);

  const nf = fs.readFileSync(path.join(ROOT, "404.html"), "utf8");
  if (!nf.includes("undefined")) ok("404 页没有 undefined 字面量");
  else bad("404 页出现 undefined 字面量", nf.slice(Math.max(0, nf.indexOf("undefined") - 60), nf.indexOf("undefined") + 20).replace(/\s+/g, " "));
}

/* ── ⑪ 页脚语言一致性 ─────────────────────────────────────────────────
   2026-10-12 毛毛截图报「没翻译完全」：404 页的页脚写死了英文（footer(LANGS[0])），
   中文读者会看到一整段英文页脚。这类"漏翻一处"逐页肉眼很难发现，
   所以按语言特征抽查：中文页脚必须有汉字、日文页脚必须有假名、英文页脚不该混进这两种。 */
console.log("\n⑪ 页脚语言一致性");
{
  const cases = [["index.html", "en"], ["zh/index.html", "zh"], ["ja/index.html", "ja"],
                 ["zh/advertise.html", "zh"], ["zh/tools/base64.html", "zh"], ["ja/tools/hash.html", "ja"]];
  let bads = 0;
  for (const [f, lang] of cases) {
    const html = fs.readFileSync(path.join(ROOT, f), "utf8");
    const m = /<footer>([\s\S]*?)<\/footer>/.exec(html);
    const text = m ? m[1] : "";
    const looksRight = lang === "en"
      ? !/[\u4e00-\u9fa5\u3040-\u30ff]/.test(text)
      : lang === "zh"
        ? /[\u4e00-\u9fa5]/.test(text)
        : /[\u3040-\u30ff]/.test(text);
    if (looksRight) ok(`${f}：页脚语言与页面一致（${lang}）`);
    else { bads++; bad(`${f}：页脚语言不对（页面是 ${lang}）`, text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 70)); }
  }
  const nf = fs.readFileSync(path.join(ROOT, "404.html"), "utf8");
  if (nf.includes("var FOOT = ") && nf.includes('id="nfFootText"')) ok("404 页：页脚由脚本按语言填（三语数据齐全）");
  else bad("404 页页脚写死了单一语言", "中文读者会看到英文页脚");
}

/* ── ⑫ 反馈口吻：首页可以说"缺工具"，工具页不许 ────────────────────────
   毛毛原话（2026-10-12）：「主页写缺工具那个可以，但是你进入工具了，你还嫌缺工具就不行了」。
   逻辑上也对：用户都已经在用某个工具了，页脚还问他"想不想要别的工具"，等于在拆自己台。 */
console.log("\n⑫ 反馈口吻（首页 vs 工具页）");
{
  const cases = [
    ["index.html", true, "want a tool"],
    ["zh/index.html", true, "还没有的工具"],
    ["ja/index.html", true, "ご要望"],
    ["zh/tools/base64.html", false, "还没有的工具"],
    ["ja/tools/hash.html", false, "ご要望"],
    ["zh/advertise.html", false, "还没有的工具"],
  ];
  for (const [f, shouldHave, marker] of cases) {
    const html = fs.readFileSync(path.join(ROOT, f), "utf8");
    const m = /<p class="fb">([\s\S]*?)<\/p>/.exec(html);
    const text = m ? m[1] : "";
    if (text.includes(marker) === shouldHave) {
      ok(`${f}：反馈口吻正确（${shouldHave ? "允许提" : "不提"}「${marker}」）`);
    } else {
      bad(`${f}：反馈口吻不对`, shouldHave ? `首页应提到「${marker}」` : `工具页/招租页不该提「${marker}」—— 用户都已经在用了`);
    }
  }
  const t = fs.readFileSync(path.join(ROOT, "zh/tools/base64.html"), "utf8");
  if (/发现 bug/.test(t)) ok("工具页的反馈文案聚焦在 bug 上");
  else bad("工具页反馈文案没提 bug");

  const nf = fs.readFileSync(path.join(ROOT, "404.html"), "utf8");
  if (nf.includes("ask") && nf.includes("还没有的工具")) ok("404 页与首页同口吻（还没进工具，可以说缺）");
  else bad("404 页反馈口吻不对");
}

/* ── ⑬ 搜索空结果的口吻：提需求，不是报 bug ─────────────────────────────
   毛毛原话（2026-10-12）：「这里就是反馈 bug，应该是增加功能才对吧」。
   搜不到 = 站里还没有这东西 ⇒ 该让用户提需求；"反馈 bug" 是工具用出问题时说的。
   三种场景三套话：首页/404（邀请，可为 bug 或新工具）· 工具页（服务中，只谈 bug）· 空结果（缺东西，谈需求）。 */
console.log("\n⑬ 搜索空结果的口吻");
{
  const ui = JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/ui.json"), "utf8"));
  const want = { en: /request/i, zh: /需求/, ja: /リクエスト/ };
  for (const l of ["en", "zh", "ja"]) {
    const btn = (ui.noResultsBtn || {})[l] || "";
    if (want[l].test(btn) && !/bug|不具合|问题反馈/i.test(btn)) ok(`空结果按钮（${l}）：「${btn}」`);
    else bad(`空结果按钮口吻不对（${l}）`, `实际「${btn}」—— 应该表达"要一个还没有的工具"`);
    const subj = (ui.noResultsSubject || {})[l] || "";
    if (subj && !/bug report|不具合の報告/i.test(subj)) ok(`空结果邮件主题（${l}）：「${subj}」`);
    else bad(`空结果邮件主题不对（${l}）`, subj);
  }
  const js = fs.readFileSync(path.join(ROOT, "assets", "search.js"), "utf8");
  if (js.includes("noResultsBtn") && !/feedbackButton \|\|/.test(js)) ok("搜索空结果用的是「提需求」按钮，没有回退到「反馈 bug」");
  else bad("搜索空结果仍在用 feedbackButton");
  const app = fs.readFileSync(path.join(ROOT, "assets", "app.js"), "utf8");
  if (app.includes("data-subject")) ok("反馈按钮支持自带邮件主题（需求与 bug 分开）");
  else bad("app.js 没读 data-subject");
}

/* ── ⑭ 邮箱分流：反馈 → hi@，招租 → ad@ ────────────────────────────────
   毛毛 2026-10-12：「不是一个 hi 一个 ad 吗？搞吧」。
   为什么要分：用户看到 ad（advertisement＝广告）会以为"这不是收反馈的"；
   而广告主的询价涉及钱、要尽快回，跟用户反馈混在一个箱子里容易互相淹没。
   这条检查盯两件事：反馈入口全站都指向 hi@；招租那条线不许被误改。 */
console.log("\n⑭ 邮箱分流（反馈 hi@ · 招租 ad@）");
{
  const ui = JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/ui.json"), "utf8"));
  if (ui.feedbackUser === "hi" && ui.feedbackDomain === "maomaowang.top") ok(`反馈邮箱：${ui.feedbackUser}@${ui.feedbackDomain}`);
  else bad("反馈邮箱不对", `实际 ${ui.feedbackUser}@${ui.feedbackDomain}，应为 hi@maomaowang.top`);

  const adv = JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/advertise.json"), "utf8"));
  const wrongAdv = ["en", "zh", "ja"].filter((l) => adv[l].contactUser !== "ad");
  if (!wrongAdv.length) ok("招租页三语仍是 ad@（广告主专用，不跟着改）");
  else bad("招租页邮箱被误改：" + wrongAdv.join(", "), "广告主会发错邮箱");

  for (const f of ["index.html", "zh/index.html", "ja/index.html", "zh/tools/base64.html", "ja/tools/hash.html", "404.html"]) {
    const html = fs.readFileSync(path.join(ROOT, f), "utf8");
    if (html.includes('data-u="hi"')) ok(`${f}：反馈入口指向 hi@`);
    else bad(`${f}：反馈入口不是 hi@`, "用户来信会发错地方");
  }
  /* 招租页上**两种邮箱都对**才算过：正文里的投放联系方式＝ad@（广告主），
     页脚那个反馈入口＝hi@（用户来信）。第一版断言写窄了，以为招租页只能有 ad —— 
     其实它两处都有，这才是分流生效的样子。 */
  const advHtml = fs.readFileSync(path.join(ROOT, "zh/advertise.html"), "utf8");
  if (advHtml.includes('data-u="ad"') && advHtml.includes('data-u="hi"')) ok("招租页两种邮箱各就各位（投放联系 ad@ / 页脚反馈 hi@）");
  else bad("招租页邮箱不对", "投放联系应是 ad@，页脚反馈应是 hi@ —— 两处都该在");
}

/* ── ⑮ 社交分享图 ─────────────────────────────────────────────────────
   分享到微信/QQ 时，卡片有没有缩略图全看 og:image 这几行；尺寸不对（比如声明 1200×630
   实际却是别的）会让部分客户端直接不显示。这两点肉眼在浏览器里都看不出来，
   只有真去分享一次才发现，所以按文件核对。 */
console.log("\n⑮ 社交分享图（og:image）");
{
  const sizes = { zh: null, en: null, ja: null };
  for (const l of ["zh", "en", "ja"]) {
    const f = path.join(ROOT, "assets", "og-" + l + ".png");
    if (!fs.existsSync(f)) { bad(`缺分享图 assets/og-${l}.png`); continue; }
    const buf = fs.readFileSync(f);
    // PNG 的宽高在 IHDR 里（偏移 16 起的两个大端 32 位）
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    sizes[l] = w + "x" + h;
    if (w === 1200 && h === 630) ok(`og-${l}.png：1200×630（通用社交卡片尺寸）`);
    else bad(`og-${l}.png 尺寸不对`, `${w}×${h}，应为 1200×630`);
  }
  for (const [file, lang] of [["index.html", "en"], ["zh/index.html", "zh"], ["ja/index.html", "ja"]]) {
    const html = fs.readFileSync(path.join(ROOT, file), "utf8");
    if (html.includes(`/assets/og-${lang}.png`) && html.includes("og:image")) ok(`${file}：引用了自己语言的分享图`);
    else bad(`${file}：分享图引用不对`, `应指向 og-${lang}.png`);
  }
}

/* ── ⑯ 版权与来源标记 ─────────────────────────────────────────────────
   毛毛 2026-10-12：「让别人能扒不了尽量扒不了，就算扒下去也有风险」。
   静态站拦不住下载，但这三样让"扒走"变成可追溯的侵权：① 页脚显式版权；② 每页来源标记
   （隐藏元素 + 声明式注释）；③ 代码文件头的版权声明。它们都容易被后来人无意删掉，
   所以专门设一条检查盯着 —— 版权这种东西丢了不会报错，但等于白做。 */
console.log("\n⑯ 版权与来源标记");
{
  const pages = ["index.html", "zh/index.html", "ja/index.html", "404.html",
                 "zh/advertise.html", "zh/tools/base64.html"];
  let miss = 0;
  for (const f of pages) {
    const html = fs.readFileSync(path.join(ROOT, f), "utf8");
    const problems = [];
    if (!html.includes("ts2t:maomaowang:")) problems.push("缺来源标记");
    if (!html.includes('name="author"')) problems.push("缺作者元数据");
    if (!/© 2026 ToolPocket/.test(html)) problems.push("缺版权文案");
    if (problems.length) { miss++; bad(`${f}：${problems.join(" · ")}`); }
  }
  if (!miss) ok(`${pages.length} 个代表性页面都有版权 + 作者元数据 + 来源标记`);

  const files = ["assets/app.js", "assets/search.js", "assets/style.css", "assets/tools/hash.js"];
  let nf = 0;
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    if (src.includes("All rights reserved") && src.includes("保留所有权利")) nf++;
    else bad(`${f}：缺文件头版权声明`, "扒走的人删掉它就是故意侵权，但我们得先有");
  }
  if (nf === files.length) ok(`${files.length} 个前端文件头部都有版权声明`);
}

/* ── ⑰ 埋点暗记（11 层，必须每层都能解回明文）───────────────────────────
   毛毛 2026-10-12：「给我代码里埋点屎…别真给我埋屎」→「多加点儿，多藏藏」。
   同一份来源信息用不同编码散落在各处，单看每一处都像正常数据/遗留代码：
     app.js 旧埋点函数(base64) · style.css 打印块(CSS 转义) · style.css 版本变量(hex)
     · 每页 HTML legacy-build-id(hex) · 每页 HTML stats-endpoint(rot13) · 每页 HTML meta x-src(base64)
     · 图片 tEXt 元数据(base64) · manifest x_build(base64) · sitemap 注释(hex)
     · search.json 关键词(hex) · robots.txt 注释(hex)
   为什么检查要"解出来"而不只"字符串在"：编码改错一位、或截断成半截，字符串照样在，
   但解出来是垃圾 —— 那等于白埋。所以逐层解码并比对域名。 */
console.log("\n⑰ 埋点暗记（11 层，逐层解码）");
{
  const dec = {
    b64: (t) => Buffer.from(t, "base64").toString("utf8"),
    hex: (t) => Buffer.from(t, "hex").toString("utf8"),
    rot13: (t) => t.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97)),
    css: (t) => t.trim().split(/\s+/).map((x) => String.fromCharCode(parseInt(x.slice(1), 16))).join(""),
  };
  const check = (label, value) => {
    if (value && value.includes("maomaowang.top")) ok(label + " → " + value.slice(0, 40));
    else bad(label + " 解出来不对", String(value).slice(0, 60));
  };
  const app = fs.readFileSync(path.join(ROOT, "assets", "app.js"), "utf8");
  check("① app.js base64", dec.b64((app.match(/atob\("([A-Za-z0-9+/=]{16,})"\)/) || [])[1] || ""));

  const css = fs.readFileSync(path.join(ROOT, "assets", "style.css"), "utf8");
  check("② style.css CSS转义", dec.css((css.match(/content: "((?:\\[0-9a-f]{1,6} )+)"/) || [])[1] || ""));
  check("③ style.css --tp-rev", dec.hex((css.match(/--tp-rev: "([0-9a-f]+)"/) || [])[1] || ""));

  const home = fs.readFileSync(path.join(ROOT, "zh", "index.html"), "utf8");
  check("④ HTML hex 构建指纹", dec.hex((home.match(/legacy-build-id: ([0-9a-f]{16,})/) || [])[1] || ""));
  check("⑤ HTML rot13", dec.rot13((home.match(/stats-endpoint: ([a-z.]+)/) || [])[1] || ""));
  check("⑥ HTML meta x-src", dec.b64((home.match(/name="x-src" content="([A-Za-z0-9+/=]+)"/) || [])[1] || ""));

  // 图片 tEXt/iTXt 元数据（自己解析 PNG 块）
  let pngHit = "";
  try {
    const png = fs.readFileSync(path.join(ROOT, "assets", "icon-512.png"));
    let off = 8;
    while (off < png.length) {
      const len = png.readUInt32BE(off);
      const type = png.slice(off + 4, off + 8).toString("ascii");
      const data = png.slice(off + 8, off + 8 + len);
      const key = data.slice(0, data.indexOf(0)).toString("latin1");
      if ((type === "tEXt" || type === "iTXt") && key === "ts2t") pngHit = dec.b64(data.slice(data.indexOf(0) + 1).toString("latin1"));
      off += 12 + len;
      if (type === "IEND") break;
    }
  } catch (e) { /* 下面统一报错 */ }
  check("⑦ 图片元数据 ts2t", pngHit);

  try {
    const mf = JSON.parse(fs.readFileSync(path.join(ROOT, "zh", "manifest.webmanifest"), "utf8"));
    check("⑧ manifest x_build", dec.b64(mf.x_build || ""));
  } catch (e) { bad("⑧ manifest 读不了或没有 x_build"); }

  const sm = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  check("⑨ sitemap 注释", dec.hex((sm.match(/build\s+([0-9a-f]{20,})/) || [])[1] || ""));

  try {
    const idx = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "search.json"), "utf8"));
    const item = idx.find((x) => x.id === "hash");
    const key = (item.keys || []).find((k) => /^[0-9a-f]{20,}$/.test(k));
    check("⑩ search.json 关键词", dec.hex(key || ""));
  } catch (e) { bad("⑩ search.json 里找不到编码关键词"); }

  const rb = fs.readFileSync(path.join(ROOT, "robots.txt"), "utf8");
  check("⑪ robots.txt 注释", dec.hex((rb.match(/# build ([0-9a-f]{20,})/) || [])[1] || ""));
}

/* ── ⑱ 三语适配（专业名词保留原文，只本地化动词与地名）──────────────────
   毛毛 2026-10-12：「像专业名词这么写的，你就别翻译了…别都翻译成三国语言很奇怪，
   我之前就遇到过一个傻逼网站，居然音译」。
   所以这里检查的不是「有没有翻」，而是**翻对了没有**：
     · 专业名词（JSON / SQL / Base32 / UUID / camelCase…）必须在三种语言里**原样出现** ——
       翻成「杰森」或「乌利德」是最糟的做法，比不翻还难懂；
     · 界面选项要么走文案键（能本地化），要么是白名单里的专业名词，不允许第三种情况；
     · hreflang / lang 属性、FAQ 条数、术语在三语中的一致性。 */
console.log("\n⑱ 三语适配（专业名词不翻译）");
{
  /* 术语表：t = 英文原形（在任何语言里都该保留），ok = 允许出现的写法（含标准译名）。
     ⚠️ 允许"正则/正規表現"这类**标准译名**，但绝不允许音译（「杰森」「乌利德」那种）——
     毛毛的原话：「别都翻译成三国语言很奇怪…居然音译」。 */
  const TERMS = [
    { t: "JSON", ok: ["JSON"] },
    { t: "JS", ok: ["JS", "JavaScript"] },
    { t: "SQL", ok: ["SQL"] },
    { t: "HTML", ok: ["HTML"] },
    { t: "URL", ok: ["URL"] },
    { t: "regex", ok: ["regex", "正则", "正規表現"] },
    { t: "Base32", ok: ["Base32"] },
    { t: "Base58", ok: ["Base58"] },
    { t: "Base64", ok: ["Base64"] },
    { t: "UTC", ok: ["UTC"] },
    { t: "IPv6", ok: ["IPv6"] },
    { t: "CIDR", ok: ["CIDR"] },
    { t: "JWT", ok: ["JWT"] },
    { t: "UUID", ok: ["UUID"] },
    { t: "ULID", ok: ["ULID"] },
    { t: "NanoID", ok: ["NanoID", "Nano ID"] },
    { t: "MD5", ok: ["MD5"] },
    { t: "SHA", ok: ["SHA"] },
    { t: "YAML", ok: ["YAML"] },
    { t: "K8s", ok: ["K8s", "Kubernetes"] },
    { t: "HTTP", ok: ["HTTP"] },
    { t: "API", ok: ["API", "接口", "インターフェース"] },
    { t: "Markdown", ok: ["Markdown"] },
    { t: "Cron", ok: ["Cron", "cron"] },
    { t: "Luhn", ok: ["Luhn"] },
    { t: "camelCase", ok: ["camelCase"] },
    { t: "PascalCase", ok: ["PascalCase"] },
    { t: "snake_case", ok: ["snake_case"] },
    { t: "kebab-case", ok: ["kebab-case"] },
    // 命名法本身也是行话：写 CONSTANT_CASE / Title Case 是通用写法，翻成中文反而没人认
    { t: "CONSTANT_CASE", ok: ["CONSTANT_CASE"] },
    { t: "dot.case", ok: ["dot.case"] },
    { t: "Title Case", ok: ["Title Case"] },
    { t: "SCREAMING-KEBAB", ok: ["SCREAMING-KEBAB"] },
    { t: "CSV", ok: ["CSV"] },
    { t: "PNG", ok: ["PNG"] },
    { t: "JPEG", ok: ["JPEG", "JPG"] },
    { t: "WebP", ok: ["WebP"] },
    { t: "HEIC", ok: ["HEIC"] },
    { t: "Nginx", ok: ["Nginx"] },
    { t: "TOTP", ok: ["TOTP"] },
  ];
  const I18N = (tid) => JSON.parse(fs.readFileSync(path.join(ROOT, "src", "i18n", "tools", tid + ".json"), "utf8"));

  // ① 界面选项：必须要么是文案键，要么是白名单里的专业名词
  const tools = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "tools.json"), "utf8")).tools;
  let rawOk = 0, rawBad = [];
  for (const t of tools) {
    const ui = I18N(t.i18n).zh.ui || {};
    for (const o of t.options || []) {
      if (o.type !== "select") continue;
      for (const [v, k] of o.choices || []) {
        if (k in ui) continue;                                   // 走了翻译，好
        // 术语可能带后缀（SHA-1、UUID v4、Base32hex），所以用"以术语开头"来判断
        if (TERMS.some((x) => k === x.t || k.startsWith(x.t)) || /^[\d.,;\s+]+$/.test(k)) { rawOk++; continue; }
        rawBad.push(t.id + " / " + o.id + " → " + k);
      }
    }
  }
  if (!rawBad.length) ok(`${rawOk} 个未翻译的选项全是专业名词或纯符号（这是对的）`);
  else bad("有选项既没翻译、也不是专业名词", rawBad.slice(0, 5).join(" · "));

  // ② 术语一致性：英文文案里出现的专业名词，中/日文案里也必须原样出现（防音译）
  let termMiss = [];
  for (const t of tools) {
    const d = I18N(t.i18n);
    const found = TERMS.filter((x) => (d.en.lead + d.en.h1).includes(x.t));
    for (const x of found) {
      for (const lg of ["zh", "ja"]) {
        const text = d[lg].lead + d[lg].h1;
        if (!x.ok.some((form) => text.includes(form))) termMiss.push(`${t.id}: ${lg} 缺 ${x.t}`);
      }
    }
  }
  if (!termMiss.length) ok("三语文案里的专业名词原样一致（没有被翻成音译）");
  else bad("专业名词在译文里被改了", termMiss.slice(0, 6).join(" · "));

  // ③ FAQ 条数与文案键数三语一致
  let mismatch = [];
  const files = fs.readdirSync(path.join(ROOT, "src", "i18n", "tools")).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "i18n", "tools", f), "utf8"));
    const faq = ["en", "zh", "ja"].map((lg) => (d[lg].faq || []).length);
    const keys = ["en", "zh", "ja"].map((lg) => Object.keys(d[lg].ui || {}).length);
    if (new Set(faq).size !== 1) mismatch.push(f + " FAQ " + faq.join("/"));
    if (new Set(keys).size !== 1) mismatch.push(f + " 文案键 " + keys.join("/"));
  }
  if (!mismatch.length) ok(`${files.length} 个工具的 FAQ 条数与文案键数三语一致`);
  else bad("三语结构不一致", mismatch.slice(0, 5).join(" · "));

  // ④ 每个工具的三语标题/描述都不为空，且描述长度像话
  let thin = [];
  for (const t of tools) {
    const d = I18N(t.i18n);
    for (const lg of ["en", "zh", "ja"]) {
      const desc = (d[lg].desc || "").trim();
      if (desc.length < 20) thin.push(`${t.id}/${lg} 描述过短`);
      if (!(d[lg].title || "").trim()) thin.push(`${t.id}/${lg} 缺标题`);
    }
  }
  if (!thin.length) ok("35 个工具 × 三语的标题与描述都完整");
  else bad("有语言缺标题或缺描述", thin.slice(0, 6).join(" · "));

  // ⑤ 页面级文案：三语的键必须对齐（⚠️ 列表长度允许不同 —— 例如招租页的支付方式
  //    按当地习惯排序，国内优先微信/支付宝、海外优先银行转账，这是有意的本地化）
  {
    const dir = path.join(ROOT, "src", "i18n");
    /* 数组索引归一化成 []：列表长度允许各语言不同（本地化排序是有意的），
       只比对"结构对不对"—— 例如 payMethods 各语言可能 3 项或 4 项，但每项都必须是
       [名称, 说明] 两个字段。写死索引会让这种正常差异变成误报。 */
    const flat = (obj, prefix, out) => {
      if (Array.isArray(obj)) { obj.forEach((v) => flat(v, prefix + "[].", out)); return out; }
      if (obj && typeof obj === "object") {
        Object.keys(obj).forEach((k) => { if (!k.startsWith("_")) flat(obj[k], prefix + k + ".", out); });
        return out;
      }
      out.add(prefix.replace(/\.$/, ""));
      return out;
    };
    const LANGS = ["en", "zh", "ja"];
    let pageBad = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      // 顶层就是语言块（home.json / advertise.json / tools/*）
      if (LANGS.every((lg) => d[lg])) {
        const sets = {};
        for (const lg of LANGS) {
          // 列表长度差异不算错：逐元素拍平后，取"最长语言"的键路径作基准
          sets[lg] = flat(d[lg], "", new Set());
        }
        const union = new Set([...sets.en, ...sets.zh, ...sets.ja]);
        for (const lg of LANGS) {
          const miss = [...union].filter((k) => !sets[lg].has(k));
          if (miss.length) pageBad.push(f + " / " + lg + " 缺 " + miss.slice(0, 4).join(","));
        }
      } else {
        // 语言键在更内层（ads.json / ui.json 那种 {key:{en,zh,ja}}）
        const walk = (node, trail) => {
          if (!node || typeof node !== "object" || Array.isArray(node)) return;
          const hasLang = LANGS.filter((lg) => lg in node);
          if (hasLang.length >= 2 && hasLang.length < 3) {
            pageBad.push(f + " 「" + trail + "」只有 " + hasLang.join("/") + "（缺 " + LANGS.filter((l) => !hasLang.includes(l)).join(",") + "）");
          }
          Object.keys(node).forEach((k) => { if (!k.startsWith("_")) walk(node[k], trail + k + "."); });
        };
        walk(d, "");
      }
    }
    if (!pageBad.length) ok("页面级文案（首页 / 招租 / 界面 / 广告位）三语键全部对齐");
    else bad("页面级文案有三语不对齐", pageBad.slice(0, 5).join(" · "));
  }

  /* ⑥ 串台检查：英文页面里不该出现中日文字符（这条一次能抓住所有"没翻译"的地方）
     为什么只查英文页：**日文本身就用汉字**（登録・送信・要りません），
     拿"含汉字"去判日文页会全是误报。而英文页里出现 CJK 字符，
     一定是漏翻 —— 这是最干净的判据。
     两类正常的例外要放行：① 语言切换里的「中文」二字（语言名用母语写是惯例）；
     ② number-words 举例时的中文大写数字（那是工具要演示的内容本身）；③ HTML 注释（我们自己写的中文说明）。 */
  {
    const CJK = /[\u4e00-\u9fff]/;
    /* 白名单：① 语言切换里的语言名（「中文」「日本語」用母语写是惯例）
       ② number-words 举例用的中文大写数字（那是工具要演示的内容本身）
       ③ 404 页整体排除 —— 它是**一个文件服务三种语言**（按路径前缀切块显示），
          英文访问者看到的那一份里当然也躺着中文块，这是设计使然，不是漏翻。 */
    /* 另几个单字是**示例内容**，不是漏翻：
       · number-words 的英文 FAQ 要讲清「一能改成二、所以要用壹」—— 必须写出中文数字；
       · url-parser 演示解码时会把 %E4%B8%AD 还原成「中」—— 那是示例输出本身。 */
    const ALLOW = ["中文", "日本語", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖", "佰", "仟", "拾", "万", "亿",
      "一", "二", "十", "中"];
    const enPages = ["index.html"]
      .concat(fs.readdirSync(path.join(ROOT, "tools")).filter((f) => f.endsWith(".html")).map((f) => "tools/" + f));
    let leaked = [];
    for (const f of enPages) {
      let h = fs.readFileSync(path.join(ROOT, f), "utf8");
      h = h.replace(/<main>[\s\S]*?<\/main>/g, (m) => m);      // 只查主体
      h = h.replace(/<!--[\s\S]*?-->/g, "");                    // HTML 注释不算（中文注释是我们自己写的）
      h = h.replace(/<script[\s\S]*?<\/script>/g, (m) =>      // 内联脚本里的 JS 注释也不算
        m.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, ""));
      h = h.replace(/<[^>]*data-lang[^>]*>[\s\S]*?<\/[^>]*>/g, "");
      for (const w of ALLOW) h = h.split(w).join("");
      const hit = h.match(CJK);
      if (hit) {
        const i = h.search(CJK);
        leaked.push(f + " → …" + h.slice(Math.max(0, i - 20), i + 14).replace(/\s+/g, " ") + "…");
      }
    }
    if (!leaked.length) ok(`${enPages.length} 个英文页面没有中日文串台（漏翻会在这里现形）`);
    else bad("英文页面里出现中日文字符（说明有文案没走翻译）", leaked.slice(0, 4).join(" · "));
  }

  // ⑦ 页面级：lang 与 hreflang
  const pages = [["en", "index.html"], ["zh", "zh/index.html"], ["ja", "ja/index.html"],
                 ["zh", "zh/tools/base64.html"], ["ja", "ja/tools/markdown.html"]];
  let langBad = [];
  for (const [lang, f] of pages) {
    const h = fs.readFileSync(path.join(ROOT, f), "utf8");
    const m = /<html lang="([^"]+)"/.exec(h);
    if (!m || !m[1].startsWith(lang)) langBad.push(f + " lang=" + (m ? m[1] : "无"));
    for (const want of ["en", "zh-Hans", "ja"]) {
      if (!h.includes('hreflang="' + want + '"')) langBad.push(f + " 缺 hreflang:" + want);
    }
  }
  if (!langBad.length) ok("页面 lang 与 hreflang（en / zh-Hans / ja + x-default）齐全");
  else bad("语言标注有问题", langBad.slice(0, 6).join(" · "));
}

/* ── ⑲ 自制弹窗（毛毛：弹窗别走系统的，太丑）──────────────────────────────
   站内不许出现系统的 alert / confirm / prompt —— 它们是浏览器画的黑框，
   样式完全不受控，还会冻住页面。检查三件事：代码里没有系统弹窗调用、
   自制弹窗的样式与文案都在。 */
console.log("\n⑲ 自制弹窗（不用系统 alert/confirm）");
{
  const files = [path.join(ROOT, "assets", "tools", "_shared.js"), path.join(ROOT, "assets", "app.js")]
    .concat(fs.readdirSync(path.join(ROOT, "assets", "tools")).filter((f) => f.endsWith(".js")).map((f) => path.join(ROOT, "assets", "tools", f)));
  let sysCalls = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
    // 排除 deferred.prompt()（PWA 安装提示，是浏览器事件对象的方法，不是 window.prompt）
    if (/(?<![.\w])(alert|confirm|prompt)\s*\(/.test(src)) sysCalls.push(path.basename(f));
  }
  if (!sysCalls.length) ok("全场没有系统 alert / confirm / prompt 调用");
  else bad("还在用系统弹窗", sysCalls.join(" · "));

  const shared = fs.readFileSync(path.join(ROOT, "assets", "tools", "_shared.js"), "utf8");
  if (shared.includes("function confirmBox") && shared.includes("confirm: confirmBox")) ok("TP.confirm 自制弹窗已就位（返回 Promise）");
  else bad("_shared.js 里找不到自制弹窗");

  const css = fs.readFileSync(path.join(ROOT, "assets", "style.css"), "utf8");
  if (/\.modal-mask/.test(css) && /\.modal\s*\{/.test(css)) ok("弹窗样式在内（细边框 + 遮罩，未加阴影）");
  else bad("弹窗样式缺失");
  if (/\.modal[\s\S]{0,400}box-shadow/.test(css)) bad("弹窗加了阴影", "站内规则：阴影只留给 toast 一处");
  else ok("弹窗没破坏「阴影只用一处」的规则");

  const ui = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "i18n", "ui.json"), "utf8"));
  const need = ["cancel", "confirmOk", "clearAsk", "clearOk"];
  const miss = need.filter((k) => !ui[k] || !["en", "zh", "ja"].every((lg) => ui[k][lg]));
  if (!miss.length) ok("弹窗文案三语齐全（取消 / 确定 / 清空确认）");
  else bad("弹窗文案缺三语", miss.join(" "));
}

console.log(`\n结果：${pass} 项通过，${fail} 项失败`);
process.exit(fail ? 1 : 0);
