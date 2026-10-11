/* ============================================================================
   文件：case-converter.js —— 命名风格转换（camelCase / snake_case / kebab-case …）
   干什么：把一坨文字或变量名转成各种编程命名风格，一行输入对应一段输出。
   为什么不用"简单替换"糊弄：真正的难点是**分词** —— helloWorld 要拆成 hello + world，
     HTTPServer 要拆成 HTTP + Server（不能拆成 H T T P Server）。
     下面这两条正则就是干这个的，顺序不能换（先拆小写接大写，再拆连续大写接词首大写）。
   中文怎么办：中文没有大小写，分词时整段保留；camelCase 这类风格对中文不产生变化，
     这是正常的 —— 中文命名本来就不适用驼峰。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), style = $("style"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  /** 分词：把任意写法拆成单词数组 */
  function words(s) {
    return s
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")          // helloWorld → hello World
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")       // HTTPServer → HTTP Server
      .split(/[^0-9A-Za-z\u4e00-\u9fa5]+/)             // 其余分隔符（含下划线、连字符、点）
      .filter(function (w) { return w.length > 0; });
  }
  var cap = function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); };
  var low = function (w) { return w.toLowerCase(); };

  var STYLES = {
    camel:    function (w) { return w.length ? w[0].toLowerCase() + w.slice(1).map(cap).join("") : ""; },
    pascal:   function (w) { return w.map(cap).join(""); },
    snake:    function (w) { return w.map(low).join("_"); },
    kebab:    function (w) { return w.map(low).join("-"); },
    constant: function (w) { return w.map(function (x) { return x.toUpperCase(); }).join("_"); },
    dot:      function (w) { return w.map(low).join("."); },
    title:    function (w) { return w.map(cap).join(" "); },
    screaming: function (w) { return w.map(function (x) { return x.toUpperCase(); }).join("-"); },
  };
  var ORDER = ["camel", "pascal", "snake", "kebab", "constant", "dot", "title", "screaming"];
  var LABEL = { camel: "camelCase", pascal: "PascalCase", snake: "snake_case", kebab: "kebab-case",
                constant: "CONSTANT_CASE", dot: "dot.case", title: "Title Case", screaming: "SCREAMING-KEBAB" };

  function run() {
    var text = input.value;
    if (!text.trim()) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    var lines = text.replace(/\r\n?/g, "\n").split("\n").filter(function (l) { return l.trim() !== ""; });
    var blocks = lines.map(function (line) {
      var w = words(line.trim());
      if (style.value !== "all") return STYLES[style.value](w);
      return ORDER.map(function (k) {
        var v = STYLES[k](w);
        return "  " + (LABEL[k] + "            ").slice(0, 16) + v;
      }).join("\n");
    });
    output.value = blocks.join(style.value === "all" ? "\n\n" : "\n");
    status.textContent = lines.length + " " + (T.linesUnit || "lines");
    status.className = "status ok";
  }

  input.addEventListener("input", TP.debounce(run, 150));
  style.addEventListener("change", run);
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; run(); });

  run();
})();
