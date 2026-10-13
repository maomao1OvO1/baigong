/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：env-parse.js —— .env 解析 / 转换
   干什么：把一份 .env 转成 JSON 对象、shell 的 export 语句、docker-compose 的
          environment 段，或者 JavaScript 对象。解析时按 .env 的真实规则来。

   为什么值得做成工具：
     ① .env 的语法看着简单，坑都在细节上：`export` 前缀、单引号（原样）与双引号
        （认 \n 转义）、**双引号值可以跨行**、无引号值里的 ` #` 之后是注释；
     ② 手抄一遍容易漏键，而漏掉的往往是那个「不加就启动不了」的；
     ③ ⚠️ **.env 里装的是密钥** —— 它是最不该贴到在线转换服务上的文件。
        本工具全程在你浏览器里跑，不发一个字节。

   安全提醒（也写在页面问答里）：转换出来的结果里仍然是**明文密钥**。
        粘进代码仓库、聊天窗口、工单之前先想一遍 —— 这是泄漏最常见的一条路径。

   说明：只做解析与格式转换，不做变量插值（`${OTHER}` 引用保持原样）——
        插值要看运行时环境，猜出来的值比不转换更危险。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");
  var formatEl = $("format");

  function fmt(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  /** 解析 .env → [{ key, value, line }]，同时统计被跳过的行 */
  function parseEnv(text) {
    var lines = String(text || "").split(/\r?\n/);
    var vars = [], skipped = 0;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;   // 空行与整行注释

      // `export KEY=…` 与 `KEY=…` 都要认；键名允许点号（有些工具这么写）
      var m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*([\s\S]*)$/.exec(line);
      if (!m) { skipped++; continue; }

      var key = m[1], rest = m[2], value;

      if (rest.charAt(0) === '"') {
        /* 双引号：认 \n \t \" \\ 转义，而且**可以跨行**（值里换行是合法的）——
           不处理跨行的话，多行证书、私钥这类值会被截断成半截。 */
        var buf = rest.slice(1), j = i;
        while (true) {
          var cut = -1;
          for (var k = 0; k < buf.length; k++) {
            if (buf.charAt(k) === "\\") { k++; continue; }
            if (buf.charAt(k) === '"') { cut = k; break; }
          }
          if (cut >= 0) { buf = buf.slice(0, cut); break; }
          j++;
          if (j >= lines.length) break;      // 引号没闭合就到底了 —— 值取到文件末尾
          buf += "\n" + lines[j];
        }
        i = j;
        value = buf.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      } else if (rest.charAt(0) === "'") {
        // 单引号：shell 规则 —— 里面**一切原样**，不处理转义
        var e = rest.indexOf("'", 1);
        value = e < 0 ? rest.slice(1) : rest.slice(1, e);
      } else {
        // 无引号：到行尾；` #` 之后是行尾注释（前面要有空格，否则 # 是值的一部分）
        value = rest.replace(/\s+#.*$/, "").trim();
      }

      vars.push({ key: key, value: value, line: i + 1 });
    }

    return { vars: vars, skipped: skipped };
  }

  /** shell 单引号转义：把 ' 写成 '\''（这是唯一可靠的写法） */
  function shQuote(v) {
    return "'" + String(v).replace(/'/g, "'\\''") + "'";
  }

  function render(vars, format) {
    if (!vars.length) return "";

    if (format === "shell") {
      return vars.map(function (v) { return "export " + v.key + "=" + shQuote(v.value); }).join("\n") + "\n";
    }

    if (format === "compose") {
      // docker-compose 的 environment 有两种写法，列表形式不用操心 YAML 的转义
      return "environment:\n" + vars.map(function (v) {
        return "  - " + v.key + "=" + v.value.replace(/\n/g, "\\n");
      }).join("\n") + "\n";
    }

    if (format === "js") {
      return "const env = {\n" + vars.map(function (v) {
        return "  " + JSON.stringify(v.key) + ": " + JSON.stringify(v.value) + ",";
      }).join("\n") + "\n};\n";
    }

    // 默认：JSON（缩进 2，键按原顺序，不排序 —— 顺序本身就是 .env 的阅读顺序）
    var obj = {};
    vars.forEach(function (v) { obj[v.key] = v.value; });
    return JSON.stringify(obj, null, 2) + "\n";
  }

  function build() {
    var raw = input.value;

    if (!raw.trim()) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    var r = parseEnv(raw);
    if (!r.vars.length) {
      output.value = "";
      status.className = "status err";
      status.textContent = T.errNothing || "";
      return;
    }

    output.value = render(r.vars, formatEl ? formatEl.value : "json");

    var msg = fmt(T.statOk, { n: r.vars.length });
    if (r.skipped) msg += " · " + fmt(T.statSkipped, { n: r.skipped });
    var multi = r.vars.filter(function (v) { return v.value.indexOf("\n") >= 0; }).length;
    if (multi) msg += " · " + fmt(T.statMulti, { n: multi });

    status.className = "status";
    status.textContent = msg;
  }

  input.addEventListener("input", TP.debounce(build, 150));
  if (formatEl) formatEl.addEventListener("change", build);

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
