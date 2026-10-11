/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：diff.js —— 文本对比（逐行差异）
   干什么：把两段文本左右对比，输出「哪几行删了、哪几行加了、哪几行没动」。
   两段文本怎么放进一个输入框：用一行 === 分隔（在提示里写明，也在 status 里报错提醒）。
   算法：经典的最长公共子序列（LCS）动态规划 + 回溯。
     为什么不用更花哨的 Myers diff：行数规模在几千行以内时 LCS 足够快，且实现短、出错面小。
   ⚠️ 性能护栏：LCS 的内存是 O(n×m)。两段各 5000 行就是 2500 万格 ⇒ 会吃掉几百 MB 内存。
     所以超过阈值（4096 行）就直接拒绝并提示拆分 —— 宁可不做，也不把用户的标签页搞崩。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");
  var MAX_LINES = 4096;

  var SEP = /^={3,}\s*$/;      // 分隔行：=== 或更多等号

  function split(text) {
    // 去掉末尾空行造成的一堆"假差异"（复制粘贴时最常见）
    var lines = text.replace(/\r\n?/g, "\n").split("\n");
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    return lines;
  }

  /** 行级 LCS 差异：返回 [{type:" ",line} | {type:"-",line} | {type:"+",line}] */
  function diffLines(a, b) {
    var n = a.length, m = b.length;
    // dp[i][j] = a[i..] 与 b[j..] 的最长公共子序列长度
    var dp = [];
    for (var i = 0; i <= n; i++) dp.push(new Int32Array(m + 1));
    for (var x = n - 1; x >= 0; x--) {
      for (var y = m - 1; y >= 0; y--) {
        dp[x][y] = a[x] === b[y] ? dp[x + 1][y + 1] + 1 : Math.max(dp[x + 1][y], dp[x][y + 1]);
      }
    }
    var out = [], i2 = 0, j2 = 0;
    while (i2 < n && j2 < m) {
      if (a[i2] === b[j2]) { out.push({ type: " ", line: a[i2] }); i2++; j2++; }
      else if (dp[i2 + 1][j2] >= dp[i2][j2 + 1]) { out.push({ type: "-", line: a[i2] }); i2++; }
      else { out.push({ type: "+", line: b[j2] }); j2++; }
    }
    while (i2 < n) { out.push({ type: "-", line: a[i2++] }); }
    while (j2 < m) { out.push({ type: "+", line: b[j2++] }); }
    return out;
  }

  function run() {
    var text = input.value;
    if (!text.trim()) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    var idx = -1, lines = text.replace(/\r\n?/g, "\n").split("\n");
    for (var i = 0; i < lines.length; i++) { if (SEP.test(lines[i])) { idx = i; break; } }
    if (idx < 0) {
      output.value = "";
      status.textContent = T.needSep || "need separator";
      status.className = "status err";
      return;
    }
    var left = split(lines.slice(0, idx).join("\n"));
    var right = split(lines.slice(idx + 1).join("\n"));
    if (left.length > MAX_LINES || right.length > MAX_LINES) {
      output.value = "";
      status.textContent = (T.tooMany || "too many lines") + " (" + left.length + " / " + right.length + " > " + MAX_LINES + ")";
      status.className = "status err";
      return;
    }

    var d = diffLines(left, right);
    var add = 0, del = 0, same = 0;
    var out = d.map(function (r) {
      if (r.type === "+") add++; else if (r.type === "-") del++; else same++;
      return r.type + " " + r.line;
    });
    if (out.length === 0) out.push(T.bothEmpty || "(both empty)");
    output.value = out.join("\n");
    status.textContent = "+" + add + " / -" + del + " / " + (T.sameLabel || "same") + " " + same;
    status.className = (add || del) ? "status" : "status ok";
  }

  input.addEventListener("input", TP.debounce(run, 250));
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; run(); });

  run();
})();
