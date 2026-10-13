/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：ini-parse.js —— INI / conf / .properties 解析成 JSON
   干什么：把段 + 键值那种配置文件转成 JSON，顺便给段数、键数、重复键与坏行的统计。

   为什么值得做成工具：
     ① 这类格式（INI、.conf、.properties、desktop 文件）没有统一标准，
        同一份文件在不同解析器里结果可以不一样 —— 常见分歧就那么几个：
        `;` 与 `#` 谁是注释、值里能不能带行尾注释、重复键是覆盖还是追加；
     ② 把 `[section]` 那层拍平成 JSON，写脚本处理时就顺手了；
     ③ 配置文件里常有密码与密钥 —— 本工具全程在你浏览器里跑，不上传。

   本工具的选择（都写明白，免得跟你的程序对不上）：
     · **注释**：行首 `;` 或 `#`；**值后面**要有空白再接 `;`/`#` 才算行尾注释
       （`value#tag` 里的 `#` 是值的一部分 —— 不加这条的话，颜色值 `#fff` 会被吃掉）；
     · **重复键**：合并成数组，不覆盖（覆盖会静默丢数据，追加至少看得见）；
     · **引号**：被引号整体包住的值会去掉引号，但**不动里面的转义**；
     · **类型**：默认全部按字符串（`0755`、`0123` 这种前导零当数字会失真）；
       想自动识别数字 / 布尔，把开关打开。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");
  var typedEl = $("typed");

  function fmt(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  /** 把「看起来像数字/布尔」的值转成真类型；只在用户明确打开开关时才用 */
  function coerce(v) {
    if (/^(true|false)$/i.test(v)) return /^true$/i.test(v);
    if (/^-?\d+$/.test(v)) return parseInt(v, 10);
    if (/^-?(\d+\.\d*|\d*\.\d+)$/.test(v)) return parseFloat(v);
    return v;
  }

  function parseIni(text, typed) {
    var lines = String(text).split(/\r?\n/);
    var root = {};
    var section = null;
    var dup = 0, bad = 0, sections = 0;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === ";" || line.charAt(0) === "#") continue;

      // 段头：[name]
      var sec = /^\[([^\]]+)\]\s*$/.exec(line);
      if (sec) {
        section = sec[1].trim();
        if (!(section in root)) { root[section] = {}; sections++; }
        continue;
      }

      // 键值：`=` 或 `:` 分隔（两种在现实里都很常见）
      var kv = /^([^=:]+?)\s*[=:]\s*(.*)$/.exec(line);
      if (!kv) { bad++; continue; }

      var key = kv[1].trim();
      var val = kv[2];

      // 行尾注释：**要求前面有空白** —— 否则颜色值 #fff、标签 #tag 会被误吃掉
      val = val.replace(/\s+[;#].*$/, "").trim();

      // 整体被引号包住 ⇒ 去掉引号（里面的转义保持原样，不猜）
      if (val.length >= 2 &&
          ((val.charAt(0) === '"' && val.charAt(val.length - 1) === '"') ||
           (val.charAt(0) === "'" && val.charAt(val.length - 1) === "'"))) {
        val = val.slice(1, -1);
      }

      if (typed) val = coerce(val);

      var target = section ? root[section] : root;
      if (key in target) {
        if (!Array.isArray(target[key])) target[key] = [target[key]];
        target[key].push(val);
        dup++;
      } else {
        target[key] = val;
      }
    }

    return { data: root, dup: dup, bad: bad, sections: sections };
  }

  function build() {
    var raw = input.value;

    if (!raw.trim()) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    var typed = !!(typedEl && typedEl.checked);
    var r = parseIni(raw, typed);

    if (!Object.keys(r.data).length) {
      output.value = "";
      status.className = "status err";
      status.textContent = T.errBad || "";
      return;
    }

    output.value = JSON.stringify(r.data, null, 2) + "\n";

    var msg = fmt(T.statOk, { n: Object.keys(r.data).length, s: r.sections });
    if (r.dup) msg += " · " + fmt(T.statDup, { n: r.dup });
    if (r.bad) msg += " · " + fmt(T.statBad, { n: r.bad });

    status.className = "status";
    status.textContent = msg;
  }

  input.addEventListener("input", TP.debounce(build, 150));
  if (typedEl) typedEl.addEventListener("change", build);

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
