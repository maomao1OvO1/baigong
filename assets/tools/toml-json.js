/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：toml-json.js —— TOML → JSON
   干什么：把 Cargo.toml / pyproject.toml / 各种 *.toml 配置转成 JSON，一眼看清结构。

   为什么值得做成工具：
     ① TOML 现在是配置格式的事实标准之一（Rust 的 Cargo、Python 的 pyproject、
        Hugo、Netlify…），但它的语法**不是一行一条那么简单**：表头 `[a.b]` 表示嵌套、
        `[[x]]` 表示数组里的一组表、点号键 `a.b = 1` 等价于 `[a]` 下的 `b`；
     ② 手抄结构最容易错的就是**这几层归属关系**，抄错一层整份配置含义就变了；
     ③ 配置文件里常有 token、私钥路径、数据库连接串 —— 本工具全程在浏览器里跑。

   支持的范围（TOML 1.0 的常用子集，够覆盖真实配置文件的绝大多数写法）：
     · 键值：基本字符串 `"..."`（含 \n \t \" \\ \uXXXX 转义）、字面量字符串 `'...'`、
       多行字符串 `"""..."""` 与 `'''...'''`、整数（含下划线分隔 1_000）、浮点、
       布尔、RFC 3339 日期时间（原样保留为字符串）
     · 数组 `[1, 2, 3]`（允许跨行、允许尾逗号）、内联表 `{ a = 1, b = "x" }`
     · 表 `[a.b.c]`、表数组 `[[items]]`、点号键 `a.b = 1`
     · 注释 `#`（字符串里的 # 不算）
   ⚠️ 不做的事：**不解析成"某种方言"**，也不改写你的值 —— 数字保持数字、字符串保持字符串、
      日期时间原样当字符串（JSON 没有日期类型，硬转成时间戳反而丢信息）。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  function fmt(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  /* ── 词法：切出"值"的片段 ─────────────────────────────────────────────────
     解析 TOML 的难点全在字符串上：`#` 在字符串里不是注释、`[` 在字符串里不是数组、
     多行字符串里的换行是内容。所以先老老实实按字符走一遍，别用正则硬切。 */
  function readValue(src, pos) {
    var i = pos;
    var len = src.length;

    // 跳过空白与注释（注释到行尾；多行数组里注释可以出现在中间）
    function skipWs() {
      while (i < len) {
        var c = src.charAt(i);
        if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
        if (c === "#") { while (i < len && src.charAt(i) !== "\n") i++; continue; }
        break;
      }
    }
    skipWs();

    var c0 = src.charAt(i);

    // 多行基本字符串 """…"""
    if (src.substr(i, 3) === '"""') {
      i += 3;
      var out = "";
      while (i < len) {
        if (src.substr(i, 3) === '"""') { i += 3; break; }
        if (src.charAt(i) === "\\") { var r = readEscape(src, i); out += r.text; i = r.next; continue; }
        out += src.charAt(i); i++;
      }
      return { value: out, next: i };
    }

    // 多行字面量字符串 '''…'''
    if (src.substr(i, 3) === "'''") {
      i += 3;
      var e = src.indexOf("'''", i);
      if (e < 0) e = len;
      return { value: src.slice(i, e), next: Math.min(e + 3, len) };
    }

    // 基本字符串 "…"
    if (c0 === '"') {
      i++;
      var s = "";
      while (i < len) {
        var cc = src.charAt(i);
        if (cc === '"') { i++; break; }
        if (cc === "\\") { var r2 = readEscape(src, i); s += r2.text; i = r2.next; continue; }
        s += cc; i++;
      }
      return { value: s, next: i };
    }

    // 字面量字符串 '…'（里面一切原样，连反斜杠都不转义）
    if (c0 === "'") {
      var q = src.indexOf("'", i + 1);
      if (q < 0) q = len;
      return { value: src.slice(i + 1, q), next: Math.min(q + 1, len) };
    }

    // 数组
    if (c0 === "[") {
      i++;
      var arr = [];
      while (true) {
        skipWs();
        if (src.charAt(i) === "]") { i++; break; }
        if (i >= len) break;
        var v = readValue(src, i);
        arr.push(v.value);
        i = v.next;
        skipWs();
        if (src.charAt(i) === ",") { i++; continue; }
        if (src.charAt(i) === "]") { i++; break; }
        if (i >= len) break;
        break;   // 语法怪的地方不硬猜：停下来，让上层报错
      }
      return { value: arr, next: i };
    }

    // 内联表 { a = 1, b = "x" }
    if (c0 === "{") {
      i++;
      var obj = {};
      while (true) {
        skipWs();
        if (src.charAt(i) === "}") { i++; break; }
        if (i >= len) break;
        var k = readKey(src, i);
        i = k.next;
        skipWs();
        if (src.charAt(i) !== "=") break;
        var vv = readValue(src, i + 1);
        setPath(obj, k.parts, vv.value);
        i = vv.next;
        skipWs();
        if (src.charAt(i) === ",") { i++; continue; }
        if (src.charAt(i) === "}") { i++; break; }
        break;
      }
      return { value: obj, next: i };
    }

    // 裸值：数字 / 布尔 / 日期时间 —— 一直读到行尾或分隔符
    var start = i;
    while (i < len && ",]}#\n\r".indexOf(src.charAt(i)) < 0) i++;
    var raw = src.slice(start, i).trim();
    return { value: coerceScalar(raw), next: i };
  }

  /** 转义序列 → 实际字符 */
  function readEscape(src, i) {
    var c = src.charAt(i + 1);
    var map = { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\", b: "\b", f: "\f" };
    if (map[c] != null) return { text: map[c], next: i + 2 };
    if (c === "u") return { text: String.fromCharCode(parseInt(src.substr(i + 2, 4), 16)), next: i + 6 };
    if (c === "U") return { text: String.fromCodePoint(parseInt(src.substr(i + 2, 8), 16)), next: i + 10 };
    return { text: c, next: i + 2 };   // 认不出的转义原样留着，别吞字符
  }

  /** 裸值转类型：整数（含下划线）/ 浮点 / 布尔 / 其余当字符串（日期时间也走这条） */
  function coerceScalar(raw) {
    if (raw === "true") return true;
    if (raw === "false") return false;
    var n = raw.replace(/_/g, "");
    if (/^[+-]?\d+$/.test(n)) return parseInt(n, 10);
    if (/^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/.test(n)) return parseFloat(n);
    return raw;
  }

  /** 读键：`a` / `a.b.c` / `"quoted key"` —— 点号表示嵌套 */
  function readKey(src, i) {
    var parts = [];
    while (i < src.length) {
      var c = src.charAt(i);
      if (c === " " || c === "\t") { i++; continue; }
      if (c === "=") break;
      if (c === '"' || c === "'") {
        var q = readValue(src, i);
        parts.push(q.value);
        i = q.next;
      } else {
        var s = i;
        /* ⚠️ 停止字符里必须有 `]` 与 `}` —— 表头 `[a.b]` 读到 `b]` 就会把右括号
           吃进键名（实测：`[a.b]` 解析成了名为 `b]` 的键，整份结构全错）。 */
        while (i < src.length && ".= \t]}\n".indexOf(src.charAt(i)) < 0) i++;
        parts.push(src.slice(s, i));
      }
      while (i < src.length && src.charAt(i) === " ") i++;
      if (src.charAt(i) === ".") { i++; continue; }
      break;
    }
    return { parts: parts, next: i };
  }

  /** 按路径写值：a.b.c = 1 ⇒ { a: { b: { c: 1 } } } */
  function setPath(root, parts, value) {
    var cur = root;
    for (var k = 0; k < parts.length - 1; k++) {
      var key = parts[k];
      if (cur[key] == null) cur[key] = {};
      cur = cur[key];
    }
    var last = parts[parts.length - 1];
    if (last != null) cur[last] = value;
    return cur;
  }

  /** 拿到（必要时创建）当前表；表数组 [[x]] 要多包一层 */
  function tableFor(root, parts, isArray) {
    var cur = root;
    for (var k = 0; k < parts.length; k++) {
      var key = parts[k];
      if (isArray && k === parts.length - 1) {
        if (!Array.isArray(cur[key])) cur[key] = [];
        var item = {};
        cur[key].push(item);
        cur = item;
      } else {
        if (isArray && Array.isArray(cur[key])) cur = cur[key][cur[key].length - 1];
        else {
          if (cur[key] == null) cur[key] = {};
          cur = cur[key];
        }
      }
    }
    return cur;
  }

  /** 主解析 */
  function parseToml(src) {
    var root = {};
    var current = root;
    var i = 0, len = src.length;

    while (i < len) {
      // 行首空白
      while (i < len && (src.charAt(i) === " " || src.charAt(i) === "\t")) i++;
      var c = src.charAt(i);

      if (c === "\n" || c === "\r") { i++; continue; }
      if (c === "#") { while (i < len && src.charAt(i) !== "\n") i++; continue; }
      if (i >= len) break;

      // 表头 [a.b] 或表数组 [[a]]
      if (c === "[") {
        if (src.charAt(i + 1) === "[") {
          var endA = src.indexOf("]]", i + 2);
          var kA = readKey(src, i + 2);
          endA = endA < 0 ? len : endA;
          current = tableFor(root, kA.parts, true);
          i = Math.min(endA + 2, len);
        } else {
          var endB = src.indexOf("]", i + 1);
          var kB = readKey(src, i + 1);
          endB = endB < 0 ? len : endB;
          current = tableFor(root, kB.parts, false);
          i = Math.min(endB + 1, len);
        }
        // 表头后面只允许注释
        while (i < len && src.charAt(i) !== "\n") i++;
        continue;
      }

      // 键值对
      var key = readKey(src, i);
      i = key.next;
      while (i < len && (src.charAt(i) === " " || src.charAt(i) === "\t")) i++;
      if (src.charAt(i) !== "=") {   // 不是键值对：跳过这一行（不猜）
        while (i < len && src.charAt(i) !== "\n") i++;
        continue;
      }
      var val = readValue(src, i + 1);
      i = val.next;
      setPath(current, key.parts, val.value);
      while (i < len && src.charAt(i) !== "\n") i++;
    }

    return root;
  }

  function build() {
    var raw = String(input.value || "");

    if (!raw.trim()) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    var data;
    try {
      data = parseToml(raw);
    } catch (e) {
      output.value = "";
      status.className = "status err";
      status.textContent = fmt(T.errParse, { msg: e && e.message ? e.message : e });
      return;
    }

    output.value = JSON.stringify(data, null, 2) + "\n";

    // 统计：顶层的表数 + 全部键数（让人一眼知道解析了多少东西）
    var tables = 0, keys = 0;
    Object.keys(data).forEach(function (k) {
      if (data[k] && typeof data[k] === "object" && !Array.isArray(data[k])) tables++;
      keys += countKeys(data[k]);
    });

    status.className = "status";
    status.textContent = fmt(T.statOk, { t: tables, k: keys });
  }

  /** 递归数键（数组里的对象也数进去，这样报表数字才有意义） */
  function countKeys(node) {
    if (node == null || typeof node !== "object") return 1;
    if (Array.isArray(node)) return node.reduce(function (a, x) { return a + countKeys(x); }, 0);
    return Object.keys(node).reduce(function (a, k) { return a + countKeys(node[k]); }, 0);
  }

  input.addEventListener("input", TP.debounce(build, 180));

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
