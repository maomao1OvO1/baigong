/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：string-escape.js —— 字符串转义（JSON / JS / SQL / HTML / URL / 正则）
   干什么：把一段文本按目标语言的规则转义，或者反过来解回原文。
   为什么需要它：同一个字符串在六种地方有六种写法 —— 手写最容易漏的是这几处：
     · JSON 里不能有裸换行（必须 \n），也不能有未转义的双引号；
     · SQL 里单引号要写成两个单引号（'' 而不是 \'）；
     · 正则里 . * + ? ( ) [ ] { } ^ $ | \ 全都要加反斜杠。
   注意：这里的 SQL 转义只是**拼字符串时别写错**用的，防注入要靠参数化查询 ——
     页面提示里专门写了这一句，别让人误以为"转义了就等于安全"。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), mode = $("mode"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear"), swapBtn = $("swap");

  var M = {
    json: {
      enc: function (s) { return JSON.stringify(s).slice(1, -1); },
      // 直接塞进 JSON.parse —— 内容本身已经是转义态（含 \" 与 \n）。
      // ⚠️ 曾经在这里先把 " 替换成 \" 再 parse，结果已转义的引号被二次转义，往返就对不上了。
      dec: function (s) { return JSON.parse('"' + s + '"'); },
    },
    js: {
      enc: function (s) {
        return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
          .replace(/'/g, "\\'").replace(/"/g, '\\"');
      },
      dec: function (s) { return s.replace(/\\(.)/g, function (m, c) { return { n: "\n", r: "\r", t: "\t" }[c] || c; }); },
    },
    sql: {
      enc: function (s) { return s.replace(/'/g, "''"); },
      dec: function (s) { return s.replace(/''/g, "'"); },
    },
    html: {
      enc: function (s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); },
      dec: function (s) {
        return s.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, function (m) {
          return { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'" }[m];
        });
      },
    },
    url: {
      enc: function (s) { return encodeURIComponent(s); },
      dec: function (s) { try { return decodeURIComponent(s); } catch (e) { return "(invalid percent-encoding)"; } },
    },
    regex: {
      enc: function (s) { return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"); },
      dec: function (s) { return s.replace(/\\(.)/g, "$1"); },
    },
  };

  var dir = { mode: null };
  function run() {
    var text = input.value;
    if (!text) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    var isDecode = mode.value.indexOf("dec") > 0;
    var key = mode.value.replace(/-?(enc|dec)$/, "");
    var fn = M[key] && M[key][isDecode ? "dec" : "enc"];
    if (!fn) { output.value = ""; status.textContent = T.badMode || "pick a format"; status.className = "status err"; return; }
    try {
      output.value = fn(text);
      var changed = output.value !== text;
      status.textContent = isDecode ? (T.decoded || "decoded") : (changed ? (T.escaped || "escaped") : (T.noChange || "nothing to escape"));
      status.className = "status ok";
    } catch (e) {
      output.value = "";
      status.textContent = (T.fail || "failed") + ": " + e.message;
      status.className = "status err";
    }
  }

  input.addEventListener("input", TP.debounce(run, 150));
  mode.addEventListener("change", run);
  if (swapBtn) swapBtn.addEventListener("click", function () {
    if (!output.value) return;
    input.value = output.value;
    mode.value = mode.value.indexOf("-enc") > 0 ? mode.value.replace("-enc", "-dec") : mode.value.replace("-dec", "-enc");
    run();
  });
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; output.value = ""; status.textContent = ""; });

  run();
})();
