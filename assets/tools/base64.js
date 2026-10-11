/* ============================================================================
   文件：base64.js —— Base64 编码 / 解码（UTF-8 安全，纯文本，零上传）
   为什么不用裸 btoa/atob：它们只认 Latin-1，中文/日文/emoji 会直接报错。
   正确姿势：先用 TextEncoder 转字节，再逐字节 btoa；解码反过来走 TextDecoder。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), mode = $("mode");

  /** 字符串 → Base64（UTF-8 安全） */
  function encode(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  /** Base64 → 字符串（UTF-8 安全），失败抛出（由调用方提示） */
  function decode(b64) {
    var bin = atob(b64.replace(/\s+/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }

  function run() {
    var text = input.value;
    if (!text) { output.value = ""; return; }
    try {
      output.value = mode.value === "encode" ? encode(text) : decode(text);
      output.classList.remove("bad");
    } catch (e) {
      output.value = "";
      output.classList.add("bad");
      TP.toast(T.badBase64 || "Invalid Base64 input");
    }
  }

  input.addEventListener("input", TP.debounce(run, 120));
  mode.addEventListener("change", run);
  $("copy").addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  $("swap").addEventListener("click", function () {
    var t = input.value; input.value = output.value; output.value = t;
    mode.value = mode.value === "encode" ? "decode" : "encode";
    run();
  });
  $("clear").addEventListener("click", function () { input.value = ""; output.value = ""; output.classList.remove("bad"); });

  run();
})();
