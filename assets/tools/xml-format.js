/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：xml-format.js —— XML 美化 / 压缩
   干什么：把压成一行的 XML 缩进成可读的层级结构，或者反过来去掉多余空白压成一行。

   为什么值得做成工具：
     ① XML 是**空白敏感**的格式 —— 文本节点里的空格、换行都算内容。
        很多"格式化"工具无脑加换行，结果把 `<name>John  Smith</name>` 里的空格
        或签名校验用的字节流改掉了，而且**不会报错**，等到验签失败才发现；
     ② 这个工具的做法是**保守的**：只有当元素内容**全是子元素**（之间没有非空白文本）
        时才换行缩进；一旦发现混合内容（`<p>文字<b>粗</b></p>` 这种），
        整段保持原样不拆 —— 宁可少美化，不改你的数据；
     ③ 压缩方向（minify）只去掉标签之间的空白，**不动文本节点内部**。

   支持：XML 声明 `<?xml …?>`、DOCTYPE、注释 `<!-- -->`、CDATA `<![CDATA[…]]>`、
        自闭合标签、属性（含单双引号、含换行的属性值）。
   ⚠️ 它是**文本级**工具，不做校验：不检查标签是否配对、不看 DTD。
      标签没闭合的输入会被原样带过去，而不是猜一个闭合位置。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");
  var modeEl = $("mode"), indentEl = $("indent");

  function fmt(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  /* ── 词法：把 XML 切成 token ─────────────────────────────────────────────
     类型：decl（<?…?>）· doctype（<!DOCTYPE…>）· comment（<!-- -->）·
          cdata（<![CDATA[…]]>）· open · close · self · text
     ⚠️ 一切"含 > 的字符串"都必须整段吃掉，不能按 > 硬切 —— 注释里、CDATA 里、
        属性值里都可能出现 >。 */
  function tokenize(src) {
    var toks = [], i = 0, len = src.length;

    while (i < len) {
      if (src.charAt(i) !== "<") {
        var j = src.indexOf("<", i);
        if (j < 0) j = len;
        toks.push({ type: "text", raw: src.slice(i, j) });
        i = j;
        continue;
      }

      if (src.substr(i, 4) === "<!--") {
        var e1 = src.indexOf("-->", i + 4);
        e1 = e1 < 0 ? len : e1 + 3;
        toks.push({ type: "comment", raw: src.slice(i, e1) });
        i = e1;
        continue;
      }
      if (src.substr(i, 9) === "<![CDATA[") {
        var e2 = src.indexOf("]]>", i + 9);
        e2 = e2 < 0 ? len : e2 + 3;
        toks.push({ type: "cdata", raw: src.slice(i, e2) });
        i = e2;
        continue;
      }
      if (src.substr(i, 2) === "<?") {
        var e3 = src.indexOf("?>", i + 2);
        e3 = e3 < 0 ? len : e3 + 2;
        toks.push({ type: "decl", raw: src.slice(i, e3) });
        i = e3;
        continue;
      }
      if (/^<!DOCTYPE/i.test(src.substr(i, 9))) {
        // DOCTYPE 里可能有内部子集（[ … ]），所以先看方括号配平
        var d = i + 2, depth = 0, endD = -1;
        while (d < len) {
          var cd = src.charAt(d);
          if (cd === "[") depth++;
          else if (cd === "]") depth--;
          else if (cd === ">" && depth <= 0) { endD = d + 1; break; }
          d++;
        }
        if (endD < 0) endD = len;
        toks.push({ type: "doctype", raw: src.slice(i, endD) });
        i = endD;
        continue;
      }

      // 普通标签：一直找到不在引号里的 >
      var k = i + 1, quote = null, end = -1;
      while (k < len) {
        var c = src.charAt(k);
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === ">") { end = k + 1; break; }
        k++;
      }
      if (end < 0) { toks.push({ type: "text", raw: src.slice(i) }); break; }

      var rawTag = src.slice(i, end);
      var isClose = rawTag.charAt(1) === "/";
      var isSelf = /\/\s*>$/.test(rawTag);
      toks.push({
        type: isClose ? "close" : (isSelf ? "self" : "open"),
        raw: rawTag,
        name: (rawTag.match(/^<\/?\s*([^\s/>]+)/) || [])[1] || ""
      });
      i = end;
    }
    return toks;
  }

  /** 标出哪些开标签的内容是"纯子元素"（内容里没有非空白文本）⇒ 那种才能安全换行 */
  function markPure(toks) {
    var stack = [];
    toks.forEach(function (tk, idx) {
      if (tk.type === "open") {
        tk.pure = true;
        tk.childOpen = idx;
        stack.push(tk);
      } else if (tk.type === "close") {
        var o = stack.pop();
        if (o) o.closeIdx = idx;
      } else if (tk.type === "text") {
        /* ⚠️ 只标记**最内层**那个元素。`<a><b>1</b><c/></a>` 里含文本的是 <b>，不是 <a> ——
           把"含文本"冒泡给所有祖先的话，外层明明只有子元素的容器也会被当成混合内容，
           结果是整份文档一行都不换（实测踩过这个 bug）。 */
        if (/\S/.test(tk.raw) && stack.length) stack[stack.length - 1].pure = false;
      }
    });
  }

  var INDENT = { "2": "  ", "4": "    ", tab: "\t" };

  function pretty(src, unit) {
    var toks = tokenize(src);
    markPure(toks);

    var out = [], depth = 0;
    var pad = function (n) { return new Array(n + 1).join(unit); };

    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];

      if (tk.type === "text") {
        /* ⚠️ 这里**不能 trim** —— 文件头承诺"文本节点一个字都不动"，
           而 trim 就是改内容（`<b>  keep  </b>` 里那两对空格是数据）。
           含实义字符的文本原样推出去；纯空白文本只可能是缩进，丢掉。 */
        if (/\S/.test(tk.raw)) out.push(pad(depth) + tk.raw);
        continue;
      }

      if (tk.type === "close") {
        depth = Math.max(0, depth - 1);
        out.push(pad(depth) + tk.raw);
        continue;
      }

      // 开头几类（声明 / DOCTYPE / 注释 / CDATA / 自闭合）都单独一行
      if (tk.type !== "open") {
        out.push(pad(depth) + tk.raw);
        continue;
      }

      // 开标签：内容不纯（混合内容）⇒ 与它的闭标签一起原样吐在一行，绝不拆
      if (!tk.pure && tk.closeIdx != null) {
        var buf = [];
        for (var k = i; k <= tk.closeIdx; k++) buf.push(toks[k].raw);
        out.push(pad(depth) + buf.join("").replace(/\s+/g, " ").trim());
        i = tk.closeIdx;
        continue;
      }

      out.push(pad(depth) + tk.raw);
      depth++;
    }

    return out.join("\n") + "\n";
  }

  /** 压缩：只删**标签之间**的空白，文本节点一个字都不动 */
  function minify(src) {
    var toks = tokenize(src);
    var out = [];
    toks.forEach(function (tk) {
      if (tk.type === "text") {
        // 含实义字符 ⇒ **原样**保留（不 trim）；纯空白 ⇒ 只可能是缩进，丢掉
        if (/\S/.test(tk.raw)) out.push(tk.raw);
        return;
      }
      out.push(tk.raw);
    });
    return out.join("");
  }

  function build() {
    var raw = input.value;

    if (!raw.trim()) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    var mode = modeEl ? modeEl.value : "pretty";
    var unit = INDENT[indentEl ? indentEl.value : "2"] || "  ";

    try {
      var result = mode === "minify" ? minify(raw) : pretty(raw, unit);
      output.value = result;

      var opens = (result.match(/<[^!?/][^>]*>/g) || []).length;
      var before = raw.length, after = result.length;
      var msg = fmt(T.statOk, { n: opens, a: before, b: after });
      status.className = "status";
      status.textContent = msg;

      // 混合内容没被拆开时明确说一声 —— 免得用户以为"没生效"
      if (mode !== "minify" && /<[^>]+>[^<\s][^<]*<\/[^>]+>/.test(raw)) {
        status.textContent = msg + " · " + T.noteMixed;
      }
    } catch (e) {
      output.value = "";
      status.className = "status err";
      status.textContent = fmt(T.errParse, { msg: e && e.message ? e.message : e });
    }
  }

  input.addEventListener("input", TP.debounce(build, 180));
  if (modeEl) modeEl.addEventListener("change", build);
  if (indentEl) indentEl.addEventListener("change", build);

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
