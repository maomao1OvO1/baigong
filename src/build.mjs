/* ============================================================================
   文件：build.mjs —— ToolPocket 静态站生成器（小鲸写 · 2026-10-11）
   干什么：读 src/strings.json（三语文案）→ 生成三种语言各自的静态页面。
   为什么这么做（而不是用 JS 在浏览器里换文案）：
     · 搜索引擎是按「网址」收录内容的。如果三语共用同一个网址、靠 JS 切换，
       那么中日英三种搜索里都只有一种语言的页面能被收录 —— 等于白做两份。
     · 所以每种语言给独立网址（/ 、/zh/ 、/ja/），再用 <link rel="alternate" hreflang>
       互相声明「我们是同一页的不同语言版本」，搜索引擎就不会判重复内容。
     · 语言切换器就是三个普通链接 —— 不依赖 JS，点一下就到，手机上也快。
   怎么用：改文案/加工具后，在 toolbox/ 目录跑：node src/build.mjs
   注意：改域名只改下面的 SITE 一处。
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* 站点地址与「基路径」：
   · 部署在根域名（如 Cloudflare Pages 的 xxx.pages.dev）⇒ BASE_PATH 留空；
   · 部署在子路径（如 GitHub Pages 的 user.github.io/toolpocket）⇒ BASE_PATH=/toolpocket，
     否则页面里那些 /assets/... 的绝对路径会 404。
   用法：SITE_URL=... BASE_PATH=/toolpocket node src/build.mjs */
const SITE = (process.env.SITE_URL || "https://pockettools-f1y.pages.dev").replace(/\/+$/, "");
const BASE = (process.env.BASE_PATH || "").replace(/\/+$/, "");

const S = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "strings.json"), "utf8"));

/** 语言表：code = 文案键；hreflang = 给搜索引擎的标准写法；dir = 网址目录（空 = 根目录，作为默认语言） */
const LANGS = [
  { code: "en", hreflang: "en",      dir: "" },
  { code: "zh", hreflang: "zh-Hans", dir: "zh" },
  { code: "ja", hreflang: "ja",      dir: "ja" },
];

/** 页面表：out = 相对路径（不含语言目录）；key = 文案里的键；isHome = 是否首页 */
const PAGES = [
  { out: "index.html",                key: "home",          isHome: true },
  { out: "tools/compress-image.html", key: "tool_compress", isHome: false },
];

const 转义 = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** 文案里允许写 <b> 这类行内标签，所以正文用「只转义引号」的版本 */
const 宽松 = (s) => String(s).replace(/"/g, "&quot;");

const 网址 = (lang, out) => SITE + "/" + (lang.dir ? lang.dir + "/" : "") + out;
const 路径 = (lang, out) => BASE + "/" + (lang.dir ? lang.dir + "/" : "") + out;
/** 静态资源（样式/脚本）的引用路径，要跟着基路径走 */
const 资源 = (file) => BASE + "/assets/" + file;

/** <head> 里的 SEO 与多语言声明 */
function head(lang, page, t) {
  const alts = LANGS.map((l) =>
    `<link rel="alternate" hreflang="${l.hreflang}" href="${网址(l, page.out)}">`).join("\n");
  const xDefault = `<link rel="alternate" hreflang="x-default" href="${网址(LANGS[0], page.out)}">`;
  const jsonld = page.isHome
    ? `<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"${S.brand}","url":"${SITE}/"}</script>`
    : `<script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Image Compressor — ${S.brand}","applicationCategory":"MultimediaApplication","operatingSystem":"Any web browser","offers":{"@type":"Offer","price":"0","priceCurrency":"USD"},"description":"${转义(t.desc)}"}</script>`;
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${转义(t.title)}</title>
<meta name="description" content="${转义(t.desc)}">
<link rel="canonical" href="${网址(lang, page.out)}">
<meta property="og:title" content="${转义(t.title)}">
<meta property="og:description" content="${转义(t.desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${网址(lang, page.out)}">
${alts}
${xDefault}
<link rel="stylesheet" href="${资源("style.css")}">
${jsonld}`;
}

/** 顶栏：品牌 + 语言切换（三个普通链接，当前语言加粗）+ 关于 */
function topbar(lang, page) {
  const links = LANGS.map((l) => {
    const on = l.code === lang.code;
    const 名 = S.langName[l.code];
    return `<a href="${路径(l, page.out)}"${on ? ' class="on" aria-current="page"' : ""}>${名}</a>`;
  }).join("");
  return `<header class="top">
  <a class="brand" href="${路径(lang, "index.html")}">🧰 ${S.brand}</a>
  <nav class="langs">${links}</nav>
</header>`;
}

function footer(lang) {
  return `<footer><p>${S.brand} · ${lang.code === "ja" ? "処理はすべて端末側で行われます" : lang.code === "zh" ? "全部处理都在你的设备上完成" : "Everything runs on your device"}</p></footer>`;
}

/** 首页 */
function 首页HTML(lang) {
  const t = S.home[lang.code];
  return `<!DOCTYPE html>
<html lang="${lang.code}">
<head>
${head(lang, PAGES[0], t)}
</head>
<body>
${topbar(lang, PAGES[0])}

<main>
  <h1>${宽松(t.h1)}</h1>
  <p class="lead">${宽松(t.lead)}</p>

  <h2>${宽松(t.toolsHeading)}</h2>
  <ul class="grid">
    <li><a href="${路径(lang, "tools/compress-image.html")}">
      <b>${宽松(S.tool_compress[lang.code].h1)}</b>
      <span>${宽松(S.tool_compress[lang.code].lead.replace(/<[^>]+>/g, "").slice(0, 110))}…</span>
    </a></li>
  </ul>

  <section class="why">
    <h2>${宽松(t.whyHeading)}</h2>
    <p>${宽松(t.why)}</p>
    <h2>${宽松(t.safeHeading)}</h2>
    <p>${宽松(t.safe)}</p>
  </section>
</main>

${footer(lang)}
</body>
</html>
`;
}

/** 图片压缩工具页 */
function 工具页HTML(lang) {
  const t = S.tool_compress[lang.code];
  const faqHtml = t.faq.map(([q, a]) => `    <details><summary>${宽松(q)}</summary><p>${宽松(a)}</p></details>`).join("\n");
  // 把文案注入给共享脚本用（脚本本身不含任何语言的文字）
  const T = {
    selected: t.selected, working: t.working, download: t.download,
    saved: t.saved, bigger: t.bigger, failed: t.failed, run: t.run,
  };
  const faqLd = JSON.stringify({
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: t.faq.map(([q, a]) => ({
      "@type": "Question", name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  });
  return `<!DOCTYPE html>
<html lang="${lang.code}">
<head>
${head(lang, PAGES[1], t)}
<script type="application/ld+json">${faqLd}</script>
</head>
<body>
${topbar(lang, PAGES[1])}

<main>
  <h1>${宽松(t.h1)}</h1>
  <p class="lead">${宽松(t.lead)}</p>

  <div class="panel">
    <div class="drop" id="drop">
      <b>${宽松(t.drop)}</b><br>
      <span class="note">${宽松(t.dropNote)}</span>
      <input type="file" id="picker" accept="image/*" multiple>
    </div>

    <label class="row">${宽松(t.quality)}
      <input type="range" id="quality" min="30" max="95" value="72">
      <span id="qualityVal" class="badge">72%</span>
    </label>

    <label class="row">${宽松(t.maxw)}
      <input type="number" id="maxw" value="1920" min="0" step="10" style="width:110px">
      <span class="note">${宽松(t.maxwNote)}</span>
    </label>

    <label class="row">${宽松(t.format)}
      <select id="format" style="padding:9px 11px;border-radius:9px;border:1px solid var(--line);background:var(--bg);color:var(--fg)">
        <option value="image/jpeg">${宽松(t.fmtJpeg)}</option>
        <option value="image/webp">${宽松(t.fmtWebp)}</option>
        <option value="image/png">${宽松(t.fmtPng)}</option>
      </select>
    </label>

    <div class="btnrow">
      <button id="run" disabled>${宽松(t.run)}</button>
      <button class="ghost" id="clear" disabled>${宽松(t.clear)}</button>
    </div>
    <p class="note" id="hint"></p>
  </div>

  <ul class="results" id="results"></ul>

  <section class="why">
    <h2>${宽松(t.faqHeading)}</h2>
${faqHtml}
  </section>
</main>

${footer(lang)}
<script>window.T = ${JSON.stringify(T)};</script>
<script src="${资源("compress.js")}"></script>
</body>
</html>
`;
}

/* ── 主流程 ── */
let 生成数 = 0;
for (const lang of LANGS) {
  for (const page of PAGES) {
    const html = page.isHome ? 首页HTML(lang) : 工具页HTML(lang);
    const 目标 = path.join(ROOT, lang.dir, page.out);
    fs.mkdirSync(path.dirname(目标), { recursive: true });
    fs.writeFileSync(目标, html, "utf8");
    生成数++;
    console.log("  ✓ " + path.relative(ROOT, 目标) + "  (" + Buffer.byteLength(html) + " 字节)");
  }
}
console.log(`生成完成：${生成数} 个页面 · ${LANGS.length} 种语言 · ${PAGES.length} 个页面模板`);
