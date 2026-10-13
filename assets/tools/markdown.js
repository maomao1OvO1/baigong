/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：markdown.js —— Markdown 转 HTML（迷你解析器，零依赖）
   干什么：把一小段 Markdown 转成 HTML 源码，粘到博客/邮件/论坛里直接能用。
   为什么自己写：引一个 markdown 库动辄几十 KB，而日常要转的就是标题、粗斜体、链接、
     列表、引用、代码这几样 —— 自己实现一份两百行内，还能顺带把"为什么这样转"讲清楚。
   注意（三条）：
     ① 先转义 HTML 再解析语法 —— 顺序反了的话，用户写的 <script> 会直接变成真标签（XSS）；
     ② 行内语法用正则一次过，但**代码块必须先抽出来占位**，否则里面的 * 和 _ 会被当成强调符号；
     ③ 支持范围是常用子集（不是完整 CommonMark），页面上如实说明，别让人以为它什么都能转。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  var esc = function (s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };

  /** 行内语法：代码 > 粗体 > 斜体 > 删除线 > 链接 */
  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, function (m, c) { return "<code>" + c + "</code>"; })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  }

  function toHtml(md) {
    var lines = md.replace(/\r\n?/g, "\n").split("\n");
    var out = [], listType = null, inCode = false, codeBuf = [], quoteBuf = [];

    function closeList() { if (listType) { out.push(listType === "ul" ? "</ul>" : "</ol>"); listType = null; } }
    function closeQuote() { if (quoteBuf.length) { out.push("<blockquote>" + inline(quoteBuf.join(" ")) + "</blockquote>"); quoteBuf = []; } }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      // 代码块：原样保留，里面的符号不许参与解析
      if (/^\s*```/.test(line)) {
        if (inCode) { out.push("<pre><code>" + esc(codeBuf.join("\n")) + "</code></pre>"); codeBuf = []; inCode = false; }
        else { closeList(); closeQuote(); inCode = true; }
        continue;
      }
      if (inCode) { codeBuf.push(line); continue; }

      var h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) { closeList(); closeQuote(); out.push("<h" + h[1].length + ">" + inline(esc(h[2])) + "</h" + h[1].length + ">"); continue; }

      if (/^\s*([-*_])\s*\1\s*\1\s*$/.test(line)) { closeList(); closeQuote(); out.push("<hr>"); continue; }

      var q = /^>\s?(.*)$/.exec(line);
      if (q) { closeList(); quoteBuf.push(q[1]); continue; }
      closeQuote();

      var ul = /^\s*[-*+]\s+(.*)$/.exec(line);
      var ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
      if (ul || ol) {
        var want = ul ? "ul" : "ol";
        if (listType !== want) { closeList(); out.push(want === "ul" ? "<ul>" : "<ol>"); listType = want; }
        out.push("<li>" + inline(esc(ul ? ul[1] : ol[1])) + "</li>");
        continue;
      }
      closeList();

      if (line.trim() === "") { out.push(""); continue; }
      out.push("<p>" + inline(esc(line)) + "</p>");
    }
    if (inCode && codeBuf.length) out.push("<pre><code>" + esc(codeBuf.join("\n")) + "</code></pre>");
    closeList();
    closeQuote();
    return out.filter(function (l, idx, arr) { return !(l === "" && arr[idx - 1] === ""); }).join("\n");
  }

  function run() {
    var md = input.value;
    if (!md.trim()) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    output.value = toHtml(md);
    status.textContent = md.split("\n").length + " " + (T.linesIn || "lines in") + " → " +
      output.value.split("\n").length + " " + (T.linesOut || "lines out");
    status.className = "status ok";
  }

  input.addEventListener("input", TP.debounce(run, 200));
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; run(); });

  run();
})();
