/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：url-parser.js —— URL 拆解（协议 / 主机 / 路径 / 查询参数逐条）
   干什么：把一个 URL 拆成它真正的组成部分，查询参数逐条列出来（可解码、可读）。
   为什么值得拆开看：带参数的长链接里，问题几乎都在查询串 —— 少一个 &、多一个编码、
     参数名拼错、或者 # 出现在 ? 前面导致整个查询串被当成锚点。逐条列出来一眼就能看见。
   关于 new URL()：它按 WHATWG 标准解析，会把中文域名转成 punycode、把非法字符百分号编码 ——
     这是正常行为（浏览器请求时就是这么发的），所以"输入和显示的路径不一样"不一定是 bug。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), decode = $("decode"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  function run() {
    var raw = input.value.trim();
    if (!raw) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    var u;
    try {
      u = new URL(raw);
    } catch (e) {
      output.value = "";
      status.textContent = T.badUrl || "not a valid absolute URL (needs http:// or https://)";
      status.className = "status err";
      return;
    }
    var want = decode.checked;
    var dec = function (s) { if (!want) return s; try { return decodeURIComponent(s.replace(/\+/g, " ")); } catch (e2) { return s; } };

    var rows = [
      [T.pProtocol || "Protocol", u.protocol.replace(":", "")],
      [T.pHost || "Host", u.hostname],
      [T.pPort || "Port", u.port || (u.protocol === "https:" ? "(default 443)" : "(default 80)")],
      [T.pPath || "Path", dec(u.pathname) || "/"]
    ];
    if (u.username) rows.push([T.pUser || "Username", u.username]);
    if (u.password) rows.push([T.pPass || "Password", "•••••• (in URL — avoid this)"]);
    if (u.hash) rows.push([T.pHash || "Fragment", dec(u.hash.slice(1))]);

    var lines = rows.map(function (r) { return (r[0] + "            ").slice(0, 12) + r[1]; });
    var params = [];
    /* ⚠️ 这里刻意**不用** URLSearchParams：它在遍历时就会把值解码一次，
       于是「百分号解码」这个开关永远显示已解码的样子 —— 关了也没用。
       要保留「原样 vs 解码后」的区别，就得自己按 & 与 = 切。 */
    var rawQuery = u.search.replace(/^\?/, "");
    if (rawQuery) {
      rawQuery.split("&").forEach(function (kv) {
        if (!kv) return;
        var eq = kv.indexOf("=");
        var k = eq < 0 ? kv : kv.slice(0, eq);
        var v = eq < 0 ? "" : kv.slice(eq + 1);
        params.push([dec(k), dec(v)]);
      });
    }
    lines.push("");
    lines.push((T.pQuery || "Query parameters") + " (" + params.length + ")");
    lines.push("──────────────");
    if (!params.length) {
      lines.push("(" + (T.pNoQuery || "none") + ")");
    } else {
      params.forEach(function (p, i) {
        lines.push((i + 1) + ". " + p[0] + "  =  " + dec(p[1]));
      });
    }
    output.value = lines.join("\n");
    status.textContent = params.length + " " + (T.pCount || "parameters") + " · " + (T.pHost || "host") + " " + u.hostname;
    status.className = "status ok";
  }

  input.addEventListener("input", TP.debounce(run, 200));
  decode.addEventListener("change", run);
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; run(); });

  run();
})();
