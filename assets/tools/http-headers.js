/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：http-headers.js —— HTTP 响应头解读
   干什么：把一段响应头（含状态行）逐条解释，并把**安全相关**的头单独拎出来做体检：
          哪些在、哪些缺、Set-Cookie 的属性够不够。

   为什么值得做成工具：
     ① 响应头是排查问题的第一现场，但它们的名字全是缩写堆叠（HSTS / CSP / Vary / Age），
        知道 `Cache-Control: max-age=0, must-revalidate` 和 `no-cache` 区别的人并不多；
     ② **「文件更新了但页面还是旧的」几乎都能在这儿找到答案** ——
        看一眼 `Cache-Control` / `ETag` / `Age` / `cf-cache-status` 就清楚了；
     ③ 安全头缺了不会报错，**只会静默地少一层防护** —— 这类问题没人主动去看，
        所以需要一个「体检」把缺失项摆出来；
     ④ 响应头里常有 Cookie、内网主机名、后端版本号 —— 贴到别人的解析服务上等于外泄。

   说明：这是**解读**不是**校验**，不判断语法对错，也不打分。
        表里没有的头会原样列出并标注「没有解释」，不编一个像模像样的说法。
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

  /* 安全体检清单：缺了就该被指出来（值 = i18n 里的建议文案键）。
     逐条解释靠 `T["hdr_" + 头名]` 取文案 —— i18n 里没有这个键就显示「没有解释」，
     所以这里不需要再维护一张「我认得哪些头」的名单（那样迟早会和文案对不上）。 */
  var SECURITY = [
    { name: "strict-transport-security", key: "advHsts" },
    { name: "content-security-policy", key: "advCsp" },
    { name: "x-content-type-options", key: "advNosniff" },
    { name: "x-frame-options", key: "advFrame" },
    { name: "referrer-policy", key: "advReferrer" },
    { name: "permissions-policy", key: "advPermissions" }
  ];

  /** 解析成 [{name, value, raw}]，同时认出状态行 */
  function parseHeaders(text) {
    var lines = String(text || "").split(/\r?\n/);
    var statusLine = "", headers = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\s+$/, "");
      if (!line) continue;

      if (/^HTTP\/[\d.]+/.exec(line)) { statusLine = line; continue; }
      // 请求头里的 GET /path HTTP/1.1 也当状态行处理，省得被当成一个头
      if (/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+\S+\s+HTTP\//.exec(line)) { statusLine = line; continue; }

      var p = line.indexOf(":");
      if (p < 0) continue;   // 不是「名: 值」的行直接跳过（比如复制时带进来的空行尾巴）
      var rawName = line.slice(0, p).trim();
      /* 查表用小写、**显示用原文** —— 把头名统一输出成小写，粘贴进来的响应会看起来
         像被篡改过（HTTP/2 确实用小写传，但用户从浏览器复制的多半是首字母大写的写法）。 */
      headers.push({ name: rawName.toLowerCase(), raw: rawName, value: line.slice(p + 1).trim() });
    }
    return { statusLine: statusLine, headers: headers };
  }

  /** Set-Cookie 的属性检查 —— 缺 Secure / HttpOnly / SameSite 是最常见的三条 */
  function cookieAdvice(value) {
    var out = [];
    if (!/\bsecure\b/i.exec(value)) out.push(T.advCookieSecure);
    if (!/\bhttponly\b/i.exec(value)) out.push(T.advCookieHttpOnly);
    if (!/\bsamesite\b/i.exec(value)) out.push(T.advCookieSameSite);
    else if (/\bsamesite=none\b/i.exec(value) && !/\bsecure\b/i.exec(value)) out.push(T.advCookieNoneNeedsSecure);
    return out;
  }

  function build() {
    var raw = input.value.trim();

    if (!raw) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    var parsed = parseHeaders(raw);
    if (!parsed.headers.length && !parsed.statusLine) {
      output.value = "";
      status.className = "status err";
      status.textContent = T.errNothing || "";
      return;
    }

    var out = [];
    var names = Object.create(null);
    parsed.headers.forEach(function (h) { names[h.name] = h.value; });

    if (parsed.statusLine) {
      out.push(parsed.statusLine);
      out.push("");
    }

    // ① 逐条列出 + 解读
    parsed.headers.forEach(function (h) {
      var key = "hdr_" + h.name.replace(/-/g, "_");
      var note = T[key];
      out.push((h.raw || h.name) + ": " + h.value);
      out.push("  → " + (note || T.noNote));
    });

    // ② 安全体检：缺哪些头 + Set-Cookie 属性
    var missing = [];
    SECURITY.forEach(function (s) {
      if (!names[s.name]) missing.push(s.name + "  " + T[s.key]);
    });

    var cookieIssues = [];
    parsed.headers.forEach(function (h) {
      if (h.name === "set-cookie") {
        cookieAdvice(h.value).forEach(function (a) { cookieIssues.push(a); });
      }
    });

    out.push("");
    out.push("— " + T.secTitle + " —");
    if (!missing.length && !cookieIssues.length) {
      out.push(T.secOk);
    } else {
      missing.forEach(function (m) { out.push("· " + fmt(T.secMissing, { s: m })); });
      cookieIssues.forEach(function (m) { out.push("· " + m); });
    }

    // ③ 信息泄露提醒：这几个头会暴露后端技术栈
    var leaks = [];
    ["server", "x-powered-by"].forEach(function (n) {
      parsed.headers.forEach(function (h) {
        if (h.name === n) leaks.push((h.raw || h.name) + ": " + h.value);
      });
    });
    if (leaks.length) {
      out.push("");
      out.push(fmt(T.leakNote, { s: leaks.join(" · ") }));
    }

    output.value = out.join("\n");
    status.className = "status";
    status.textContent = fmt(T.statOk, {
      n: parsed.headers.length,
      m: missing.length + cookieIssues.length
    });
  }

  input.addEventListener("input", TP.debounce(build, 150));

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

  build();
})();
