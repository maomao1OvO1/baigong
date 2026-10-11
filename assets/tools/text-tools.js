/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：text-tools.js —— 文本处理合集（大小写 / 反序 / 去空格 / 去重 / 排序 / 统计）
   为什么合在一个页面：这些都是「一句话就能做完」的小操作，分成七个页面反而
   每个页面都又薄又难被搜到。合起来一页，关键词更集中，用户也不用跳来跳去。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), action = $("action"), status = $("status");

  function lines(text) { return text.split(/\r?\n/); }

  var actions = {
    upper: function (t) { return t.toUpperCase(); },
    lower: function (t) { return t.toLowerCase(); },
    title: function (t) {
      return t.toLowerCase().replace(/(^|\s)(\S)/g, function (m, sp, ch) { return sp + ch.toUpperCase(); });
    },
    reverse: function (t) { return t.split("").reverse().join(""); },
    trim: function (t) { return lines(t).map(function (l) { return l.trim(); }).join("\n"); },
    dedup: function (t) {
      var seen = {}, out = [];
      lines(t).forEach(function (l) { var k = l.trim(); if (k && !seen[k]) { seen[k] = 1; out.push(k); } });
      return out.join("\n");
    },
    sort: function (t) {
      return lines(t).filter(function (l) { return l.trim(); })
        .sort(function (a, b) { return a.localeCompare(b); }).join("\n");
    },
    count: function (t) {
      var chars = t.length;
      var noSpace = t.replace(/\s/g, "").length;
      var words = (t.match(/\S+/g) || []).length;
      var ln = t.trim() ? lines(t).length : 0;
      return (T.countChars || "Characters") + ": " + chars + "\n" +
             (T.countNoSpace || "Without spaces") + ": " + noSpace + "\n" +
             (T.countWords || "Words") + ": " + words + "\n" +
             (T.countLines || "Lines") + ": " + ln;
    }
  };

  function run() {
    var fn = actions[action.value] || actions.upper;
    var text = input.value;
    output.value = text ? fn(text) : "";
    status.textContent = text ? "" : (T.emptyHint || "");
  }

  input.addEventListener("input", TP.debounce(run, 150));
  action.addEventListener("change", run);
  $("copy").addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  $("clear").addEventListener("click", function () { input.value = ""; output.value = ""; });

  run();
})();
