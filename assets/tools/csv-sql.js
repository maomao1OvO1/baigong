/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：csv-sql.js —— CSV 生成 SQL（CREATE TABLE + INSERT）
   干什么：把一份 CSV（或 Excel 导出、别的系统导出的数据）转成可直接执行的 SQL：
          建表语句 + 批量插入语句。

   为什么值得做成工具：
     ① 手动拼 INSERT 是最容易出**注入与转义事故**的活：值里带一个单引号
        （`O'Brien`）没写成 `O''Brien`，SQL 当场语法错误；带分号就可能变成两条语句；
     ② 列名里带空格、连字符、中文时，不同数据库的引用符还不一样
        （MySQL 用反引号、PostgreSQL 与 SQLite 用双引号）—— 这里按方言处理；
     ③ 导出的数据里常有真实姓名、手机号、订单号 —— 本工具全程在你浏览器里跑。

   做出来的语句长这样（默认一次插入多行，比一行一条快得多）：
       CREATE TABLE `demo` ( `id` INTEGER, `name` TEXT );
       INSERT INTO `demo` (`id`, `name`) VALUES (1, 'Ada'), (2, 'Bob');

   ⚠️ 空单元格的处理：默认写成 **NULL**（而不是空字符串 ''）——
      这两者在数据上完全不同，猜错了在导入后很难发现。想留空串就关掉那个开关。
   ⚠️ 类型推断是**保守**的：整列都是整数才给 INTEGER，都是数字给 REAL，其余一律 TEXT。
      原因是 CSV 里没有类型信息，`0755`、`1.10` 这类值当数字处理会丢信息。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");
  var tableEl = $("table"), createEl = $("create"), dialectEl = $("dialect"), nullEl = $("nulls");

  function fmt(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  /* ── CSV 解析 ────────────────────────────────────────────────────────────
     用状态机而不是按行 split：引号里的逗号、引号里的**换行**都是合法内容
     （Excel 导出的多行备注就会这样），按行切会把一条记录劈成两条。 */
  function parseCsv(text) {
    var rows = [], row = [], cell = "", q = false;

    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);

      if (q) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') { cell += '"'; i++; }   // "" 表示一个引号
          else q = false;
        } else cell += c;
        continue;
      }

      if (c === '"') { q = true; continue; }
      if (c === ",") { row.push(cell); cell = ""; continue; }
      if (c === "\r") continue;
      if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
      cell += c;
    }
    row.push(cell);
    rows.push(row);

    // 去掉末尾的空行（文件结尾那个换行产生的）
    while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") rows.pop();
    return rows;
  }

  /** 标识符引用：MySQL 用反引号，PostgreSQL / SQLite 用双引号 */
  function quoteIdent(name, dialect) {
    if (dialect === "mysql") return "`" + String(name).replace(/`/g, "``") + "`";
    return '"' + String(name).replace(/"/g, '""') + '"';
  }

  /** 字符串字面量：单引号必须双写 —— 漏了这一步，O'Brien 这种值会直接让语句报错 */
  function quoteValue(v) {
    return "'" + String(v).replace(/'/g, "''") + "'";
  }

  /** 整列类型推断（保守：只有确定是数字才给数字类型） */
  function inferType(values) {
    var allInt = true, allNum = true;
    for (var i = 0; i < values.length; i++) {
      var v = String(values[i]).trim();
      if (v === "") continue;                       // 空值不参与判断
      if (!/^[+-]?\d+$/.test(v)) allInt = false;
      if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(v)) allNum = false;
    }
    if (allInt) return "INTEGER";
    if (allNum) return "REAL";
    return "TEXT";
  }

  function build() {
    var raw = String(input.value || "");

    if (!raw.trim()) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    var rows = parseCsv(raw);
    if (rows.length < 1 || !rows[0].length) {
      output.value = "";
      status.className = "status err";
      status.textContent = T.errBad || "";
      return;
    }

    var dialect = dialectEl ? dialectEl.value : "mysql";
    var table = ((tableEl && tableEl.value.trim()) || "my_table");
    var wantCreate = !createEl || createEl.checked;
    var emptyAsNull = !nullEl || nullEl.checked;

    var header = rows[0].map(function (h, i) { return h.trim() || ("col" + (i + 1)); });
    var body = rows.slice(1);
    var qt = quoteIdent(table, dialect);

    /* 每列的类型先算出来 —— 建表和插入都要用：
       插入时**数字列的数值不加引号**，否则会出现 `id` 声明为 INTEGER、值却写成 '1' 的
       自相矛盾（多数数据库能隐式转换，但 PostgreSQL 的严格类型、以及后续的类型比较
       都可能因此出问题）。 */
    var colTypes = header.map(function (h, i) {
      return inferType(body.map(function (r) { return r[i] == null ? "" : r[i]; }));
    });

    var out = [];

    // ① 建表
    if (wantCreate) {
      var defs = header.map(function (h, i) {
        return "  " + quoteIdent(h, dialect) + " " + colTypes[i];
      });
      out.push("CREATE TABLE " + qt + " (");
      out.push(defs.join(",\n"));
      out.push(");");
      out.push("");
    }

    // ② 插入
    var cols = header.map(function (h) { return quoteIdent(h, dialect); }).join(", ");
    var tuples = body.map(function (r) {
      var vals = header.map(function (_, i) {
        var v = r[i] == null ? "" : r[i];
        var trimmed = String(v).trim();
        if (emptyAsNull && trimmed === "") return "NULL";
        var isNum = (colTypes[i] === "INTEGER" || colTypes[i] === "REAL") &&
                    /^[+-]?(\d+\.?\d*|\.\d+)$/.test(trimmed);
        return isNum ? trimmed : quoteValue(v);   // 数字裸写，其余一律加引号并转义
      });
      return "  (" + vals.join(", ") + ")";
    });

    if (tuples.length) {
      out.push("INSERT INTO " + qt + " (" + cols + ") VALUES");
      out.push(tuples.join(",\n") + ";");
    }

    output.value = out.join("\n") + "\n";
    status.className = "status";
    status.textContent = fmt(T.statOk, { r: body.length, c: header.length, t: table });
  }

  input.addEventListener("input", TP.debounce(build, 200));
  [tableEl, createEl, dialectEl, nullEl].forEach(function (el) {
    if (el) el.addEventListener("change", build);
    if (el && el.tagName === "INPUT" && el.type === "text") el.addEventListener("input", TP.debounce(build, 200));
  });

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
