/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：http-status.js —— HTTP 状态码速查
   干什么：输入一个码（如 429），说清它是什么意思、谁的责任、通常怎么处理；留空则列出全部。
   为什么值得做成工具：日志里蹦出一个 4xx/5xx 时，第一反应是"这是谁的问题" ——
     是客户端发错了（4xx），还是服务端扛不住（5xx）？这一条直接决定你该改代码还是该扩容。
   数据说明：收集的是常见码（含一堆非官方但广泛使用的，如 418/451/499/599），
     非官方的那几个会明确标出来，免得你以为它们写在 RFC 里。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  /* [码, 名称, 责任方键, 官方?]
     ⚠️ 名称保留英文（Continue / Not Found …）—— 这是**专业名词**，三语都该原样显示，
     翻了反而没人认（毛毛 2026-10-12：「像专业名词这么写的，你就别翻译了」）。
     说明与责任方的文字全部走 window.T（三语），脚本里不留任何自然语言。 */
  var CODES = [
    [100, "Continue", "protocol", true],
    [101, "Switching Protocols", "protocol", true],
    [200, "OK", "normal", true],
    [201, "Created", "normal", true],
    [202, "Accepted", "normal", true],
    [204, "No Content", "normal", true],
    [206, "Partial Content", "normal", true],
    [301, "Moved Permanently", "redirect", true],
    [302, "Found", "redirect", true],
    [304, "Not Modified", "normal", true],
    [307, "Temporary Redirect", "redirect", true],
    [308, "Permanent Redirect", "redirect", true],
    [400, "Bad Request", "client", true],
    [401, "Unauthorized", "client", true],
    [403, "Forbidden", "client", true],
    [404, "Not Found", "client", true],
    [405, "Method Not Allowed", "client", true],
    [406, "Not Acceptable", "both", true],
    [408, "Request Timeout", "client", true],
    [409, "Conflict", "client", true],
    [410, "Gone", "client", true],
    [412, "Precondition Failed", "client", true],
    [413, "Payload Too Large", "client", true],
    [414, "URI Too Long", "client", true],
    [415, "Unsupported Media Type", "client", true],
    [418, "I'm a teapot", "easter", false],
    [422, "Unprocessable Entity", "client", true],
    [425, "Too Early", "client", true],
    [426, "Upgrade Required", "client", true],
    [428, "Precondition Required", "client", true],
    [429, "Too Many Requests", "client", true],
    [431, "Request Header Fields Too Large", "client", true],
    [451, "Unavailable For Legal Reasons", "legal", true],
    [499, "Client Closed Request", "client", false],
    [500, "Internal Server Error", "server", true],
    [501, "Not Implemented", "server", true],
    [502, "Bad Gateway", "server", true],
    [503, "Service Unavailable", "server", true],
    [504, "Gateway Timeout", "server", true],
    [505, "HTTP Version Not Supported", "server", true],
    [507, "Insufficient Storage", "server", true],
    [508, "Loop Detected", "server", true],
    [511, "Network Authentication Required", "network", true],
    [599, "Network Connect Timeout", "network", false],
  ];


  /** 责任方文案（走三语）；英文名那列永远是英文，因为它是术语 */
  function famOf(row) {
    var f = (T.fam || {})[row[2]];
    return f || row[2];
  }

  function family(code) {
    if (code >= 100 && code < 200) return "1xx";
    if (code >= 200 && code < 300) return "2xx";
    if (code >= 300 && code < 400) return "3xx";
    if (code >= 400 && code < 500) return "4xx";
    if (code >= 500 && code < 600) return "5xx";
    return "?";
  }

  function run() {
    var raw = input.value.trim();
    if (!raw) {
      // 留空：按类别列出全部（当作速查表用）
      var out = [], last = "";
      CODES.forEach(function (c) {
        var f = family(c[0]);
        if (f !== last) { out.push(""); out.push("── " + f + " ──"); last = f; }
        out.push(c[0] + "  " + (c[1] + "                        ").slice(0, 24) + famOf(c));
      });
      output.value = out.join("\n").replace(/^\n/, "");
      status.textContent = CODES.length + " " + (T.codes || "codes");
      status.className = "status ok";
      return;
    }
    var code = parseInt(raw, 10);
    if (isNaN(code)) {
      output.value = "";
      status.textContent = T.badCode || "enter a numeric status code";
      status.className = "status err";
      return;
    }
    var hit = CODES.filter(function (c) { return c[0] === code; })[0];
    if (!hit) {
      output.value = (T.unknownCode || "No standard meaning for this code") + " (" + family(code) + ")";
      status.textContent = family(code);
      status.className = "status err";
      return;
    }
    output.value = [
      code + " " + hit[1] + (hit[3] ? "" : "   " + (T.nonStandard || "(not in the RFC)")),
      "",
      (T.codes && T.codes[code]) || "",
      "",
      (T.responsible || "Whose problem") + ": " + famOf(hit),
    ].join("\n");
    status.textContent = code + " " + family(code);
    status.className = "status ok";
  }

  input.addEventListener("input", TP.debounce(run, 150));
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; run(); });

  run();
})();
