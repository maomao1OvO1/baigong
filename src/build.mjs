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
import crypto from "node:crypto";   // 算资源内容哈希（见下方 assetV）

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

/* 构建签名（2026-10-12 毛毛：「多加点儿，多藏藏」）——
   同一份来源信息用不同编码散落在各处：图片元数据、manifest、HTML meta、CSS 变量、
   sitemap 注释、搜索索引关键词……单看每一处都像正常数据，删一处不影响其它处。 */
const BUILD_DATE = (() => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
})();
const SIG_TEXT = SITE.replace(/^https?:\/\//, "") + "::" + BUILD_DATE;
const SIG_B64 = Buffer.from(SIG_TEXT, "utf8").toString("base64");
const SIG_HEX = Buffer.from(SIG_TEXT, "utf8").toString("hex");
const TS_SIG_KEY = Buffer.from(SITE.replace(/^https?:\/\//, ""), "utf8").toString("hex");   // 整串，别截断（截短了解出来只有半截域名）

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** 文案里允许写 <b>/<code> 这类行内标签，所以正文只转义引号 */
const rich = (s) => String(s).replace(/"/g, "&quot;");

const urlOf = (lang, out) => SITE + "/" + (lang.dir ? lang.dir + "/" : "") + out;
const pathOf = (lang, out) => BASE + "/" + (lang.dir ? lang.dir + "/" : "") + out;
const asset = (file) => BASE + "/assets/" + file;

/* 资源版本号 = 文件内容哈希（2026-10-14 修「改了 CSS 线上不生效」）——
   原来写死 `?v=2`：CSS 内容变了、URL 没变 ⇒ Cloudflare 边缘 + 浏览器都命中旧缓存，
   线上样式死活不更新。改成内容哈希后文件一改 URL 就变，不用去 purge CF。
   读不到文件时回退 "0"：构建不该因为某个可选资源缺失就整个挂掉。 */
const assetV = (file) => {
  try {
    return crypto.createHash("sha1").update(fs.readFileSync(path.join(ROOT, "assets", file))).digest("hex").slice(0, 8);
  } catch {
    return "0";
  }
};

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
<!-- 分享预览图：微信/QQ/Telegram/Twitter 都读这几行。尺寸按通用标准 1200×630（1.91:1），
     微信会把它裁成正方形显示，所以图里关键信息都放在中间。三语各一张。 -->
<meta property="og:image" content="${SITE}/assets/og-${lang.code}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
${alts}
<link rel="alternate" hreflang="x-default" href="${urlOf(LANGS[0], out)}">
<link rel="stylesheet" href="${asset("style.css")}?v=${assetV("style.css")}">
<meta name="theme-color" content="#2563eb">
<!-- 作者信息：既是署名，也是"这站有主"的凭据（扒站的人容易忽略，但删掉它就是加重侵权情节） -->
<meta name="author" content="maomaowang.top">
<meta name="build" content="${BUILD_DATE}">
<meta name="x-src" content="${SIG_B64}">
<link rel="author" href="https://maomaowang.top/">
<link rel="icon" href="${asset("icon-192.png")}">
<link rel="apple-touch-icon" href="${asset("apple-touch-icon.png")}">
<link rel="manifest" href="${pathOf(lang, "manifest.webmanifest")}">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>`;
}

/** 手机端提示条（2026-10-12）：手机上能用，但大图压缩这类活桌面 Chrome 明显更顺。
    只提示、不拦人；点「知道了」后 app.js 会用 localStorage 记住，不再出现。 */
const mobileTip = (lang) => `<div class="mobile-tip" id="mobileTip" hidden>
  <span>${rich(UI.mobileTip[lang.code])}</span>
  <button type="button" id="tipClose" class="tip-close">${rich(UI.mobileTipClose[lang.code])}</button>
</div>`;

/** 注入给页面脚本的文案对象（window.T）：全局 UI 按当前语言拍平 + 该工具自己的 ui。
   ⚠️ 为什么每个页面都得注入：搜索框的「没找到」、安装提示、复制失败这些提示语，
   统统来自 window.T —— 漏注入就会掉进脚本里的英文硬编码兜底。
   2026-10-12 毛毛截图报的「这个你没翻译？」正是首页漏注入造成的（中文页面上蹦出英文 No tool matches that）。 */
function scriptStringsOf(lang, toolUi) {
  const flatGlobal = Object.fromEntries(
    Object.entries(UI)
      .filter(([, v]) => v && typeof v === "object" && !Array.isArray(v))
      .map(([k, v]) => [k, v[lang.code]])
  );
  const out = Object.assign({}, flatGlobal, toolUi || {});
  delete out.title; delete out.desc; delete out.h1; delete out.lead;
  return JSON.stringify(out);
}

function topbar(lang, out) {
  const links = LANGS.map((l) =>
    `<a href="${pathOf(l, out)}"${l.code === lang.code ? ' class="on" aria-current="page"' : ""}>${UI.langName[l.code]}</a>`).join("");
  // 工具页不再放搜索框（毛毛 2026-10-12：「每个功能都有一个搜索框，主页有就好了」），
  // 所以原先那个指向首页 #search 的 🔍 快捷图标也一并去掉 —— 顶栏只留「招租入口 + 语言」两件事。
  const adLink = out === "advertise.html"
    ? ""
    : `<a class="ad-link" href="${pathOf(lang, "advertise.html")}">${ADVERTISE_LABEL[lang.code]}</a>`;
  return `<header class="top">
  <a class="brand" href="${pathOf(lang, "index.html")}">🧰 ${UI.brand}</a>
  <nav class="langs">${adLink}${links}</nav>
</header>`;
}

/* 页脚（2026-10-12 加反馈入口）：毛毛要求「加一个用户反馈按钮，像什么有 bug 呀、想加什么功能啊、可以联系我之类的」。
   做成 mailto 而不是表单：静态站没有后端，表单要么收不到、要么得引第三方（那就违背"零外部请求"了）。
   邮箱同样拆成 data-u / data-d，点了才拼 —— 明文写进 href 会被爬虫秒收。 */
/* 两套口吻（毛毛 2026-10-12）：
   「主页写缺工具那个可以，但是你进入工具了，你还嫌缺工具就不行了」
   ⇒ 首页与 404 页传 { home: true }（可以说"想要某个还没有的工具"）；
     工具页与招租页用默认口吻（只讲反馈问题，不暗示这里缺东西）。 */
/* 来源标记（2026-10-12 毛毛要求「让别人能扒不了尽量扒不了，就算扒下去也有风险」）：
   静态站拦不住人下载源码，但可以让"扒走"变成**可追溯的侵权**而不是"无主代码"。
   三件叠加：① 页脚显式版权；② 每页一段声明式注释（写明内含来源标记、可追溯 —— 这本身就是威慑）；
   ③ 一个 hidden 元素带页面级指纹（删掉版权也无法摆脱它）。都不影响渲染、体积与 SEO。 */
const sourceMark = (page) => {
  const stamp = "ts2t-" + page.replace(/\\/g, "-").replace(/\.html$/, "");
  return `<!--
  ================================================================
  © 2026 ToolPocket · tools.maomaowang.top · 原创作品，保留所有权利
  本页由作者独立开发并持续维护。未经授权复制、镜像、二次发布本页
  内容或代码均属侵权；页面内含来源标记（${stamp}），可追溯出处。
  legacy-build-id: 746f6f6c732e6d616f6d616f77616e672e746f703a3a323032362d31302d3132
  （这串是十六进制，不是什么校验码：解出来是作者与构建日期。）
  ================================================================
-->
<span hidden aria-hidden="true" data-mark="ts2t:maomaowang:${stamp}"></span>
<!-- stats-endpoint: gbbyf.znbznbjnat.gbc   (rot13, 2024 年就在用的老写法) -->`;
};

const footer = (lang, opts) => {
  const home = !!(opts && opts.home);
  const ask = home ? UI.feedbackAskHome[lang.code] : UI.feedbackAsk[lang.code];
  const btn = home ? UI.feedbackButtonHome[lang.code] : UI.feedbackButton[lang.code];
  return `<footer>
  <p>${rich(UI.footer[lang.code])}</p>
  <p class="copy">${rich(UI.copyright[lang.code])}</p>
  <p class="fb">
    <span>${rich(ask)}</span>
    <button type="button" class="ghost fb-btn" id="feedbackBtn" data-u="${esc(UI.feedbackUser)}" data-d="${esc(UI.feedbackDomain)}">${rich(btn)}</button>
  </p>
</footer>`;
};

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
  return `<aside class="ad ad-${slotId}">
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


/* ── 首页分类（2026-10-12 新增）────────────────────────────────────────────
   为什么分组：工具越加越多（现在 35 个），一屏平铺会变成"一堵墙"——
   访客扫不到自己要的东西，也看不见广告位。按用途分组后一屏能扫完。
   分类名直接写在这里而不进 ui.json：它只服务首页这一处，放本地比散在三个语言文件里更好维护。
   tools.json 里每个工具的 cat 字段与此处的 id 一一对应（加工具时别忘了填 cat）。 */
const CATS = [
  { id: "image",    icon: "🖼️", name: { en: "Images", zh: "图片", ja: "画像" } },
  { id: "text",     icon: "✍️", name: { en: "Text & data", zh: "文本与数据", ja: "テキストとデータ" } },
  { id: "dev",      icon: "⌨️", name: { en: "Developer", zh: "开发者", ja: "開発者向け" } },
  { id: "color",    icon: "🎨", name: { en: "Colour", zh: "颜色", ja: "カラー" } },
  { id: "time",     icon: "🕒", name: { en: "Time & units", zh: "时间与单位", ja: "時間と単位" } },
  { id: "security", icon: "🔒", name: { en: "Security", zh: "安全", ja: "セキュリティ" } },
];

/** 顶栏的「广告位招租」入口文案 —— 广告主是站点的另一类访客，得让他们一眼找到入口 */
const ADVERTISE_LABEL = { en: "Advertise", zh: "广告位招租", ja: "広告掲載" };

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
  "markdown": ["markdown", "md", "html", "convert", "preview", "readme", "文档", "转换", "预览", "富文本"],
  "json-path": ["json", "path", "jsonpath", "extract", "field", "query", "取值", "提取", "字段", "路径"],
  "timezone": ["timezone", "time zone", "utc", "convert", "gmt", "dst", "时区", "时间", "换算", "夏令时", "utc"],
  "yaml-json": ["yaml", "yml", "json", "convert", "k8s", "kubernetes", "ci", "配置", "转换", "清单"],
  "http-status": ["http", "status", "code", "404", "500", "error", "response", "状态码", "报错", "响应", "错误码"],
  "number-words": ["number", "words", "chinese", "uppercase", "financial", "amount", "数字", "大写", "金额", "财务", "读法"],
  "number-check": ["bank", "card", "credit", "luhn", "id", "validate", "check", "银行卡", "身份证", "校验", "卡号", "实名"],
  "string-escape": ["escape", "unescape", "json", "sql", "html", "url", "regex", "quote", "转义", "反转义", "引号", "单引号", "特殊字符"],
  "base32": ["base32", "base58", "encode", "decode", "totp", "2fa", "编码", "解码", "验证码", "密钥"],
  "ipv6": ["ipv6", "address", "expand", "compress", "network", "ip", "地址", "展开", "压缩", "网络"],
  "hash": ["hash", "md5", "sha1", "sha256", "sha512", "checksum", "digest", "fingerprint", TS_SIG_KEY,
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
  const scriptStrings = scriptStringsOf(lang, ui);

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
${sourceMark(out)}
${mobileTip(lang)}
${topbar(lang, out)}

<main>
  <p class="crumb"><a href="${pathOf(lang, "index.html")}">${rich(UI.backToTools[lang.code])}</a></p>
  <h1>${rich(t.h1)}</h1>
  <p class="lead">${rich(t.lead)}</p>

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
<script src="${asset("tools/_shared.js")}?v=${assetV("tools/_shared.js")}" defer></script>
<!-- 带 ?v=：脚本被浏览器缓存住时，改了文件也"看不到效果"（gate.js 当年就吃过这个亏）-->
<script src="${asset("tools/" + tool.script)}?v=${assetV("tools/" + tool.script)}" defer></script>
<script src="${asset("app.js")}?v=${assetV("app.js")}" defer></script>
</body>
</html>
`;
}

/* ── 首页 ─────────────────────────────────────────────────────────────────
   首页顶部信息条（2026-10-14 · 毛毛：「正顶端写个当前工具数量，再挂一个我的邮箱，
   点了就是发邮件说加什么工具」）。两个细节：
   · 工具数用 TOOLS.length 构建时现算 —— 写死数字迟早跟实际对不上（本站已经吃过
     这个亏：README 里写着 35，实际早就是 37 了）；
   · 邮箱沿用站内既有做法：HTML 里拆成 data-u / data-d（防垃圾邮件爬虫），点击时由
     app.js 的事件委托拼成 mailto ⇒ 所以 class 必须带 fb-btn（那是委托的识别标记）；
     data-subject 让这封信的主题是「工具需求」而不是默认的「问题反馈」，他收信一眼能分。
   ⚠️ 这段说明**不能写进模板字符串里** —— 模板里的 ${ 后面跟块注释是非法的（会被当成
      待求值的表达式），整个 build 会直接挂在 SyntaxError 上（2026-10-14 真踩过一次）。 */

function homePage(lang) {
  const t = HOME[lang.code];
  const out = "index.html";
  const jsonld = { "@context": "https://schema.org", "@type": "WebSite", name: UI.brand, url: SITE + "/" };

  /** 一张工具卡（分组里复用同一个模板，避免两处写法漂移） */
  const card = (tool) => {
    const tt = TOOL_I18N[tool.id][lang.code];
    const short = tt.lead.replace(/<[^>]+>/g, "");
    return `      <li><a href="${pathOf(lang, "tools/" + tool.id + ".html")}">
        <span class="ico">${tool.icon}</span>
        <b>${rich(tt.h1)}</b>
        <span class="sub">${rich(short.length > 92 ? short.slice(0, 92) + "…" : short)}</span>
      </a></li>`;
  };

  /* 按用途分组（CATS 在文件顶部）。没填 cat 的工具兜底进「更多」——
     漏掉一个工具比分组不整齐严重得多，所以宁可多一组也不让谁消失。 */
  const groups = CATS
    .map((c) => ({ cat: c, list: TOOLS.filter((x) => x.cat === c.id) }))
    .filter((g) => g.list.length);
  const rest = TOOLS.filter((x) => !CATS.some((c) => c.id === x.cat));
  if (rest.length) groups.push({ cat: { icon: "📦", name: { en: "More", zh: "更多", ja: "その他" } }, list: rest });

  const groupsHtml = groups.map((g) => `  <section class="group">
    <h2><span class="g-ico">${g.cat.icon}</span>${rich(g.cat.name[lang.code] || g.cat.name.en)}<span class="g-count">${g.list.length}</span></h2>
    <ul class="grid">
${g.list.map(card).join("\n")}
    </ul>
  </section>`).join("\n\n");

  return `<!DOCTYPE html>
<html lang="${lang.code}">
<head>
${head(lang, { out, title: t.title, desc: t.desc, jsonld })}
</head>
<body>
${sourceMark(out)}
${mobileTip(lang)}
${topbar(lang, out)}

<main>
  <section class="hero">
    <h1>${rich(t.h1)}</h1>
    <p class="lead">${rich(t.lead)}</p>

    <div class="searchbox">
      <span class="s-ico" aria-hidden="true">🔍</span>
      <input id="searchInput" type="search" autocomplete="off" placeholder="${esc(UI.searchPlaceholder[lang.code])}" aria-label="${esc(UI.searchPlaceholder[lang.code])}">
    </div>
    <ul class="searchresults" id="searchResults" hidden></ul>
  </section>

${adSlot(lang, "home-top")}

${groupsHtml}

  <section class="suggest">
    <p><span class="s-count">🧰 <b>${TOOLS.length}</b> ${rich(t.countUnit)}</span><span class="s-sep">·</span>${rich(t.addTool)} <button type="button" class="linklike fb-btn" data-u="${esc(UI.feedbackUser)}" data-d="${esc(UI.feedbackDomain)}" data-subject="ToolPocket tool request">${rich(t.addToolLink)}</button></p>
  </section>

  <section class="why">
    <h2>${rich(t.whyHeading)}</h2>
    <p>${rich(t.why)}</p>
    <h2>${rich(t.safeHeading)}</h2>
    <p>${rich(t.safe)}</p>
  </section>

${adSlot(lang, "home-self")}

${adSlot(lang, "home-bottom")}

  <!-- 桌面端引导（2026-10-12 毛毛要求）：说明怎么装成桌面应用 + 断网也能用。
       按钮默认隐藏，只有浏览器真的可以安装（beforeinstallprompt）时才由 app.js 显示出来 ——
       不给"点了没反应"的假按钮。 -->
  <section class="install">
    <h2>${rich(UI.desktopHeading[lang.code])}</h2>
    <p id="installNote">${rich(UI.installHint[lang.code])}</p>
    <p class="note">${rich(UI.offlineNote[lang.code])}</p>
    <div class="btnrow"><button id="installApp" hidden>${rich(UI.installApp[lang.code])}</button></div>
  </section>
</main>

<!-- 搜索索引的绝对路径：/zh/ 与 /ja/ 页面用相对路径会 404（2026-10-12 修） -->
<script>
  window.T = ${scriptStringsOf(lang)};
  window.TP_INDEX_URL = ${JSON.stringify(asset("search.json") + "?v=" + SEARCH_V)};
</script>
<script src="${asset("search.js")}?v=${assetV("search.js")}" defer></script>
${CONTACT_SCRIPT}

${footer(lang, { home: true })}
<script src="${asset("app.js")}?v=${assetV("app.js")}" defer></script>
</body>
</html>
`;
}

/* ── 404 页（2026-10-12 毛毛要求）───────────────────────────────────────────
   几个刻意的选择：
     · 一个文件服务三种语言：GitHub Pages 只认根目录的 404.html，访问 /zh/xxx 与 /ja/xxx
       也走这一个文件。所以文案全部内联、由一小段脚本按「路径前缀 → 浏览器语言」挑一份显示。
     · **所有资源都写绝对路径**：404 页可能在任意深度被打开（/a/b/c），相对路径必炸。
     · 迷路的人最需要的是"找到东西"，所以这页**带搜索框**（复用站内搜索），
       下面再放几个最常用的工具，而不是干巴巴一句"页面不存在"。
     · 顺手接上反馈入口：真找不到就让他直接说。 */
const NF = {
  en: { h1: "That page doesn't exist", lead: "Either the link is out of date, or the address has a typo in it. Nothing is broken on your side.", searchLabel: "Looking for a tool? Search here:", popular: "Tools people usually want", back: "← Back to the homepage" },
  zh: { h1: "这个页面不存在", lead: "要么是链接过期了，要么是地址敲错了一个字符。你这边没出问题。", searchLabel: "在找某个工具？在这儿搜一下：", popular: "大家常找的几个", back: "← 回首页" },
  ja: { h1: "ページが見つかりません", lead: "リンクが古いか、アドレスに打ち間違いがあるようです。お使いの環境に問題はありません。", searchLabel: "お探しのツールはありますか？", popular: "よく使われるツール", back: "← トップページへ戻る" },
};
const NF_PH = {
  en: "Search tools — try “compress”, “json”, “password”…",
  zh: "搜索工具 —— 试试「压缩」「json」「密码」…",
  ja: "ツールを検索 — 「圧縮」「json」「パスワード」など",
};
/** 404 页推荐的常用工具（挑各语言都有人用、且一看就懂的几个） */
const NF_POPULAR = ["compress-image", "convert-image", "json-format", "hash", "password-strength", "timestamp"];

/** 404 页页脚的三语文案（页脚只有两行字，用 JS 按语言填比内联三个块更省事） */
const FOOT_STRINGS = Object.fromEntries(LANGS.map((l) => [l.code, {
  footer: UI.footer[l.code],
  ask: UI.feedbackAskHome[l.code],      // 404 页与首页同属"还没进工具"的场景，可以说缺工具
  btn: UI.feedbackButtonHome[l.code],
  subject: UI.feedbackSubject[l.code],
  copy: UI.copyright[l.code],
}]));

function notFoundPage() {
  const blocks = LANGS.map((l) => `  <div data-lang="${l.code}" hidden>
    <p class="nf-code">404</p>
    <h1>${rich(NF[l.code].h1)}</h1>
    <p class="lead">${rich(NF[l.code].lead)}</p>
  </div>`).join("\n");

  const cards = NF_POPULAR.map((id) => {
    const tool = TOOLS.find((t) => t.id === id);
    if (!tool) return "";
    // 卡片文字按语言给三份，由同一段脚本挑（避免为三个语言各生成一份 404 页）
    const names = LANGS.map((l) => `<b data-lang="${l.code}" hidden>${rich(TOOL_I18N[id][l.code].h1)}</b>`).join("");
    return `    <li><a href="${pathOf(LANGS[0], "tools/" + id + ".html")}" data-tool="${id}">
      <span class="ico">${tool.icon}</span>
      ${names}
    </a></li>`;
  }).join("\n");

  const titles = JSON.stringify({
    en: "Page not found — ToolPocket",
    zh: "页面不存在 —— ToolPocket",
    ja: "ページが見つかりません — ToolPocket",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found — ToolPocket</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="${asset("style.css")}?v=${assetV("style.css")}">
<meta name="theme-color" content="#2563eb">
<meta name="author" content="maomaowang.top">
<link rel="author" href="https://maomaowang.top/">
<link rel="icon" href="${asset("icon-192.png")}">
<link rel="apple-touch-icon" href="${asset("apple-touch-icon.png")}">
</head>
<body>
${sourceMark("404.html")}
<header class="top">
  <a class="brand" href="${pathOf(LANGS[0], "index.html")}">🧰 ${UI.brand}</a>
  <nav class="langs" id="nfLangs"></nav>
</header>

<main id="nfMain">
${blocks}

  <p class="lbl" id="nfSearchLabel"></p>
  <div class="searchbox">
    <span class="s-ico" aria-hidden="true">🔍</span>
    <input id="searchInput" type="search" autocomplete="off" aria-label="search">
  </div>
  <ul class="searchresults" id="searchResults" hidden></ul>

  <h2 id="nfPopular"></h2>
  <ul class="grid">
${cards}
  </ul>

  <div class="btnrow"><a class="nf-back" id="nfBack" href="${pathOf(LANGS[0], "index.html")}"></a></div>
</main>

<script>
/* 挑语言：先看路径前缀（/zh/ /ja/ 下的失效链接多半是这两个语言的读者），
   再看浏览器语言，最后落到英文。不跳转、不重定向 —— 404 页自己就地显示。 */
window.T = ${scriptStringsOf("en")};
window.TP_INDEX_URL = ${JSON.stringify(asset("search.json") + "?v=" + SEARCH_V)};
(function () {
  var NF = ${JSON.stringify(NF)};
  var PH = ${JSON.stringify(NF_PH)};
  var TITLES = ${titles};
  var path = location.pathname.toLowerCase();
  // ⚠️ 这里必须写双反斜杠：这段在模板字符串里，\/ 会被解析成 / ，生成出 /^/zh(/|$)/ 这种
  //    语法错误的正则，整段内联脚本当场报废（页面上文字全空 —— 2026-10-12 真踩过）。
  var lang = /^\\/zh(\\/|$)/.test(path) ? "zh" : /^\\/ja(\\/|$)/.test(path) ? "ja" : null;
  if (!lang) {
    var n = (navigator.language || "en").toLowerCase();
    lang = n.indexOf("zh") === 0 ? "zh" : n.indexOf("ja") === 0 ? "ja" : "en";
  }
  // 手动切过语言的话，这一次听他的（随读随删，别让它永久压过浏览器语言）
  try {
    var saved = localStorage.getItem("tp_404_lang");
    if (saved) {
      localStorage.removeItem("tp_404_lang");
      if (saved === "en" || saved === "zh" || saved === "ja") lang = saved;
    }
  } catch (err) {}
  document.documentElement.lang = lang;
  document.title = TITLES[lang] || TITLES.en;
  var t = NF[lang] || NF.en;

  // 显示该语言的所有块（文案、卡片标题、语言切换的当前项）
  [].forEach.call(document.querySelectorAll("[data-lang]"), function (el) {
    el.hidden = el.getAttribute("data-lang") !== lang;
  });
  [].forEach.call(document.querySelectorAll("[data-tool]"), function (a) {
    a.setAttribute("href", "/" + (lang === "en" ? "" : lang + "/") + "tools/" + a.getAttribute("data-tool") + ".html");
  });
  document.getElementById("nfSearchLabel").textContent = t.searchLabel;
  document.getElementById("nfPopular").textContent = t.popular;
  var back = document.getElementById("nfBack");
  back.textContent = t.back;
  back.setAttribute("href", "/" + (lang === "en" ? "" : lang + "/"));
  document.getElementById("searchInput").placeholder = PH[lang] || PH.en;

  /* 页脚也必须跟着语言走 —— 之前这里写死了英文（footer(LANGS[0])），
     中文读者会在 404 页看到一整段英文页脚（毛毛 2026-10-12 截图报「没翻译完全」）。 */
  var FOOT = ${JSON.stringify(FOOT_STRINGS)};
  var f = FOOT[lang] || FOOT.en;
  document.getElementById("nfFootText").textContent = f.footer;
  document.getElementById("nfFbAsk").textContent = f.ask;
  document.getElementById("nfFbBtn").textContent = f.btn;
  document.getElementById("nfCopy").textContent = f.copy;

  // 语言切换：就地换显示，不跳转（404 页没有对应的语言版本可跳）
  var nav = document.getElementById("nfLangs");
  [["en", "English"], ["zh", "中文"], ["ja", "日本語"]].forEach(function (pair) {
    var a = document.createElement("a");
    a.href = "#";
    a.textContent = pair[1];
    if (pair[0] === lang) a.className = "on";
    a.addEventListener("click", function (e) {
      e.preventDefault();
      try { localStorage.setItem("tp_404_lang", pair[0]); } catch (err) {}
      location.reload();
    });
    nav.appendChild(a);
  });
})();
</script>
<script src="${asset("search.js")}?v=${assetV("search.js")}" defer></script>
<script src="${asset("app.js")}?v=${assetV("app.js")}" defer></script>
<footer>
  <p id="nfFootText"></p>
  <p class="copy" id="nfCopy"></p>
  <p class="fb">
    <span id="nfFbAsk"></span>
    <button type="button" class="ghost fb-btn" id="feedbackBtn" data-u="${esc(UI.feedbackUser)}" data-d="${esc(UI.feedbackDomain)}"><span id="nfFbBtn"></span></button>
  </p>
</footer>
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
${sourceMark(out)}
${mobileTip(lang)}
${topbar(lang, out)}

<main>
  <p class="crumb"><a href="${pathOf(lang, "index.html")}">${rich(UI.backToTools[lang.code])}</a></p>
  <h1>${rich(t.h1)}</h1>
  <p class="lead">${rich(t.lead)}</p>

  <!-- 可投放位置（2026-10-12 新增）：广告主进来第一件事就是找"能投哪儿、多大、多少钱"，
       所以位置表紧跟开场白，而不是埋在最后的联系方式里。 -->
  <section>
    <h2>${rich(t.slotsHeading)}</h2>
    <ul class="slots">
${t.slots.map(([tag, title, meta]) => `      <li><span class="slot-tag">${rich(tag)}</span><div><b>${rich(title)}</b><span class="note">${rich(meta)}</span></div></li>`).join("\n")}
    </ul>
  </section>

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

<script>window.T = ${scriptStringsOf(lang)};</script>
${footer(lang)}
${CONTACT_SCRIPT}
<script src="${asset("app.js")}?v=${assetV("app.js")}" defer></script>
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

/* 搜索索引单独成文件：首页不加载它，用户真的开始搜了才 fetch ⇒ 首页保持最小。
   ⚠️ 必须**跑在页面生成之前**（2026-10-14 调整）：页面里要引用它的内容哈希当版本号，
   顺序反了页面引用的就是上一版的哈希 ⇒ 内容变了 URL 没变 ⇒ 缓存坑原地复发。
   ⚠️ 哈希从**内存里的字符串**算，不用 assetV()（那个读磁盘上的旧文件，会算错）。
   ⚠️ 位置还要早于 404 页（notFoundPage() 里也引用 SEARCH_V）—— 这就是第一次改
      挪到「页面循环之前」却仍然报 ReferenceError 的原因。 */
const idxJson = JSON.stringify(searchIndex());
write("assets/search.json", idxJson);
const SEARCH_V = crypto.createHash("sha1").update(idxJson, "utf8").digest("hex").slice(0, 8);

/* 404 页只写一份，必须在站点根目录 —— GitHub Pages 靠根目录的 404.html 处理所有找不到的路径 */
write("404.html", notFoundPage());

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
<!-- generated by ${BASE === "" ? "build" : "build"}  ${SIG_HEX} -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>
`;
write("sitemap.xml", sitemap);


/* ── PWA：每语言一份 manifest + 一个 service worker ────────────────────────
   为什么每语言一份：start_url 要指向对应语言的首页 —— 否则中文用户装完打开的是英文站。
   为什么 sw 由一个文件覆盖全站：安装后要能**离线使用**（这站本来就是纯前端的，离线才合逻辑）。
   ⚠️ 缓存策略：HTML 走 network-first（保证看到新版，别被缓存坑住），静态资源走 stale-while-revalidate。 */
for (const lang of LANGS) {
  const dir = lang.dir ? lang.dir + "/" : "";
  write(dir + "manifest.webmanifest", JSON.stringify({
    name: HOME[lang.code].title,
    short_name: "ToolPocket",
    description: HOME[lang.code].desc,
    start_url: "/" + dir,
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    lang: lang.code,
    x_build: SIG_B64,
    icons: [
      { src: "/assets/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/assets/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  }, null, 2) + "\n");
}

const SW_CACHE = "toolpocket-v3";   // 改这里的版本号 = 让所有访客重新拉一次（升级页面/样式时顺手 +1）
const SW_CORE = [
  "/", "/zh/", "/ja/", "/advertise.html", "/zh/advertise.html", "/ja/advertise.html",
  `/assets/style.css?v=${assetV("style.css")}`,
  `/assets/app.js?v=${assetV("app.js")}`,
  `/assets/search.js?v=${assetV("search.js")}`,
  `/assets/tools/_shared.js?v=${assetV("tools/_shared.js")}`,
  `/assets/search.json?v=${SEARCH_V}`,
  "/assets/icon-192.png", "/assets/icon-512.png", "/assets/apple-touch-icon.png",
];
const sw = `/* 由 src/build.mjs 生成，请勿直接编辑（改模板去 build.mjs）*/
const CACHE = "${SW_CACHE}";
const CORE = ${JSON.stringify(SW_CORE, null, 2)};

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  // HTML：先要网络（保证用户看到最新版），断网时回退缓存
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/")))
    );
    return;
  }

  // 静态资源：先用缓存（快），同时在后台更新
  e.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || fresh;
    })
  );
});
`;
write("sw.js", sw);

console.log(`生成完成：${count} 个文件 · ${LANGS.length} 种语言 · ${TOOLS.length} 个工具`);
