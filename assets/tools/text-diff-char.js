/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：text-diff-char.js —— 字符级文本对比
   干什么：两段文本放在一个框里（中间用一行 `===` 分隔），逐**字符**对比，
          把改动标出来：`[-删掉的-]` 与 `{+新增的+}`。

   与本站的逐行对比（diff）有什么不同：
     · 逐行对比回答「哪几行变了」；字符级回答「这一行里到底改了哪几个字」。
     · 改一个标点、换一个错别字、把全角半角换掉 —— 这些在行级视角里是「整行变了」，
       在这里能精确指出位置。

   实现说明：
     · 用的是最长公共子序列（LCS）回溯，结果稳定、不依赖启发式；
     · 先裁掉两端的公共部分再算中间 —— 长文里往往只有一小段不同，
       不裁剪的话白白算一大张表；
     · ⚠️ LCS 的代价是 O(n×m)，所以**设了长度上限**（超过就明确拒绝并建议用逐行对比），
       而不是让页面卡死在那儿转圈。诚实说不做，比假装能做然后卡住强。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  // 两段各自超过这个长度就拒绝（LCS 的 n×m 会迅速吃掉内存与时间）
  var MAX = 4000;

  function fmt(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  /** 拆成左右两段：第一行 `===`（3 个以上等号）为界，与逐行对比工具保持一致的约定 */
  function splitTwo(text) {
    var lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    for (var i = 0; i < lines.length; i++) {
      if (/^={3,}\s*$/.test(lines[i])) {
        return { left: lines.slice(0, i).join("\n"), right: lines.slice(i + 1).join("\n") };
      }
    }
    return null;
  }

  /** LCS 回溯：返回操作序列 [{t:"=" | "-" | "+", c:字符}] */
  function diffChars(a, b) {
    var n = a.length, m = b.length;

    // dp[i][j] = a[i..] 与 b[j..] 的最长公共子序列长度（从后往前填）
    var dp = [];
    for (var i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
    for (i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        dp[i][j] = a.charAt(i) === b.charAt(j)
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    var ops = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (a.charAt(i) === b.charAt(j)) { ops.push({ t: "=", c: a.charAt(i) }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: "-", c: a.charAt(i) }); i++; }
      else { ops.push({ t: "+", c: b.charAt(j) }); j++; }
    }
    while (i < n) ops.push({ t: "-", c: a.charAt(i++) });
    while (j < m) ops.push({ t: "+", c: b.charAt(j++) });
    return ops;
  }

  /** 把操作序列渲染成带标记的文本（连续的同类操作合并成一个标记块） */
  function render(ops) {
    var out = "", buf = "", kind = null;

    function flush() {
      if (!buf) return;
      if (kind === "=") out += buf;
      else if (kind === "-") out += "[-" + buf + "-]";
      else out += "{+" + buf + "+}";
      buf = "";
    }

    ops.forEach(function (op) {
      if (op.t !== kind) { flush(); kind = op.t; }
      buf += op.c;
    });
    flush();
    return out;
  }

  function build() {
    var raw = input.value;
    if (!raw.trim()) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    var parts = splitTwo(raw);
    if (!parts) {
      output.value = "";
      status.className = "status err";
      status.textContent = T.errNeedSep || "";
      return;
    }

    var a = parts.left, b = parts.right;

    if (a.length > MAX || b.length > MAX) {
      output.value = "";
      status.className = "status err";
      status.textContent = fmt(T.errTooLong, { n: MAX, a: a.length, b: b.length });
      return;
    }

    /* 先裁掉公共前缀与后缀：长文里往往只有中间一小段不同，
       不裁的话要算一整张 n×m 的表，白白慢一截。 */
    var pre = 0;
    while (pre < a.length && pre < b.length && a.charAt(pre) === b.charAt(pre)) pre++;
    var suf = 0;
    while (suf < a.length - pre && suf < b.length - pre &&
           a.charAt(a.length - 1 - suf) === b.charAt(b.length - 1 - suf)) suf++;

    var midA = a.slice(pre, a.length - suf);
    var midB = b.slice(pre, b.length - suf);
    var ops = diffChars(midA, midB);

    var removed = 0, added = 0, same = pre + suf;
    ops.forEach(function (op) {
      if (op.t === "-") removed++;
      else if (op.t === "+") added++;
      else same++;
    });

    var marked = a.slice(0, pre) + render(ops) + (suf ? a.slice(a.length - suf) : "");
    var total = Math.max(a.length, b.length);
    var similarity = total ? Math.round((same / total) * 100) : 100;

    var out = [];
    out.push(marked);
    out.push("");
    out.push(fmt(T.statOk, { r: removed, a: added, s: similarity }));
    out.push(T.legend);

    output.value = out.join("\n");
    status.className = "status";
    status.textContent = removed || added
      ? fmt(T.summaryChanged, { r: removed, a: added })
      : T.summarySame;
  }

  input.addEventListener("input", TP.debounce(build, 200));

  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      if (!output.value) { TP.toast(T.nothingToCopy); return; }
      TP.copy(output.value).then(function () { TP.toast(T.copied); },
        function () { TP.toast(T.copyFail); });
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      input.value = "";
      build();
      input.focus();
    });
  }

  build();
})();
