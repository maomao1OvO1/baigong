/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：md-table.js —— Markdown 表格对齐 / 生成
   干什么：两种输入都认 ——
           ① 已经写歪的 Markdown 表格 ⇒ 重新按列宽对齐；
           ② CSV / TSV / 竖线分隔的原始数据 ⇒ 直接生成 Markdown 表格。

   为什么值得做成工具：
     ① 手写 Markdown 表格最烦的就是对齐：改一个词，整列的空格全要重数；
     ② **中文列的对齐是「显示宽度」，不是字符个数** —— 「中文」是 2 个字，显示宽度 4；
        按字符数补空格，源码里看着整齐，渲染出来反而是歪的。这类工具大多没处理这点；
     ③ 从 Excel / 数据库复制出来的数据是制表符或逗号分隔，转表格要手工加管道符。

   实现要点：
     · 列宽按**显示宽度**算（CJK 与全角符号算 2 格）；
     · `\|` 是内容里的竖线（转义写法），不能被当成列分隔符；
     · 原表格里的分隔行（|---|）会被识别并重建，不需要用户自己删；
     · CSV 的引号包裹（"含,逗号的值"）按规范处理。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");
  var alignEl = $("align");

  function fmt(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  /* ── 显示宽度 ──────────────────────────────────────────────────────────
     Markdown 表格在等宽字体里靠空格对齐，而 CJK、全角标点、emoji 占两格。
     只数字符个数的话，含中文的列一定会歪 —— 这就是「看着对齐、渲染错位」的来源。 */
  function isWide(code) {
    return (code >= 0x1100 && code <= 0x115f) ||   // 韩文字母
           (code >= 0x2e80 && code <= 0x303e) ||   // CJK 部首、标点
           (code >= 0x3041 && code <= 0x33ff) ||   // 假名、CJK 兼容
           (code >= 0x3400 && code <= 0x4dbf) ||   // CJK 扩展 A
           (code >= 0x4e00 && code <= 0x9fff) ||   // CJK 基本区
           (code >= 0xa000 && code <= 0xa4cf) ||   // 彝文
           (code >= 0xac00 && code <= 0xd7a3) ||   // 韩文音节
           (code >= 0xf900 && code <= 0xfaff) ||   // CJK 兼容表意
           (code >= 0xfe30 && code <= 0xfe6f) ||   // CJK 兼容形式
           (code >= 0xff00 && code <= 0xff60) ||   // 全角 ASCII
           (code >= 0xffe0 && code <= 0xffe6) ||   // 全角符号
           (code >= 0x1f300 && code <= 0x1f9ff);   // emoji（代理对高位）
  }

  function dispWidth(s) {
    s = String(s);
    var w = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xdc00 && c <= 0xdfff) continue;   // 代理对低位，高位已按 2 计
      w += isWide(c) ? 2 : 1;
    }
    return w;
  }

  /** 按显示宽度补空格到 width 格 */
  function pad(s, width) {
    var n = width - dispWidth(s);
    return n > 0 ? s + new Array(n + 1).join(" ") : s;
  }

  /** 切一行的列：竖线 / 制表符 / 逗号三种分隔方式 */
  function splitRow(line, delim) {
    line = String(line).replace(/\s+$/, "");

    if (delim === "|") {
      var s = line.trim();
      if (s.charAt(0) === "|") s = s.slice(1);
      if (s.charAt(s.length - 1) === "|") s = s.slice(0, -1);
      /* ⚠️ `\|` 是**内容里的竖线**（转义写法），先藏起来再切行；
         切完**不要还原成裸 `|`** —— 那样输出时它又会被当成列分隔符，等于把表格弄坏
         （实测踩过：输入 `b \| c`，输出变成 `b | c`，表格当场多出一列）。
         保留 `\|` 还有个好处：宽度按它的源码长度算，和编辑器里看到的宽度一致。 */
      s = s.replace(/\\\|/g, "\u0000");
      return s.split("|").map(function (c) { return c.replace(/\u0000/g, "\\|").trim(); });
    }

    if (delim === "\t") {
      return line.split("\t").map(function (c) { return c.trim().replace(/\|/g, "\\|"); });
    }

    // CSV：引号内的分隔符与换行都算内容；"" 表示一个引号
    var out = [], cur = "", q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (q) {
        if (ch === '"') {
          if (line.charAt(i + 1) === '"') { cur += '"'; i++; }
          else q = false;
        } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { out.push(cur.trim().replace(/\|/g, "\\|")); cur = ""; }
      else cur += ch;
    }
    out.push(cur.trim().replace(/\|/g, "\\|"));
    return out;
  }

  /** Markdown 的分隔行：只含 | - : 和空白，且至少有一个 - */
  function isSeparator(line) {
    return /^[\s|:-]+$/.test(line) && /-/.test(line);
  }

  /** 猜分隔符：有竖线优先竖线，其次制表符，最后逗号 */
  function guessDelim(lines) {
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf("|") >= 0) return "|";
    }
    for (var j = 0; j < lines.length; j++) {
      if (lines[j].indexOf("\t") >= 0) return "\t";
    }
    return ",";
  }

  function build() {
    var raw = input.value;
    if (!raw.trim()) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    var lines = raw.split(/\r?\n/).filter(function (l) { return l.trim() !== ""; });
    var delim = guessDelim(lines);
    var rows = [];

    lines.forEach(function (l) {
      if (delim === "|" && isSeparator(l)) return;   // 旧的分隔行丢掉，下面重建
      rows.push(splitRow(l, delim));
    });

    if (!rows.length) {
      output.value = "";
      status.className = "status err";
      status.textContent = T.errNothing || "";
      return;
    }

    // 列数取最大值：短行用空串补齐，避免生成的表格缺列
    var cols = rows.reduce(function (n, r) { return Math.max(n, r.length); }, 0);
    rows.forEach(function (r) { while (r.length < cols) r.push(""); });

    // 每列宽度 =该列最宽的显示宽度；至少 3（分隔行 --- 至少要 3 个字符才合法）
    var widths = [];
    for (var c = 0; c < cols; c++) {
      var w = 3;
      rows.forEach(function (r) { w = Math.max(w, dispWidth(r[c])); });
      widths.push(w);
    }

    var align = alignEl ? alignEl.value : "none";
    var sep = widths.map(function (w) {
      if (align === "center") return ":" + new Array(w - 1).join("-") + ":";
      if (align === "right") return new Array(w).join("-") + ":";
      if (align === "left") return ":" + new Array(w).join("-");
      return new Array(w + 1).join("-");
    });

    var out = [];
    out.push("| " + rows[0].map(function (cell, i) { return pad(cell, widths[i]); }).join(" | ") + " |");
    out.push("| " + sep.join(" | ") + " |");
    for (var r = 1; r < rows.length; r++) {
      out.push("| " + rows[r].map(function (cell, i) { return pad(cell, widths[i]); }).join(" | ") + " |");
    }

    output.value = out.join("\n") + "\n";
    status.className = "status";
    status.textContent = fmt(T.statOk, { r: rows.length, c: cols, d: delim === "|" ? "|" : (delim === "\t" ? "Tab" : ",") });
  }

  input.addEventListener("input", TP.debounce(build, 150));
  if (alignEl) alignEl.addEventListener("change", build);

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
