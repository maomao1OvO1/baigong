/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：json-path.js —— 按路径取 JSON 里的某个值
   干什么：贴一段 JSON，写一个路径（如 data.items[0].title），把那个值单独取出来。
   为什么值得做：调试接口时，响应动不动几百行，真正要看的就一个字段；
     在线 JSONPath 工具大多要把数据发到服务器 —— 而接口响应里常常带 token 和用户信息。
   支持的写法（刻意保持简单，够用就好）：
     a.b.c        点号取属性
     a[0] / a[-1] 数组下标（负数从末尾数）
     a[*].b       数组里每一项都取 b（结果汇总成数组）
   注意：属性名带点号或空格时用引号：a["weird.key"] —— 这条最容易忘。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), path = $("path"), pretty = $("pretty"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  /** 把路径字符串切成 token 数组：a.b[0]["c.d"] → ["a","b",0,"c.d"] */
  function parsePath(p) {
    var re = /\[\s*(-?\d+|\*)\s*\]|\[\s*"([^"]*)"\s*\]|\[\s*'([^']*)'\s*\]|([^.[\]]+)/g;
    var out = [], m;
    while ((m = re.exec(p)) !== null) {
      if (m[1] !== undefined) out.push(m[1] === "*" ? "*" : parseInt(m[1], 10));
      else if (m[2] !== undefined) out.push(m[2]);
      else if (m[3] !== undefined) out.push(m[3]);
      else if (m[4] !== undefined) out.push(m[4]);
    }
    return out;
  }

  function walk(node, tokens, at) {
    if (!tokens.length) return { ok: true, value: node };
    var t = tokens[0], rest = tokens.slice(1);
    if (t === "*") {
      if (!Array.isArray(node)) return { ok: false, why: "wildcard-only-on-array" };
      var all = [];
      for (var i = 0; i < node.length; i++) {
        var r = walk(node[i], rest, at + "[" + i + "]");
        if (r.ok) all.push(r.value);
      }
      return { ok: true, value: all };
    }
    if (Array.isArray(node) && typeof t === "number") {
      var idx = t < 0 ? node.length + t : t;
      if (idx < 0 || idx >= node.length) return { ok: false, why: "index-out-of-range:" + at + "[" + t + "]" };
      return walk(node[idx], rest, at + "[" + idx + "]");
    }
    if (node && typeof node === "object" && typeof t === "string") {
      if (!(t in node)) return { ok: false, why: "key-not-found:" + at + "." + t };
      return walk(node[t], rest, at + "." + t);
    }
    return { ok: false, why: "cannot-descend:" + at };
  }

  function run() {
    var text = input.value;
    if (!text.trim()) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    var data;
    try { data = JSON.parse(text); }
    catch (e) {
      output.value = "";
      status.textContent = (T.badJson || "invalid JSON") + ": " + e.message;
      status.className = "status err";
      return;
    }
    var p = path.value.trim();
    if (!p) {
      output.value = pretty.checked ? JSON.stringify(data, null, 2) : JSON.stringify(data);
      status.textContent = T.wholeDoc || "no path — showing the whole document";
      status.className = "status";
      return;
    }
    var r = walk(data, parsePath(p), "$");
    if (!r.ok) {
      output.value = "";
      status.textContent = (T.notFound || "path not found") + " — " + r.why;
      status.className = "status err";
      return;
    }
    output.value = pretty.checked ? JSON.stringify(r.value, null, 2) : JSON.stringify(r.value);
    if (output.value === undefined) output.value = "undefined";
    status.textContent = typeof r.value === "object"
      ? (Array.isArray(r.value) ? r.value.length + " " + (T.items || "items") : (T.object || "object"))
      : (T.found || "found");
    status.className = "status ok";
  }

  input.addEventListener("input", TP.debounce(run, 200));
  path.addEventListener("input", TP.debounce(run, 150));
  pretty.addEventListener("change", run);
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; path.value = ""; run(); });

  run();
})();
