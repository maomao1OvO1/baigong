/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：timestamp.js —— Unix 时间戳 ⇄ 日期时间（本机时区与 UTC 都给出）
   为什么同时给 UTC 和本地：调试接口时看到一串 1750000000 常常对不上 ——
   服务端多半存 UTC，而人脑按本地时间思考，两边并排显示最快。
   注意：秒/毫秒自动判断（10 位当秒、13 位当毫秒），这是最容易搞错的地方。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), mode = $("mode");
  var nowBtn = $("now"), copyBtn = $("copy"), clearBtn = $("clear");

  var pad = function (n) { return String(n).padStart(2, "0"); };
  function fmt(d, utc) {
    var g = utc ? "getUTC" : "get";
    return d[g + "FullYear"]() + "-" + pad(d[g + "Month"]() + 1) + "-" + pad(d[g + "Date"]()) + " " +
      pad(d[g + "Hours"]()) + ":" + pad(d[g + "Minutes"]()) + ":" + pad(d[g + "Seconds"]());
  }

  function run() {
    var text = input.value.trim();
    if (!text) { output.value = ""; return; }
    if (mode.value === "toDate") {
      // 数字 → 日期；10 位视为秒，13 位视为毫秒
      var num = Number(text);
      if (!isFinite(num)) { output.value = ""; return; }
      var ms = Math.abs(num) < 1e11 ? num * 1000 : num;
      var d = new Date(ms);
      if (isNaN(d.getTime())) { output.value = ""; return; }
      output.value =
        (T.localTime || "Local") + "  " + fmt(d, false) + "\n" +
        "UTC    " + fmt(d, true) + "\n" +
        "ISO    " + d.toISOString() + "\n" +
        "Week   " + d.toLocaleDateString(undefined, { weekday: "long" });
    } else {
      // 日期 → 时间戳：接受 2026-10-11 12:30:45 / 2026-10-11T12:30 / 2026/10/11 等写法
      var norm = text.replace(/\//g, "-").replace(" ", "T");
      var dd = new Date(norm);
      if (isNaN(dd.getTime())) { output.value = ""; return; }
      output.value =
        "Seconds  " + Math.floor(dd.getTime() / 1000) + "\n" +
        "Millis   " + dd.getTime() + "\n" +
        "ISO      " + dd.toISOString() + "\n" +
        (T.localTime || "Local") + "  " + fmt(dd, false);
    }
  }

  input.addEventListener("input", TP.debounce(run, 150));
  mode.addEventListener("change", run);
  if (nowBtn) nowBtn.addEventListener("click", function () {
    mode.value = "toDate";
    input.value = String(Math.floor(Date.now() / 1000));
    run();
  });
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; output.value = ""; });

  run();
})();
