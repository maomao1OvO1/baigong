/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：md-toc.js —— Markdown 目录（TOC）生成器
   干什么：把一篇 Markdown 里的标题扒出来，生成一份带锚点链接的目录。

   为什么值得做成工具：
     ① README、文档站几乎都要目录，手写一遍还得自己数层级；改个标题整份就废了；
     ② **锚点规则不是「标题原文」** —— 这是最容易白干的一步：GitHub 会把标题转小写、
        去掉标点、空格换成连字符，**重名标题还会自动加 -1**。不知道这条的人写出来的
        目录，点十次有九次点不动（页面只是跳不到，却不报错，很难查）；
     ③ 代码块里也有以 # 开头的行（shell 注释、Python 注释、配置注释），
        直接按「行首是 #」匹配会把它们全当成标题 —— 目录里立刻多出一堆看不懂的条目。
        本工具会先跳过 ``` 与 ~~~ 围栏内的内容。

   锚点规则按 GitHub 的实际行为实现（也是这套规则最通用的地方）：
     转小写 → 去掉标点与 emoji（**中文、日文、韩文原样保留**）→ 每个空格换成一个连字符
     → 重名依次加 -1、-2。

   提醒：不同平台（GitLab、语雀、Notion）的锚点规则不完全一样。本工具按 GitHub 走，
        粘到别处如果点不动，多半就是那家的规则不同 —— 这不是本工具算错了。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");
  var styleEl = $("liststyle"), linksEl = $("links"), depthEl = $("maxdepth");

  function fmt(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  /** 把标题里的行内标记去掉，只留纯文字 —— 锚点是从**渲染后的文字**算的，
   *  带着 ** 和 ` 去算必然对不上（这是第二个常见的点不动原因）。 */
  function plainText(s) {
    return String(s)
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")   // 图片 → alt 文字
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")    // 链接 → 链接文字
      .replace(/`([^`]*)`/g, "$1")                // 行内代码 → 内容
      .replace(/(\*\*|__)(.*?)\1/g, "$2")         // 粗体
      .replace(/(\*|_)(.*?)\1/g, "$2")            // 斜体
      .replace(/~~(.*?)~~/g, "$1")                // 删除线
      .replace(/<[^>]+>/g, "")                    // 内嵌 HTML 标签
      .trim();
  }

  /** GitHub 风格的锚点。
   *  ⚠️ 保留范围要写准：\w 只覆盖 ASCII，中日韩文字得单独列出来 —— 用 \W 一把梭会把
   *  「中文标题」整个删成空字符串，生成的链接变成 `#`，点了原地不动。 */
  function slugify(text, seen) {
    var s = String(text).toLowerCase()
      .replace(/[^\w\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\s-]/g, "")
      .replace(/\s/g, "-");   // 每个空格换一个连字符（GitHub 不合并连续空格）

    var base = s, n = 1;
    while (seen[s]) { s = base + "-" + n; n++; }
    seen[s] = 1;
    return s;
  }

  /** 抽出所有标题：跳过围栏代码块里的假标题 */
  function headings(md) {
    var lines = String(md || "").split(/\r?\n/);
    var out = [];
    var fence = null;   // 当前围栏标记（``` 或 ~~~），null 表示不在代码块里

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // 围栏开关：``` 或 ~~~ 开头（后面可以跟语言名）。开着就跳过，关掉继续认标题
      var f = /^\s*(`{3,}|~{3,})/.exec(line);
      if (f) {
        var mark = f[1].charAt(0);
        if (!fence) fence = mark;
        else if (fence === mark) fence = null;
        continue;
      }
      if (fence) continue;

      // ATX 标题：# 到 ######，后面必须有空格；行尾那串 # 是装饰，要去掉
      var m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (!m) continue;

      var text = plainText(m[2]);
      if (text) out.push({ level: m[1].length, text: text });
    }
    return out;
  }

  /** 主流程：抽标题 → 归一化层级 → 输出目录 */
  function build() {
    var hs = headings(input.value);

    if (!hs.length) {
      output.value = "";
      status.className = "status";
      status.textContent = input.value.trim() ? (T.statNone || "") : (T.statEmpty || "");
      return;
    }

    var maxDepth = depthEl ? parseInt(depthEl.value, 10) || 3 : 3;
    var useLinks = !linksEl || linksEl.checked;
    var ordered = styleEl && styleEl.value === "number";

    // 层级按**最小**标题对齐：文档从 ## 开始时，不这么干会整体多缩进一层
    var minLevel = hs[0].level;
    hs.forEach(function (h) { if (h.level < minLevel) minLevel = h.level; });

    var seen = Object.create(null);
    var counters = [0, 0, 0, 0, 0, 0, 0];   // 有序列表每层各自计数
    var out = [];
    var deepest = 0, shown = 0;

    hs.forEach(function (h) {
      var depth = h.level - minLevel + 1;
      if (depth > maxDepth) return;

      var slug = slugify(h.text, seen);
      var indent = new Array((depth - 1) * 2 + 1).join(" ");

      var bullet;
      if (ordered) {
        counters[depth] = (counters[depth] || 0) + 1;
        bullet = counters[depth] + ".";
      } else {
        bullet = "-";
      }

      var label = useLinks ? "[" + h.text + "](#" + slug + ")" : h.text;
      out.push(indent + bullet + " " + label);

      if (depth > deepest) deepest = depth;
      shown++;
    });

    output.value = out.join("\n") + "\n";
    status.className = "status";
    status.textContent = fmt(T.statOk, { n: shown, d: deepest });
  }

  input.addEventListener("input", TP.debounce(build, 150));
  if (styleEl) styleEl.addEventListener("change", build);
  if (linksEl) linksEl.addEventListener("change", build);
  if (depthEl) depthEl.addEventListener("input", build);

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
