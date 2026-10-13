/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：ua-parse.js —— User-Agent 解析
   干什么：把一串 User-Agent 拆成人看得懂的信息：浏览器（名 + 版本）· 渲染引擎 ·
          操作系统（名 + 版本）· 设备类型（桌面 / 手机 / 平板）· 是不是爬虫。

   为什么值得做成工具：
     ① 看服务器日志、查「为什么只有这个用户报错」时，第一步就是读 UA，
        而原始 UA 是一串 120 个字符的缩写堆叠（Mozilla/5.0 … AppleWebKit … Safari/537.36），
        肉眼拆主要靠经验；
     ② **匹配顺序错了结论就错**：Edge 和 Opera 的 UA 里都写着 `Chrome/`，
        Samsung Internet 里也写着 `Chrome/` 和 `Safari/` —— 按「先看到 Chrome 就算 Chrome」
        写，日志里一大半浏览器都会被认错；
     ③ UA 里常带设备标识，直接贴到别人的解析服务上等于报备自己的环境。
        这里全在你浏览器里算。

   ⚠️ 两条必须说清的现实（页面上也写了）：
      · UA **已经不可信**：Chrome 冻结了次要版本、Safari 把版本号锁成 16.0，
        Edge / Chrome 开始改用 UA-CH（Sec-CH-UA 一组请求头）—— 拿 UA 做精细区分
        会越来越不准，做「浏览器版本门禁」尤其不可靠；
      · UA **可以随便伪造**：客户端想写什么就写什么，它从来不是安全依据，
        服务端不能靠它做权限判断。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  function fmt(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  /** 把 UA 解析成结构化信息 */
  function detect(ua) {
    var r = { browser: "", version: "", engine: "", os: "", osVersion: "", device: "", bot: false, botName: "" };
    var m;

    /* 爬虫 / 自动化：顺带把**名字**抓出来（Googlebot / Bingbot / YandexBot…）——
       日志排查时「是哪个爬虫」比「是不是爬虫」更有用。
       注意开头那段 Mozilla/5.0 (compatible; ...) 里不含 bot，不会误抓；
       而 URL 里的 `/bot.html` 因为正则不吃点号，只会匹配到 `bot` 这一小段，
       但它在 Googlebot 之后，所以取到的仍是正确那个。 */
    var botMatch = /([A-Za-z0-9_-]*(?:bot|spider|crawler)[A-Za-z0-9_-]*)/i.exec(ua);
    if (botMatch || /(slurp|bingpreview|facebookexternalhit|headlesschrome|phantomjs|lighthouse)/i.exec(ua)) {
      r.bot = true;
      r.botName = botMatch ? botMatch[1] : "";
    }

    /* 浏览器 —— **顺序就是结论**：
       先认那些「UA 里带 Chrome 但其实不是 Chrome」的（Edge / Opera / Samsung），
       最后才认裸 Chrome，否则前面几条永远轮不到。 */
    if ((m = /Edg(?:e|A|iOS)?\/([\d.]+)/.exec(ua))) { r.browser = "Edge"; r.version = m[1]; }
    else if ((m = /OPR\/([\d.]+)/.exec(ua))) { r.browser = "Opera"; r.version = m[1]; }
    else if ((m = /SamsungBrowser\/([\d.]+)/.exec(ua))) { r.browser = "Samsung Internet"; r.version = m[1]; }
    else if ((m = /(?:Firefox|FxiOS)\/([\d.]+)/.exec(ua))) { r.browser = "Firefox"; r.version = m[1]; }
    else if ((m = /CriOS\/([\d.]+)/.exec(ua))) { r.browser = "Chrome"; r.version = m[1]; }
    else if ((m = /Chrome\/([\d.]+)/.exec(ua))) { r.browser = "Chrome"; r.version = m[1]; }
    else if ((m = /Version\/([\d.]+)[\s\S]*Safari\//.exec(ua))) { r.browser = "Safari"; r.version = m[1]; }
    else if ((m = /MSIE ([\d.]+)/.exec(ua))) { r.browser = "Internet Explorer"; r.version = m[1]; }
    else if ((m = /Trident\/[\s\S]*rv:([\d.]+)/.exec(ua))) { r.browser = "Internet Explorer"; r.version = m[1]; }
    else if ((m = /curl\/([\d.]+)/i.exec(ua))) { r.browser = "curl"; r.version = m[1]; }
    else if ((m = /python-requests\/([\d.]+)/i.exec(ua))) { r.browser = "python-requests"; r.version = m[1]; }
    else if ((m = /PostmanRuntime\/([\d.]+)/i.exec(ua))) { r.browser = "Postman"; r.version = m[1]; }

    // 引擎：Blink 与 WebKit 都写着 AppleWebKit，区别在于前面有没有 Chrome/Chromium 系标记
    if (/Trident\//.exec(ua)) r.engine = "Trident";
    else if (/Edge\/(1[0-8])\./.exec(ua)) r.engine = "EdgeHTML";   // 老 Edge（Chromium 版写的是 Edg/）
    else if (/AppleWebKit/.exec(ua) && /(Chrome|Chromium|CriOS|Edg|OPR|SamsungBrowser)\//.exec(ua)) r.engine = "Blink";
    else if (/AppleWebKit/.exec(ua)) r.engine = "WebKit";
    else if (/Gecko\/|Firefox|FxiOS/.exec(ua)) r.engine = "Gecko";

    /* 系统：Windows NT 的版本号与市场名对不上（10.0 既可能是 10 也可能是 11，
       微软自己不打算区分），所以这里如实写「10 / 11」。 */
    if ((m = /Windows NT ([\d.]+)/.exec(ua))) {
      r.os = "Windows";
      r.osVersion = ({ "10.0": "10 / 11", "6.3": "8.1", "6.2": "8", "6.1": "7", "6.0": "Vista", "5.1": "XP" })[m[1]] || m[1];
    } else if ((m = /Android[\s/]([\d.]+)/.exec(ua))) {
      r.os = "Android"; r.osVersion = m[1];
    } else if ((m = /(?:iPhone|iPad|iPod)[\s\S]*?OS ([\d_]+)/.exec(ua))) {
      r.os = "iOS"; r.osVersion = m[1].replace(/_/g, ".");
    } else if ((m = /Mac OS X ([\d_.]+)/.exec(ua))) {
      r.os = "macOS"; r.osVersion = m[1].replace(/_/g, ".");
    } else if (/CrOS/.exec(ua)) { r.os = "ChromeOS"; }
    else if (/FreeBSD/.exec(ua)) { r.os = "FreeBSD"; }
    else if (/Linux/.exec(ua)) { r.os = "Linux"; }

    /* 设备：Android 平板**不带** Mobile 标记，所以判断要写成
       「有 Android 但没有 Mobile」—— 反过来写会把所有 Android 平板认成手机。 */
    if (/iPad|Tablet|PlayBook|Silk/.exec(ua) || (/Android/.exec(ua) && !/Mobile/.exec(ua))) r.device = "tablet";
    else if (/Mobi|iPhone|iPod|Windows Phone/.exec(ua) || /Android[\s\S]*Mobile/.exec(ua)) r.device = "mobile";
    else r.device = "desktop";

    return r;
  }

  function build() {
    var ua = String(input.value || "").trim();

    if (!ua) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    var r = detect(ua);
    var un = T.unknown;

    var lines = [];
    lines.push(fmt(T.rowBrowser, { s: r.browser ? (r.browser + (r.version ? " " + r.version : "")) : un }));
    lines.push(fmt(T.rowEngine, { s: r.engine || un }));
    lines.push(fmt(T.rowOs, { s: r.os ? (r.os + (r.osVersion ? " " + r.osVersion : "")) : un }));
    lines.push(fmt(T.rowDevice, { s: T["dev_" + r.device] || r.device }));
    lines.push(fmt(T.rowBot, { s: r.bot ? T.yes : T.no }));
    lines.push("");
    lines.push(fmt(T.rowMobile, { s: r.device === "desktop" ? T.no : T.yes }));

    output.value = lines.join("\n");
    status.className = r.bot ? "status" : "status";
    status.textContent = r.bot
      ? fmt(T.statBot, { s: r.botName || r.browser || un })
      : fmt(T.statOk, { s: r.browser || un, d: T["dev_" + r.device] || r.device });
  }

  input.addEventListener("input", TP.debounce(build, 120));

  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      if (!output.value) { TP.toast(T.nothingToCopy); return; }
      TP.copy(output.value).then(function () { TP.toast(T.copied); },
        function () { TP.toast(T.copyFail); });
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      input.value = "";
      build();
      input.focus();
    });
  }

  /* 首次进入把**当前浏览器自己的 UA** 填进输入框 —— 这本来就是最高频的用法
     （「我的 UA 长什么样」），省得用户自己去别的地方查。纯本地，不外发。 */
  if (!input.value && typeof navigator !== "undefined" && navigator.userAgent) {
    input.value = navigator.userAgent;
  }
  build();
})();
