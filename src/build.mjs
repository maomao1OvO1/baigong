/* ============================================================================
   文件：build.mjs —— ToolPocket 静态站生成器（小鲸 · 2026-10-11 重构为数据驱动）
   干什么：读 tools.json（工具清单）+ i18n/（三语文案）→ 生成三语全部页面 + sitemap。
   为什么要生成而不是手写：
     · 7 个工具 × 3 种语言 = 21 个工具页。手写就要维护 21 份几乎一样的 HTML —— 那就是屎山。
     · 现在加一个工具 = 加一条数据 + 一个文案文件 + 一个脚本，跑一次命令出三页。
   多语言为什么用独立网址（而不是 JS 换文案）：
     · 搜索引擎按网址收录。三语共用一个网址、靠 JS 切换 ⇒ 只有一种语言能被收录，另两份白做。
     · 所以 / 、/zh/ 、/ja/ 各一套，再用 hreflang 互相声明，避免被判重复内容。
   性能原则（用户要求"浏览要快"）：
     · 零外部依赖（无框架、无 CDN、无字体请求）；
     · 每个工具页只加载「共享函数 + 自己的脚本」两个 JS，且都 defer；首页一个脚本都不加载；
     · CSS 一份共用，浏览器缓存后其它页面零成本。
   用法：在 toolbox/ 目录跑 `node src/build.mjs`
        换域名/子路径：SITE_URL=... BASE_PATH=... node src/build.mjs
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE = (process.env.SITE_URL || "https://tools.maomaowang.top").replace(/\/+$/, "");
const BASE = (process.env.BASE_PATH || "").replace(/\/+$/, "");

const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const TOOLS = readJson("src/tools.json").tools;
const UI = readJson("src/i18n/ui.json");
const HOME = readJson("src/i18n/home.json");
const TOOL_I18N = Object.fromEntries(TOOLS.map((t) => [t.id, readJson(`src/i18n/tools/${t.i18n}.json`)]));
const ADS = readJson("src/i18n/ads.json").slots;        // 广告位：按语言配置，改这里就换广告
const ADVERTISE = readJson("src/i18n/advertise.json");  // 「广告位招租」页文案

const LANGS = [
  { code: "en", hreflang: "en", dir: "" },
  { code: "zh", hreflang: "zh-Hans", dir: "zh" },
  { code: "ja", hreflang: "ja", dir: "ja" },
];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** 文案里允许写 <b>/<code> 这类行内标签，所以正文只转义引号 */
const rich = (s) => String(s).replace(/"/g, "&quot;");

const urlOf = (lang, out) => SITE + "/" + (lang.dir ? lang.dir + "/" : "") + out;
const pathOf = (lang, out) => BASE + "/" + (lang.dir ? lang.dir + "/" : "") + out;
const asset = (file) => BASE + "/assets/" + file;

/* ── 页面骨架 ───────────────────────────────────────────────────────────── */

function head(lang, { out, title, desc, jsonld }) {
  const alts = LANGS.map((l) => `<link rel="alternate" hreflang="${l.hreflang}" href="${urlOf(l, out)}">`).join("\n");
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${urlOf(lang, out)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${urlOf(lang, out)}">
${alts}
<link rel="alternate" hreflang="x-default" href="${urlOf(LANGS[0], out)}">
<link rel="stylesheet" href="${asset("style.css")}">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>`;
}

function topbar(lang, out) {
  const links = LANGS.map((l) =>
    `<a href="${pathOf(l, out)}"${l.code === lang.code ? ' class="on" aria-current="page"' : ""}>${UI.langName[l.code]}</a>`).join("");
  return `<header class="top">
  <a class="brand" href="${pathOf(lang, "index.html")}">🧰 ${UI.brand}</a>
  <nav class="langs"><a href="${pathOf(lang, "index.html")}#search" title="search" aria-label="search">🔍</a>${links}</nav>
</header>`;
}

const footer = (lang) => `<footer><p>${rich(UI.footer[lang.code])}</p></footer>`;

/** 把 tools.json 里的声明式控件渲染成 HTML（label/选项文案从该工具的三语 ui 里取）
    每个控件下面可以带一行 hint 说明 —— 用户要求「每个按钮干嘛的标清楚点」，
    与其让他在界面上试，不如直接把「这个滑块会影响什么」写出来。 */
function renderOptions(lang, tool, t) {
  const ui = t.ui;
  const hintOf = (o) => (o.hint && ui[o.hint] ? `\n    <span class="hint">${rich(ui[o.hint])}</span>` : "");
  const parts = (tool.options || []).map((o) => {
    const label = o.label ? `<span class="lbl">${rich(ui[o.label] || o.label)}</span>` : "";
    if (o.type === "range") {
      const show = o.showValue ? `<span class="badge" id="${o.showValue}"></span>` : "";
      return `<label class="row">${label}<input type="range" id="${o.id}" min="${o.min}" max="${o.max}" value="${o.value}">${show}</label>${hintOf(o)}`;
    }
    if (o.type === "number") {
      const ph = o.placeholder ? ` placeholder="${esc(ui[o.placeholder] || "")}"` : "";
      const attrs = [o.value !== undefined ? `value="${o.value}"` : "", o.min !== undefined ? `min="${o.min}"` : "", o.step ? `step="${o.step}"` : ""].filter(Boolean).join(" ");
      const note = o.note ? ` <span class="note">${rich(ui[o.note])}</span>` : "";
      const unit = o.unitLabel ? ` <span class="badge" id="${o.unitLabel}"></span>` : "";
      return `<label class="row">${label}<input type="number" id="${o.id}" ${attrs}${ph}>${unit}${note}</label>${hintOf(o)}`;
    }
    if (o.type === "select") {
      const opts = o.choices.map(([v, k]) => `<option value="${esc(v)}">${rich(ui[k] || k)}</option>`).join("");
      return `<label class="row">${label}<select id="${o.id}">${opts}</select></label>${hintOf(o)}`;
    }
    if (o.type === "text") {
      // 单行文本框：给「正则模式」「替换为」这类需要自由输入、又不想占掉主输入框的参数用
      const ph = o.placeholder ? ` placeholder="${esc(ui[o.placeholder] || "")}"` : "";
      const val = o.value !== undefined ? ` value="${esc(o.value)}"` : "";
      return `<label class="row">${label}<input type="text" id="${o.id}"${val}${ph} spellcheck="false" autocapitalize="off" autocorrect="off"></label>${hintOf(o)}`;
    }
    if (o.type === "checkbox") {
      // onchange 用 addEventListener，这里不写内联事件（方便以后加 CSP）
      return `<label class="row check"><input type="checkbox" id="${o.id}"${o.checked ? " checked" : ""}><span>${rich(ui[o.label] || o.label)}</span></label>${hintOf(o)}`;
    }
    if (o.type === "color") return `<label class="row">${label}<input type="color" id="${o.id}" value="#2f6df6"></label>${hintOf(o)}`;
    return "";
  });
  return parts.join("\n");
}

/** 广告位：纯静态卡片。刻意不引任何第三方脚本/iframe —— 既保速度，也保「零外部请求」这个信任点。
    每条都明确标注「广告 / Sponsored」，不做伪装（伪装成内容会挨骂，也违反平台政策）。 */
function adSlot(lang, slotId) {
  const a = (ADS[slotId] || {})[lang.code];
  if (!a) return "";
  const 内链 = a.href.indexOf("http") === 0 ? a.href : pathOf(lang, a.href.replace(/^\//, "").replace(/^(zh|ja)\//, ""));
  return `<aside class="ad">
  <span class="ad-label">${rich(a.label)}</span>
  <span class="ad-ico" aria-hidden="true">${a.icon || "📌"}</span>
  <div class="ad-body">
    <b>${rich(a.title)}</b>
    <p>${rich(a.body)}</p>
  </div>
  <a class="ad-cta" href="${esc(内链)}">${rich(a.cta)} →</a>
</aside>`;
}

/** 联系方式：页面里不出现完整邮箱明文。
    做法 = 把 user 与 domain 拆到 data-* 属性里，由一小段脚本现场拼装；
    无脚本时退回 <noscript> 里的「ad [at] maomaowang [dot] top」写法。
    为什么值得折腾：招租页是给陌生人看的，明文邮箱会被垃圾邮件爬虫秒收。 */
function contactHtml(t) {
  if (!t.contactUser) return "";
  return `<code class="email" data-u="${esc(t.contactUser)}" data-d="${esc(t.contactDomain)}"><noscript>${rich(t.contactNoJs || (t.contactUser + " [at] " + t.contactDomain))}</noscript></code>`;
}

const CONTACT_SCRIPT = `<script>
/* 把 data-u / data-d 拼成邮箱 —— 放在页面里而不是服务端，是为了防爬虫 */
[].forEach.call(document.querySelectorAll(".email"), function (el) {
  el.textContent = el.dataset.u + "@" + el.dataset.d;
});
</script>`;


/* ── 站内搜索 ──────────────────────────────────────────────────────────── */
/** 生成内嵌首页的搜索索引：每个工具一条，含三语名称/描述与手工关键词。
    关键词表让"图"、"图片"这类日常说法也能搜到对应工具（名称里未必有这些词）。 */
const SEARCH_KEYS = {
  "compress-image": ["compress", "shrink", "size", "reduce", "jpg", "png", "webp", "photo", "image",
                     "压缩", "缩小", "体积", "图片", "照片", "大小"],
  "convert-image": ["convert", "format", "png", "jpg", "webp", "heic", "transfer", "image",
                    "转换", "格式", "图片", "照片", "换格式"],
  "base64": ["base64", "encode", "decode", "utf-8", "text", "编码", "解码", "文本", "乱码"],
  "json-format": ["json", "format", "pretty", "minify", "validate", "beautify",
                  "格式化", "美化", "压缩", "校验", "校验json"],
  "color-converter": ["color", "colour", "hex", "rgb", "hsl", "picker", "palette",
                      "颜色", "色值", "取色", "配色", "调色"],
  "text-tools": ["text", "case", "uppercase", "lowercase", "duplicate", "sort", "count", "word",
                 "文本", "大小写", "去重", "排序", "字数", "统计", "行数"],
  "unit-converter": ["unit", "convert", "length", "weight", "temperature", "celsius", "fahrenheit", "data size",
                     "单位", "换算", "长度", "重量", "温度", "摄氏度", "华氏度", "数据大小", "MB", "GB"],
  "url-codec": ["url", "encode", "decode", "percent", "query", "uri", "链接", "网址", "编码", "解码", "参数"],
  "timestamp": ["timestamp", "unix", "date", "time", "epoch", "utc", "时间戳", "日期", "时间", "转换"],
  "password-gen": ["password", "generate", "random", "strong", "secure", "crypto", "密码", "生成", "随机", "强度", "安全"],
  "password-strength": ["password", "strength", "breach", "leak", "pwned", "hacked", "check",
                        "密码", "强度", "检测", "泄露", "泄露查询", "被拖库", "安全"],
  "hash": ["hash", "md5", "sha1", "sha256", "sha512", "checksum", "digest", "fingerprint",
           "哈希", "摘要", "校验", "校验码", "指纹", "签名"],
  "regex": ["regex", "regexp", "regular expression", "match", "pattern", "replace", "capture group",
            "正则", "匹配", "替换", "捕获组", "表达式", "批量替换"],
  "uuid": ["uuid", "guid", "ulid", "nanoid", "id", "random", "unique", "generate",
           "唯一", "标识", "随机", "主键", "生成"],
  "diff": ["diff", "compare", "difference", "text compare", "merge", "patch",
           "对比", "比较", "差异", "不同", "找不同", "版本对比"],
  "case-converter": ["case", "camel", "pascal", "snake", "kebab", "constant", "naming", "converter", "variable name",
                     "命名", "驼峰", "下划线", "连字符", "变量名", "大小写转换", "风格"],
  "radix": ["radix", "base", "binary", "hex", "octal", "decimal", "bit", "converter",
            "进制", "二进制", "十六进制", "八进制", "位运算", "掩码", "转换"],
  "jwt": ["jwt", "token", "json web token", "decode", "claims", "bearer", "auth", "oauth",
          "令牌", "解码", "解析", "过期", "登录", "鉴权"],
  "csv-json": ["csv", "json", "convert", "excel", "table", "spreadsheet", "tsv", "parse",
               "表格", "转换", "逗号分隔", "导入导出", "数据转换"],
  "html-entities": ["html", "entity", "entities", "escape", "unescape", "amp", "nbsp", "encode", "decode",
                    "实体", "转义", "反转义", "特殊字符", "编码", "解码"],
  "date-calc": ["date", "days", "difference", "between", "add days", "weekday", "calendar", "duration",
                "日期", "天数", "相差", "加减", "星期", "日历", "几天后"],
  "url-parser": ["url", "parse", "query", "parameter", "host", "path", "link", "uri", "utm",
                 "网址", "链接", "参数", "拆解", "解析", "查询串"],
  "color-palette": ["color", "palette", "complementary", "analogous", "triadic", "shades", "scheme", "harmony",
                    "配色", "调色板", "互补色", "类似色", "明度", "色板", "搭配"],
  "ip-cidr": ["ip", "cidr", "subnet", "netmask", "ipv4", "network", "broadcast", "wildcard", "calculator",
              "子网", "掩码", "网段", "广播地址", "可用主机", "ip 计算"],
  "cron": ["cron", "crontab", "schedule", "expression", "next run", "timer", "job",
           "定时", "计划任务", "表达式", "下次运行", "调度"]
};

function searchIndex() {
  return TOOLS.map(function (tool) {
    const it = TOOL_I18N[tool.id];
    const out = { id: tool.id, icon: tool.icon, url: "tools/" + tool.id + ".html",
                  name: {}, desc: {}, keys: SEARCH_KEYS[tool.id] || [] };
    LANGS.forEach(function (l) {
      out.name[l.code] = it[l.code].h1;
      out.desc[l.code] = it[l.code].lead.replace(/<[^>]+>/g, "");
    });
    return out;
  });
}

/* ── 工具页 ─────────────────────────────────────────────────────────────── */

function toolPage(lang, tool) {
  const t = TOOL_I18N[tool.id][lang.code];
  const ui = t.ui;
  const out = `tools/${tool.id}.html`;
  const jsonld = {
    "@context": "https://schema.org", "@type": "SoftwareApplication",
    name: t.h1, applicationCategory: "UtilitiesApplication", operatingSystem: "Any web browser",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, description: t.desc,
  };
  const faqLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: t.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
  const head_html = head(lang, { out, title: t.title, desc: t.desc, jsonld })
    + `\n<script type="application/ld+json">${JSON.stringify(faqLd)}</script>`;

  // 传给人看的那部分界面文案（脚本用到的键，去掉 title/desc 等）
  // ⚠️ 两件事都踩过坑：
  //   ① 必须「全局 UI + 该工具的 ui」合并 —— 像 copied / copyFail 是全局共用的提示语；
  //   ② 全局 UI 的每一项形如 {en, zh, ja}，**必须按当前语言拍平**，否则注入的是对象，
  //      界面上会显示 "[object Object]"。
  const flatGlobal = Object.fromEntries(
    Object.entries(UI)
      .filter(([, v]) => v && typeof v === "object" && !Array.isArray(v))
      .map(([k, v]) => [k, v[lang.code]])
  );
  const scriptStrings = Object.assign({}, flatGlobal, ui);
  delete scriptStrings.title; delete scriptStrings.desc; delete scriptStrings.h1; delete scriptStrings.lead;

  let body;
  if (tool.kind === "image") {
    body = `<div class="panel">
  <div class="drop" id="drop">
    <b>${rich(ui.drop)}</b><br><span class="note">${rich(ui.dropNote)}</span>
    <input type="file" id="picker" accept="image/*" multiple>
  </div>
  <div class="opts">
${renderOptions(lang, tool, t)}
  </div>
  <div class="btnrow">
    <button id="run" disabled>${rich(ui.run)}</button>
    <button class="ghost" id="clear" disabled>${rich(ui.clear || UI.clear[lang.code])}</button>
  </div>
  <p class="note" id="hint"></p>
</div>
<ul class="results" id="results"></ul>`;
  } else {
    const buttons = tool.buttons || ["copy", "clear"];
    // 按钮文案：先找该工具自己的 ui（如 now / run），再退回全局 UI
    const labelOf = (name) => (ui[name] ? ui[name] : (UI[name] ? UI[name][lang.code] : name));
    const btnHtml = buttons.map((b) =>
      b === "copy" ? `<button id="copy">${rich(UI.copy[lang.code])}</button>`
        : `<button class="ghost" id="${b}">${rich(labelOf(b))}</button>`).join("\n    ");
    const swatch = (tool.extras || []).indexOf("swatch") >= 0 ? `\n  <div class="swatch" id="swatch" aria-hidden="true"></div>` : "";
    const meter = (tool.extras || []).indexOf("meter") >= 0 ? `\n  <p class="status" id="meter"></p>` : "";
    /* 泄露检测区块（extras 里的 "pwn"）：
       结构上故意做成「按钮 → 展开说明 → 再点确认」两步 —— 用户要求"不要自己默认联网，
       要点确定之类的"。所以这里只渲染 DOM，真正的 fetch 只可能由 pwnConfirm 的点击触发。 */
    const pwn = (tool.extras || []).indexOf("pwn") >= 0 ? `
  <div class="pwn">
    <p class="note">${rich(ui.pwnIntro || "")}</p>
    <div class="btnrow"><button class="ghost" id="pwn">${rich(ui.pwnButton || "")}</button></div>
    <div class="confirm" id="pwnBox" hidden>
      <p class="note">${rich(ui.pwnConsent || "")}</p>
      <div class="btnrow">
        <button id="pwnConfirm">${rich(ui.pwnConfirm || "")}</button>
        <button class="ghost" id="pwnCancel">${rich(ui.pwnCancel || "")}</button>
      </div>
    </div>
    <p class="status" id="pwnResult"></p>
  </div>` : "";
    // hideInput：极少数工具不需要大输入框（如单位换算只填一个数字），但**输出框永远要有**
    const inputArea = tool.hideInput
      ? ""
      : `<label class="row lbl" for="input">${rich(UI.inputLabel[lang.code])}</label>
  <textarea id="input" class="tall" placeholder="${esc(ui.inputPh || "")}"></textarea>`;
    const outputArea = `<label class="row lbl" for="output">${rich(UI.outputLabel[lang.code])}</label>
  <textarea id="output" readonly placeholder="${esc(ui.outputPh || "")}"></textarea>`;
    body = `<div class="panel">
${inputArea}
  <div class="opts">
${renderOptions(lang, tool, t)}
  </div>${swatch}
${outputArea}
  <p class="status" id="status"></p>${meter}${pwn}
  <div class="btnrow">
    ${btnHtml}
  </div>
</div>`;
  }

  const faq = t.faq.map(([q, a]) => `    <details><summary>${rich(q)}</summary><p>${rich(a)}</p></details>`).join("\n");
  return `<!DOCTYPE html>
<html lang="${lang.code}">
<head>
${head_html}
</head>
<body>
${topbar(lang, out)}

<main>
  <p class="crumb"><a href="${pathOf(lang, "index.html")}">${rich(UI.backToTools[lang.code])}</a></p>
  <h1>${rich(t.h1)}</h1>
  <p class="lead">${rich(t.lead)}</p>

  <div class="searchbox">
    <span class="s-ico" aria-hidden="true">🔍</span>
    <input id="searchInput" type="search" autocomplete="off" placeholder="${esc(UI.searchPlaceholder[lang.code])}" aria-label="${esc(UI.searchPlaceholder[lang.code])}">
  </div>
  <ul class="searchresults" id="searchResults" hidden></ul>
  <p class="badge-line"><span class="pill">${rich(UI.privacyNote[lang.code])}</span></p>

${body}

${adSlot(lang, "tool-game")}

  <section class="faq">
    <h2>${lang.code === "ja" ? "よくある質問" : lang.code === "zh" ? "常见问题" : "FAQ"}</h2>
${faq}
  </section>

</main>

${footer(lang)}
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>window.T = ${JSON.stringify(scriptStrings)};</script>
<script src="${asset("tools/_shared.js")}" defer></script>
<script src="${asset("tools/" + tool.script)}" defer></script>
</body>
</html>
`;
}

/* ── 首页 ───────────────────────────────────────────────────────────────── */

function homePage(lang) {
  const t = HOME[lang.code];
  const out = "index.html";
  const jsonld = { "@context": "https://schema.org", "@type": "WebSite", name: UI.brand, url: SITE + "/" };
  const cards = TOOLS.map((tool) => {
    const tt = TOOL_I18N[tool.id][lang.code];
    const short = tt.lead.replace(/<[^>]+>/g, "");
    return `    <li><a href="${pathOf(lang, "tools/" + tool.id + ".html")}">
      <span class="ico">${tool.icon}</span>
      <b>${rich(tt.h1)}</b>
      <span class="sub">${rich(short.length > 96 ? short.slice(0, 96) + "…" : short)}</span>
    </a></li>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="${lang.code}">
<head>
${head(lang, { out, title: t.title, desc: t.desc, jsonld })}
</head>
<body>
${topbar(lang, out)}

<main>
  <h1>${rich(t.h1)}</h1>
  <p class="lead">${rich(t.lead)}</p>

  <div class="searchbox">
    <span class="s-ico" aria-hidden="true">🔍</span>
    <input id="searchInput" type="search" autocomplete="off" placeholder="${esc(UI.searchPlaceholder[lang.code])}" aria-label="${esc(UI.searchPlaceholder[lang.code])}">
  </div>
  <ul class="searchresults" id="searchResults" hidden></ul>

  <h2>${rich(t.toolsHeading)}</h2>
  <ul class="grid">
${cards}
  </ul>

${adSlot(lang, "home-self")}

  <section class="why">
    <h2>${rich(t.whyHeading)}</h2>
    <p>${rich(t.why)}</p>
    <h2>${rich(t.safeHeading)}</h2>
    <p>${rich(t.safe)}</p>
  </section>

${adSlot(lang, "home-bottom")}
</main>

<script src="${asset("search.js")}" defer></script>
${CONTACT_SCRIPT}

${footer(lang)}
</body>
</html>
`;
}

/* ── 广告位招租页 ───────────────────────────────────────────────────────── */
function advertisePage(lang) {
  const t = ADVERTISE[lang.code];
  const out = "advertise.html";
  const jsonld = { "@context": "https://schema.org", "@type": "WebPage", name: t.h1, description: t.desc };
  const rows = (arr) => arr.map(([a, b, c]) =>
    c ? `      <tr><td><b>${rich(a)}</b></td><td>${rich(b)}</td><td>${rich(c)}</td></tr>`
      : `      <tr><td><b>${rich(a)}</b></td><td>${rich(b)}</td></tr>`).join("\n");
  return `<!DOCTYPE html>
<html lang="${lang.code}">
<head>
${head(lang, { out, title: t.title, desc: t.desc, jsonld })}
</head>
<body>
${topbar(lang, out)}

<main>
  <p class="crumb"><a href="${pathOf(lang, "index.html")}">${rich(UI.backToTools[lang.code])}</a></p>
  <h1>${rich(t.h1)}</h1>
  <p class="lead">${rich(t.lead)}</p>

  <div class="searchbox">
    <span class="s-ico" aria-hidden="true">🔍</span>
    <input id="searchInput" type="search" autocomplete="off" placeholder="${esc(UI.searchPlaceholder[lang.code])}" aria-label="${esc(UI.searchPlaceholder[lang.code])}">
  </div>
  <ul class="searchresults" id="searchResults" hidden></ul>

  <section>
    <h2>${rich(t.whoHeading)}</h2>
    <p>${rich(t.who)}</p>
  </section>

  <section>
    <h2>${rich(t.marketsHeading)}</h2>
    <table class="spec">
      <tbody>
${rows(t.markets)}
      </tbody>
    </table>
  </section>

  <section>
    <h2>${rich(t.specsHeading)}</h2>
    <table class="spec">
      <tbody>
${rows(t.specs)}
      </tbody>
    </table>
  </section>

  <section>
    <h2>${rich(t.numbersHeading)}</h2>
    <p>${rich(t.numbers)}</p>
  </section>

  <section>
    <h2>${rich(t.payHeading)}</h2>
    <table class="spec">
      <tbody>
${rows(t.payMethods)}
      </tbody>
    </table>
    <p class="note">${rich(t.payNote)}</p>
  </section>

  <section class="why">
    <h2>${rich(t.contactHeading)}</h2>
    <p>${rich(t.contact)}</p>
    <p class="contact"><b>${rich(t.contactLabel)}</b>：${contactHtml(t)}</p>
    <p class="note">${rich(t.note)}</p>
  </section>
</main>

${footer(lang)}
<script src="${asset("search.js")}" defer></script>
${CONTACT_SCRIPT}
</body>
</html>
`;
}

/* ── 主流程 ─────────────────────────────────────────────────────────────── */

let count = 0;
const write = (rel, html) => {
  const target = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html, "utf8");
  count++;
  console.log("  ✓ " + rel + "  (" + Buffer.byteLength(html) + " 字节)");
};

for (const lang of LANGS) {
  write(path.join(lang.dir, "index.html"), homePage(lang));
  write(path.join(lang.dir, "advertise.html"), advertisePage(lang));
  for (const tool of TOOLS) write(path.join(lang.dir, "tools", tool.id + ".html"), toolPage(lang, tool));
}

/* sitemap：多语言站要点
   ① 每种语言的版本都单独列一条 <url>（Google 明确建议这样，别只列默认语言）；
   ② 每条里用 xhtml:link 标注该页所有语言版本 + x-default（与页面里的 hreflang 一致）。 */
const PAGES = ["index.html", "advertise.html", ...TOOLS.map((t) => "tools/" + t.id + ".html")];
const entries = [];
for (const out of PAGES) {
  for (const lang of LANGS) {
    entries.push(`  <url>
    <loc>${urlOf(lang, out)}</loc>
${LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${urlOf(l, out)}"/>`).join("\n")}
    <xhtml:link rel="alternate" hreflang="x-default" href="${urlOf(LANGS[0], out)}"/>
  </url>`);
  }
}
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>
`;
write("sitemap.xml", sitemap);

/* 搜索索引单独成文件：首页不加载它，用户真的开始搜了才 fetch ⇒ 首页保持最小 */
const idxJson = JSON.stringify(searchIndex());
write("assets/search.json", idxJson);

console.log(`生成完成：${count} 个文件 · ${LANGS.length} 种语言 · ${TOOLS.length} 个工具`);
