/* ============================================================================
   文件：url-codec.js —— URL 编码 / 解码（Component 与 整条 URL 两种模式）
   为什么分两种模式：这是最常见的混淆点 ——
     · encodeURIComponent：把 "/" ":" "?" "&" 这些也编码，适合「作为参数值」；
     · encodeURI：保留 URL 结构字符，适合「整条网址」。
   用错就会出现"我明明编码了，链接还是打不开/参数被截断"。所以这里让你选，并写清区别。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), mode = $("mode"), scope = $("scope"), status = $("status");

  function run() {
    var text = input.value;
    status.textContent = "";
    status.className = "status";
    if (!text) { output.value = ""; return; }
    var component = scope.value === "component";
    try {
      if (mode.value === "encode") {
        output.value = component ? encodeURIComponent(text) : encodeURI(text);
      } else {
        output.value = component ? decodeURIComponent(text) : decodeURI(text);
      }
    } catch (e) {
      output.value = "";
      status.textContent = T.badUri || "Invalid URI";
      status.classList.add("bad");
    }
  }

  input.addEventListener("input", TP.debounce(run, 120));
  mode.addEventListener("change", run);
  scope.addEventListener("change", run);
  $("copy").addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  $("swap").addEventListener("click", function () {
    var t = input.value; input.value = output.value; output.value = t;
    mode.value = mode.value === "encode" ? "decode" : "encode";
    run();
  });
  $("clear").addEventListener("click", function () { input.value = ""; output.value = ""; status.textContent = ""; });

  run();
})();
