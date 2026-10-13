/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：regex.js —— 正则测试器（实时匹配 + 捕获组 + 替换预览）
   干什么：左边写正则、写测试文本，右边列出每一处匹配的位置与捕获组，并给出替换后的结果。
   为什么值得自己做一个：在线正则站的通病是「把文本发到服务器」，而正则里常常带着
     真实的日志、URL、手机号 —— 这里全程在本机跑，一句话都不会外传。
   注意（三条坑）：
     ① 用户写错正则会抛异常 —— 必须 try/catch，把错误显示出来（不显示的话页面看起来像卡死）；
     ② 没有 g 标志时必须自己推进 lastIndex，否则 exec 永远返回第一处，循环停不下来；
     ③ 灾难性回溯（如 (a+)+$）能把标签页卡死 —— 所以匹配条数设了上限，超过就停手并提示。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var pattern = $("pattern"), replace = $("replace");
  var cbG = $("cbG"), cbI = $("cbI"), cbM = $("cbM"), cbS = $("cbS"), cbU = $("cbU");
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  var MAX_MATCH = 500;      // 匹配上限：防灾难性回溯/海量匹配把页面拖死
  var MAX_TEXT = 200000;    // 文本上限：同上

  function flags() {
    return (cbG.checked ? "g" : "") + (cbI.checked ? "i" : "") + (cbM.checked ? "m" : "") +
           (cbS.checked ? "s" : "") + (cbU.checked ? "u" : "");
  }

  function run() {
    var pat = pattern.value, text = input.value;
    output.value = "";
    if (!pat) { status.textContent = ""; status.className = "status"; return; }
    if (text.length > MAX_TEXT) {
      status.textContent = (T.tooLong || "text too long") + " (" + text.length + " > " + MAX_TEXT + ")";
      status.className = "status err";
      return;
    }

    var re;
    try {
      re = new RegExp(pat, flags());
    } catch (e) {
      status.textContent = (T.badRegex || "invalid regex") + ": " + e.message;
      status.className = "status err";
      return;
    }

    var lines = [], count = 0, truncated = false;
    var lineOf = (function () {
      // 把「字符下标」换算成「第几行第几列」—— 对着大段日志找匹配位置时，行号比下标有用得多
      var starts = [0];
      for (var i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
      return function (idx) {
        var lo = 0, hi = starts.length - 1;
        while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; }
        return (lo + 1) + ":" + (idx - starts[lo] + 1);
      };
    })();

    if (re.global) {
      var m;
      while ((m = re.exec(text)) !== null) {
        count++;
        lines.push("#" + count + "  " + lineOf(m.index) + "  [" + m.index + ", " + (m.index + m[0].length) + ")  " + JSON.stringify(m[0]));
        for (var gi = 1; gi < m.length; gi++) {
          if (m[gi] !== undefined) lines.push("      $" + gi + " = " + JSON.stringify(m[gi]));
        }
        if (m[0] === "") re.lastIndex++;            // 空匹配必须手动推进，否则死循环
        if (count >= MAX_MATCH) { truncated = true; break; }
      }
    } else {
      var one = re.exec(text);
      if (one) {
        count = 1;
        lines.push("#1  " + lineOf(one.index) + "  [" + one.index + ", " + (one.index + one[0].length) + ")  " + JSON.stringify(one[0]));
        for (var g2 = 1; g2 < one.length; g2++) {
          if (one[g2] !== undefined) lines.push("      $" + g2 + " = " + JSON.stringify(one[g2]));
        }
      }
    }

    var head = (T.summary || "matches") + ": " + count + (truncated ? " (+)" : "") + "\n" + new Array(29).join("─") + "\n";
    var body = lines.length ? lines.join("\n") : (T.noMatch || "(no match)");

    if (replace.value !== "") {
      var replaced;
      try {
        // 替换时一律带 g（replace 的常规预期是"全部替换"，这是和 match 不一样的地方）
        var reAll = new RegExp(pat, flags().replace("g", "") + "g");
        replaced = text.replace(reAll, replace.value);
      } catch (e2) {
        replaced = (T.replaceError || "(replace error: ") + e2.message + ")";
      }
      body += "\n\n" + (T.replaced || "replaced") + "\n" + new Array(29).join("─") + "\n" + replaced;
    }

    output.value = head + body;
    if (truncated) {
      status.textContent = (T.truncated || "stopped at limit") + " " + MAX_MATCH;
      status.className = "status err";
    } else if (count === 0) {
      status.textContent = T.noMatch || "(no match)";
      status.className = "status";
    } else {
      status.textContent = (T.summary || "matches") + ": " + count;
      status.className = "status ok";
    }
  }

  function bind(el) { if (el) el.addEventListener("input", TP.debounce(run, 150)); }
  bind(pattern); bind(replace); bind(input);
  [cbG, cbI, cbM, cbS, cbU].forEach(function (el) { if (el) el.addEventListener("change", run); });
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () {
    input.value = ""; pattern.value = ""; replace.value = ""; run();
  });

  run();
})();
