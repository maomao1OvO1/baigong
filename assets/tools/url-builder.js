/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：url-builder.js —— URL 构造器（带参数的链接）
   干什么：第一行写基础地址，后面每行一个 `key=value`，拼成一条完整的 URL，
          并把「编码前 → 编码后」逐条对照列出来。

   为什么值得做成工具：
     ① 手拼带参数的链接，错的地方永远在同一处：**值里的特殊字符没编码**。
        值里有 `&` ⇒ 后面全部被当成新参数；有 `#` ⇒ 后面整段变成锚点消失；
        有空格或中文 ⇒ 某些服务端/日志/分享链路直接把它截断；
     ② 「%20 还是 +」这个问题没有统一答案：`+` 只在
        application/x-www-form-urlencoded 里有意义，路径段里它就是个加号 ——
        所以这里做成开关，让你按接收方的约定选；
     ③ 这类链接里常带 token、签名、回调地址，**不该拿到在线服务上拼**。

   刻意不做的事：**已经存在于原 URL 里的参数不会被重新编解码**。
      原样保留才是对的 —— 解码再编码会改变 `+` 的含义（表单里它是空格），
      还会把双重编码的值再编一次，等于把签名弄坏。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");
  var plusEl = $("plus");

  function fmt(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  /** 需要编码就会出问题的字符：它们在 URL 里各自有结构含义 */
  var RISKY = /[&=#?%+\s\u3000-\u9fff\uff00-\uffef]/;

  function build() {
    var lines = String(input.value || "").split(/\r?\n/);
    var base = (lines.shift() || "").trim();

    if (!base) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    // 先把锚点与查询串从基础地址里摘出来 —— 顺序不能反：# 之后的东西不属于查询串
    var hash = "", query = "";
    var hi = base.indexOf("#");
    if (hi >= 0) { hash = base.slice(hi); base = base.slice(0, hi); }
    var qi = base.indexOf("?");
    if (qi >= 0) { query = base.slice(qi + 1); base = base.slice(0, qi); }

    var params = [];

    // 原有的参数：原样保留（见文件头「刻意不做的事」）
    query.split("&").filter(Boolean).forEach(function (p) {
      var i = p.indexOf("=");
      params.push({
        k: i < 0 ? p : p.slice(0, i),
        v: i < 0 ? "" : p.slice(i + 1),
        raw: p, from: "base"
      });
    });

    // 用户新加的：每行一个 key=value；没有 = 的当只有键（flag 型参数）
    lines.forEach(function (l) {
      var s = l.trim();
      if (!s || s.charAt(0) === "#") return;   // 空行与注释跳过（方便在参数中间写说明）
      var i = s.indexOf("=");
      if (i < 0) params.push({ k: s, v: "", from: "new" });
      else params.push({ k: s.slice(0, i).trim(), v: s.slice(i + 1).trim(), from: "new" });
    });

    var usePlus = !!(plusEl && plusEl.checked);
    function enc(s) {
      var e = encodeURIComponent(s);
      // + 只在表单编码里有「空格」的意思；路径里它就是加号，所以做成开关
      return usePlus ? e.replace(/%20/g, "+") : e;
    }

    var qs = params.map(function (p) {
      return p.from === "base" ? p.raw : enc(p.k) + "=" + enc(p.v);
    }).join("&");

    var url = base + (qs ? "?" + qs : "") + hash;

    var out = [url, ""];

    var fresh = params.filter(function (p) { return p.from === "new"; });
    if (fresh.length) {
      out.push(T.tableTitle + ":");
      var w = fresh.reduce(function (m, p) { return Math.max(m, p.k.length); }, 0);
      fresh.forEach(function (p) {
        var gap = new Array(Math.max(2, w - p.k.length + 2)).join(" ");
        out.push("  " + p.k + gap + p.v + "   →   " + enc(p.k) + "=" + enc(p.v));
      });
      out.push("");
    }

    // 提醒：值里有会破坏 URL 结构的字符时，明确点出来（这正是手拼最容易翻的车）
    var risky = fresh.filter(function (p) { return RISKY.exec(p.v); });
    if (risky.length) {
      out.push(fmt(T.riskyNote, { s: risky.map(function (p) { return p.k; }).join(", ") }));
      out.push("");
    }

    if (!/^https?:\/\//i.exec(base)) {
      out.push(T.schemeNote);
      out.push("");
    }

    out.push(T.rawTitle + ":");
    out.push("  " + url.length + " " + T.chars);

    output.value = out.join("\n").replace(/\n+$/, "\n");
    status.className = "status";
    status.textContent = fmt(T.statOk, { n: params.length, m: fresh.length });
  }

  input.addEventListener("input", TP.debounce(build, 150));
  if (plusEl) plusEl.addEventListener("change", build);

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
