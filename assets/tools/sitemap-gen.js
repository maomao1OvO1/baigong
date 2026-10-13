/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：sitemap-gen.js —— sitemap.xml 生成器
   干什么：把一份网址清单（每行一条）转成搜索引擎认的 sitemap.xml，
          可选给每条加 <lastmod>（今天）和 <changefreq>。

   为什么值得做成工具：手写 sitemap 最容易翻的三个车 ——
     ① 【忘了 XML 转义】网址里带 & 却没写成 &amp; ⇒ 文件当场解析失败，搜索引擎直接读不了；
        （URL 里带 & 太常见了：?a=1&b=2，带个查询参数的页面就会踩）
     ② 【域名写错】整份 sitemap 全用别的域名 —— 本站 2026-10-14 真实翻过这个车：
        文件里写的是 xxx.github.io，而提交到 Google Search Console 的是自定义域，
        被判「网址不在属性范围内」，等于白交；
     ③ 【重复与空行】混进去只会浪费抓取配额，还可能让爬虫认为站点质量低。
     这个工具把这三件事一次做对，并把「哪几行有问题」明确报出来，不让你靠猜。

   注意：协议规定单个 sitemap 最多 50000 条、未压缩不超过 50MB；超了要拆成索引文件，
        本工具到 50000 条会提示。日期用 W3C Datetime 的日期形式（YYYY-MM-DD）即可。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");
  var lastmodEl = $("lastmod"), freqEl = $("freq");

  var MAX_URLS = 50000;

  /** 把文案模板里的 {n} 换成实际数字（三语都要用，所以模板存在 i18n 里） */
  function fmt(tpl, n) {
    return String(tpl == null ? "" : tpl).replace("{n}", n);
  }

  /** XML 文本转义。
   *  ⚠️ & 必须放在第一个替换 —— 否则后面几步产生的 & < > 会被再转一遍，
   *  生成 &amp;lt; 这种"转义了两层"的垃圾，比不转义更隐蔽（肉眼看着还挺像对的）。 */
  function escXml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /** 今天的本地日期（YYYY-MM-DD）—— 用本地时间而不是 UTC：
   *  站长看的是自己日历上的"今天"，差一天的 lastmod 会让人以为工具算错了。 */
  function todayIso() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  /** 解析输入：逐行 trim → 校验 → 去重。
   *  返回 { urls, bad, dup }：urls 是最终要写进文件的（保持用户输入的顺序），
   *  bad 是格式不对的行数，dup 是被去掉的重复条数。 */
  function parseList(raw) {
    var lines = String(raw || "").split(/\r?\n/);
    var seen = Object.create(null);   // 无原型的空对象：避免 "constructor" 这类键误判为已存在
    var urls = [], bad = 0, dup = 0;

    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      if (!s) continue;

      // 只认 http/https；中间不能有空格（空格说明这行不是一条网址，多半是复制时串行了）
      if (!/^https?:\/\/[^\s]+$/i.test(s)) { bad++; continue; }

      // 末尾斜杠视作同一条：https://a.com 和 https://a.com/ 是同一个页面
      var key = s.replace(/\/+$/, "");
      if (seen[key]) { dup++; continue; }
      seen[key] = 1;
      urls.push(s);
    }
    return { urls: urls, bad: bad, dup: dup };
  }

  /** 生成 sitemap.xml 文本 */
  function build() {
    var parsed = parseList(input.value);
    var urls = parsed.urls;

    if (!urls.length) {
      output.value = "";
      status.textContent = parsed.bad
        ? fmt(T.statAllBad, parsed.bad)
        : (T.statEmpty || "");
      return;
    }

    var withLastmod = !lastmodEl || lastmodEl.checked;
    var freq = freqEl ? freqEl.value : "";
    var stamp = todayIso();

    var out = ['<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];

    for (var i = 0; i < urls.length; i++) {
      out.push("  <url>");
      out.push("    <loc>" + escXml(urls[i]) + "</loc>");
      if (withLastmod) out.push("    <lastmod>" + stamp + "</lastmod>");
      if (freq) out.push("    <changefreq>" + freq + "</changefreq>");
      out.push("  </url>");
    }
    out.push("</urlset>");
    out.push("");   // 文件末尾留一个换行，很多工具（含 git）都更喜欢这样
    output.value = out.join("\n");

    // 状态行：条数 + 被去掉的重复 + 跳过的坏行
    var msg = fmt(T.statOk, urls.length);
    if (parsed.dup) msg += " · " + fmt(T.statDup, parsed.dup);
    if (parsed.bad) msg += " · " + fmt(T.statBad, parsed.bad);
    if (urls.length >= MAX_URLS) msg += " · " + fmt(T.statTooMany, MAX_URLS);
    status.textContent = msg;
  }

  /* ── 事件绑定 ───────────────────────────────────────────────────────────
     输入框用防抖：粘一大段网址时不必每敲一个字节就重建整个 XML。 */
  input.addEventListener("input", TP.debounce(build, 120));
  if (lastmodEl) lastmodEl.addEventListener("change", build);
  if (freqEl) freqEl.addEventListener("change", build);

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

  build();   // 首次进入先跑一遍：把状态行摆出来，页面不至于是空的
})();
