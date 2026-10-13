/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：json-format.js —— JSON 格式化 / 压缩 / 校验（本机完成）
   为什么不只用 JSON.stringify：真实场景里粘进来的一半是「坏 JSON」，
   直接抛异常只会让用户一脸问号 ⇒ 这里把错误位置一起报出来（行列号），能自己改。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), mode = $("mode"), status = $("status");

  /** 根据 JSON.parse 的报错信息估算出错位置（V8 的提示里带 "position N"） */
  function whereIsError(err, text) {
    var m = /position\s+(\d+)/i.exec(err.message);
    if (!m) return "";
    var pos = parseInt(m[1], 10);
    var before = text.slice(0, pos);
    var line = before.split("\n").length;
    var col = pos - before.lastIndexOf("\n");
    return " (line " + line + ", col " + col + ")";
  }

  function run() {
    var text = input.value;
    status.textContent = "";
    status.className = "status";
    if (!text.trim()) { output.value = ""; return; }
    try {
      var data = JSON.parse(text);
      output.value = mode.value === "minify"
        ? JSON.stringify(data)
        : JSON.stringify(data, null, 2);
      status.textContent = T.valid;
      status.classList.add("ok");
    } catch (e) {
      output.value = "";
      status.textContent = (T.invalid || "Invalid JSON: ") + e.message + whereIsError(e, text);
      status.classList.add("bad");
    }
  }

  input.addEventListener("input", TP.debounce(run, 200));
  mode.addEventListener("change", run);
  $("copy").addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  $("clear").addEventListener("click", function () {
    input.value = ""; output.value = ""; status.textContent = ""; status.className = "status";
  });

  run();
})();
