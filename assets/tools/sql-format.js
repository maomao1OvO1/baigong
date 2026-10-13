/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：sql-format.js —— SQL 格式化
   干什么：把压成一行的 SQL 拆开、缩进、把关键字统一成大写，看得清结构。

   为什么值得做成工具：
     ① 从日志、慢查询记录、ORM 输出里捞出来的 SQL 常常是**一整行**，
        几百个字符里找 WHERE 条件靠肉眼扫；
     ② 大写关键字不是审美问题 —— 关键字大写、标识符小写是 SQL 社区的通行约定，
        一眼就能分清「哪些是语法、哪些是我的表和字段」；
     ③ 这类 SQL 里往往带着**真实的表名、字段名、甚至值**，贴到别人的格式化服务上
        等于把库结构报备出去。这里全程在你浏览器里跑。

   ⚠️ 最关键的一条：**字符串和注释里的内容不能动**。
      `WHERE name = 'select * from users'` 里的那段文字是**数据**，不是 SQL；
      直接对整串做「关键字大写」的文本替换，会把用户存的数据也改掉 ——
      所以本工具先做词法扫描切 token，只对自己认出的关键字动手。

   格式化规则（都是可读性上默认最舒服的写法）：
     · SELECT / FROM / WHERE / GROUP BY / JOIN / ON … 各自起新行；
     · AND / OR / ON 缩进两级，把「一组条件」的层次摆出来；
     · 逗号默认不换行（列多的话可以打开发选项）；
     · 括号内不强行换行，只按嵌套深度缩进。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");
  var upperEl = $("upper"), commasEl = $("commas");

  function fmt(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  /* ── 关键字表 ──────────────────────────────────────────────────────────
     分成三张表，是因为它们触发的排版动作不同：
       CLAUSE  顶层子句 —— 前面换行、顶格
       JOINS   连接 —— 前面换行、顶格（跟子句平级，看起来才像同一层）
       COND    条件连接词 —— 前面换行、缩进两级
     短语（GROUP BY / LEFT JOIN）也放进来：不做多词匹配的话，`GROUP` 和 `BY`
     会被当成两个独立关键字，排版就散了。 */
  var CLAUSE = ["SELECT", "FROM", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT", "OFFSET",
                "VALUES", "SET", "RETURNING", "UNION ALL", "UNION", "INSERT INTO", "UPDATE",
                "DELETE FROM", "CREATE TABLE", "ALTER TABLE", "DROP TABLE", "CREATE INDEX",
                "TRUNCATE TABLE", "WITH", "ON CONFLICT", "EXPLAIN"];
  var JOINS = ["LEFT OUTER JOIN", "RIGHT OUTER JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN",
               "FULL OUTER JOIN", "FULL JOIN", "CROSS JOIN", "JOIN"];
  var COND = ["AND", "OR", "ON"];
  var OTHER_KW = ["AS", "IN", "NOT", "NULL", "IS", "LIKE", "ILIKE", "BETWEEN", "EXISTS", "CASE",
                  "WHEN", "THEN", "ELSE", "END", "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX",
                  "ASC", "DESC", "BY", "INTO", "DEFAULT", "PRIMARY KEY", "FOREIGN KEY",
                  "REFERENCES", "CASCADE", "RESTRICT", "IF EXISTS", "IF NOT EXISTS", "COALESCE",
                  "CAST", "TRUE", "FALSE", "USING", "OVER", "PARTITION BY", "CURRENT_TIMESTAMP"];

  /** 建索引：短语按长度降序排，长短语优先匹配（LEFT JOIN 必须比 JOIN 先命中） */
  var PHRASES = CLAUSE.concat(JOINS, COND, OTHER_KW)
    .filter(function (k) { return k.indexOf(" ") >= 0; })
    .sort(function (a, b) { return b.length - a.length; });
  var SINGLES = Object.create(null);
  CLAUSE.concat(JOINS, COND, OTHER_KW).forEach(function (k) {
    if (k.indexOf(" ") < 0) SINGLES[k] = 1;
  });

  /** 词法扫描：切成 token。字符串 / 注释 / 引号标识符整段保留 —— 它们是数据，不是 SQL */
  function lex(sql) {
    var out = [], i = 0, n = sql.length;

    while (i < n) {
      var c = sql.charAt(i);

      if (/\s/.test(c)) { i++; continue; }   // 空白由排版决定，这里全丢掉

      // 行注释：`-- …` 与 MySQL 的 `# …`
      if ((c === "-" && sql.charAt(i + 1) === "-") || c === "#") {
        var j = sql.indexOf("\n", i);
        out.push({ t: "comment", v: sql.slice(i, j < 0 ? n : j).replace(/\s+$/, "") });
        i = j < 0 ? n : j;
        continue;
      }

      // 块注释：/* … */
      if (c === "/" && sql.charAt(i + 1) === "*") {
        var k = sql.indexOf("*/", i + 2);
        k = k < 0 ? n : k + 2;
        out.push({ t: "comment", v: sql.slice(i, k) });
        i = k;
        continue;
      }

      // 字符串：'' 双写与 \' 都是转义写法，两种都得认，否则字符串会提前断开
      if (c === "'" || c === '"') {
        var q = c, s = i + 1;
        while (s < n) {
          var ch = sql.charAt(s);
          if (ch === "\\") { s += 2; continue; }
          if (ch === q) {
            if (sql.charAt(s + 1) === q) { s += 2; continue; }   // '' 表示一个单引号
            break;
          }
          s++;
        }
        s = Math.min(s + 1, n);
        out.push({ t: "str", v: sql.slice(i, s) });
        i = s;
        continue;
      }

      // 引号标识符：\`col\` 与 [col]
      if (c === "`" || c === "[") {
        var close = c === "`" ? "`" : "]";
        var e = sql.indexOf(close, i + 1);
        e = e < 0 ? n : e + 1;
        out.push({ t: "word", v: sql.slice(i, e), quoted: true });
        i = e;
        continue;
      }

      if (/[0-9]/.test(c)) {
        var m = /^[0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?/i.exec(sql.slice(i));
        out.push({ t: "num", v: m[0] });
        i += m[0].length;
        continue;
      }

      // 词：字母 / 数字 / 下划线 / $ / 点（表.列）/ 中文（有些库真用中文表名）
      if (/[A-Za-z_$\u4e00-\u9fff]/.test(c)) {
        var w = /^[A-Za-z0-9_$\u4e00-\u9fff.]+/.exec(sql.slice(i));
        out.push({ t: "word", v: w[0] });
        i += w[0].length;
        continue;
      }

      out.push({ t: "punct", v: c });
      i++;
    }
    return out;
  }

  /** 从位置 i 开始试着匹配一个多词短语（只看后面的 word，且不跨标点） */
  function matchPhrase(toks, i) {
    for (var p = 0; p < PHRASES.length; p++) {
      var words = PHRASES[p].split(" ");
      var j = i, ok = true;

      for (var w = 0; w < words.length; w++) {
        if (!toks[j] || toks[j].t !== "word" || toks[j].quoted) { ok = false; break; }
        if (toks[j].v.toUpperCase() !== words[w]) { ok = false; break; }
        j++;
      }
      if (ok) return { phrase: PHRASES[p], next: j };
    }
    return null;
  }

  function format(sql, opt) {
    var toks = lex(sql);
    if (!toks.length) return { text: "", keywords: 0 };

    var lines = [], cur = "", curIndent = "", depth = 0, keywords = 0;

    function flush() {
      var s = cur.replace(/\s+$/, "");
      if (s) lines.push(curIndent + s);
      cur = "";
    }
    /** 往当前行追加；space 决定前面要不要垫一个空格 */
    function put(text, space) {
      if (cur && space && !/[\s.]$/.test(cur) && !/^[.,)]/.test(text)) cur += " ";
      cur += text;
    }

    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];

      // —— 多词短语优先：命中就整段当一个关键字处理 ——
      if (tk.t === "word" && !tk.quoted) {
        var hit = matchPhrase(toks, i);
        if (hit) {
          var isJoin = JOINS.indexOf(hit.phrase) >= 0;
          var isClause = CLAUSE.indexOf(hit.phrase) >= 0;
          var isCond = COND.indexOf(hit.phrase) >= 0;

          if (isClause || isJoin) { flush(); curIndent = ""; }
          else if (isCond) { flush(); curIndent = "  "; }

          put(hit.phrase, true);
          keywords++;
          i = hit.next - 1;
          continue;
        }
      }

      if (tk.t === "word" && !tk.quoted && SINGLES[tk.v.toUpperCase()]) {
        // 单词形式的子句 / 连接词（FROM / WHERE / JOIN / SELECT…）**同样要另起一行** ——
        // 只在多词短语那里换行的话，`FROM t` 会黏在上一行尾巴上（实测踩过这个坑：
        // SELECT a, b FROM t WHERE x = 1 全挤在一行，只有 AND 换了行）。
        var u = tk.v.toUpperCase();
        if (COND.indexOf(u) >= 0) { flush(); curIndent = "  "; }
        else if (CLAUSE.indexOf(u) >= 0 || JOINS.indexOf(u) >= 0) { flush(); curIndent = ""; }
        put(opt.upper ? u : tk.v, true);
        keywords++;
        continue;
      }

      if (tk.t === "comment") {
        if (!cur) { lines.push(curIndent + tk.v); continue; }
        put(tk.v, true);
        continue;
      }

      if (tk.v === "(") {
        // 「关键字 + (」要留空格（IN (…)、VALUES (…)）；函数名后不留（count(…)）
        var prev = cur.replace(/[^A-Za-z0-9_$\u4e00-\u9fff]*$/, "").toUpperCase();
        put("(", isSpaceyBeforeParen(prev));
        depth++;
        continue;
      }
      if (tk.v === ")") { depth--; put(")", false); continue; }
      if (tk.v === ",") {
        put(",", false);
        if (opt.commas && depth === 0) { flush(); curIndent = "  "; }
        continue;
      }
      if (tk.v === ".") { put(".", false); continue; }
      if (tk.v === ";" || tk.v === "*") { put(tk.v, tk.v === "*" ? true : false); continue; }

      put(tk.v, true);
    }
    flush();

    return { text: lines.join("\n") + "\n", keywords: keywords };
  }

  /** `(` 前面要不要留空格：前面是这些词就留（它们是语法关键字，不是函数名） */
  function isSpaceyBeforeParen(prevWord) {
    return ["IN", "VALUES", "EXISTS", "AND", "OR", "ON", "WHERE", "AS", "USING", "BY", "NOT",
            "SELECT", "UNION", "SET", "RETURNING"].indexOf(prevWord) >= 0;
  }

  function build() {
    var raw = input.value.trim();

    if (!raw) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    var r = format(raw, {
      upper: !upperEl || upperEl.checked,
      commas: !!(commasEl && commasEl.checked)
    });

    output.value = r.text;
    status.className = "status";
    status.textContent = fmt(T.statOk, { lines: r.text.split("\n").length - 1, kw: r.keywords });
  }

  input.addEventListener("input", TP.debounce(build, 150));
  if (upperEl) upperEl.addEventListener("change", build);
  if (commasEl) commasEl.addEventListener("change", build);

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
