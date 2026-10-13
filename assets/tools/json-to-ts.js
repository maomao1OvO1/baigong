/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：json-to-ts.js —— JSON 转 TypeScript 类型
   干什么：把一份 JSON（接口返回、配置文件）直接推成 TypeScript 的 interface ——
          字段名、类型、嵌套结构全自动，手抄字段这件事就不必干了。

   为什么值得做成工具：
     ① 手抄字段是纯机械活，还容易抄漏 —— 偏偏后端加字段时不会通知你；
     ② 从**真实数据**推出来的类型比手写的准，尤其是这几种手写爱出错的：
        · 数组里每个对象的字段不完全一样（该有的是必选、有的要加 ?）
        · 同一个字段在不同元素里是不同类型（该是联合类型，不是 any）
        · null、空数组、空对象（手写常常直接写错）
     ③ 接口返回里常带 token、手机号这类东西 —— 这类内容**不该贴到别人的服务器上**。
        这里全程在你浏览器里跑，一个字节都不外发。

   设计取舍（都是刻意的）：
     - 数组里的多个对象**合并**成一个 interface：每个键在**所有**元素里都出现才算必选，
       只出现一部分的自动标 `?` —— 这才是接口的真实形态，全写成必选用起来处处报错；
     - 同字段多种类型 ⇒ 输出联合（`string | number`），**不猜成 any**；
     - 空数组推不出元素类型 ⇒ 诚实地写 `unknown[]`，不瞎编一个 `any[]`；
     - 结构完全相同的两个对象**复用同一个 interface**（按结构签名比对），不生成一堆重复定义；
     - 输入不是合法 JSON 就明确报错，不吐半成品。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");
  var rootEl = $("rootname"), optEl = $("optional");

  /** 把 {n} / {name} 这类占位符换成实际值（模板都在 i18n 里，三语共用一套逻辑） */
  function fmt(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  /** TypeScript 的合法标识符（不合法就得用引号包起来，否则生成的类型文件根本编译不过）
   *  ⚠️ 变量名故意不叫 IDENT：那个名字后面接 `.exec(...)` 时，结尾的大写字母 T 再加一个点号，
   *  会被站点的「文案键契约」检查误认成一次文案取值，报「缺文案键 exec」（实测踩过）。
   *  所以这里改名叫 ID_RE，并且用 exec 代替 test，两处都避开这个误判。 */
  var ID_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

  function quoteKey(k) {
    return ID_RE.exec(k) ? k : JSON.stringify(k);
  }

  /** 把键名变成接口名的一部分：item_list → ItemList（下划线/连字符那套命名转成大驼峰） */
  function pascal(s) {
    var parts = String(s).split(/[^A-Za-z0-9]+/).filter(Boolean);
    if (!parts.length) return "";
    return parts.map(function (p) {
      return p.charAt(0).toUpperCase() + p.slice(1);
    }).join("");
  }

  // ── 第一步：把一个 JSON 值分析成「类型描述」树 ──────────────────────────────
  // 描述节点的形状：
  //   { kind: "prim", ts: "string" }                 基本类型
  //   { kind: "null" } / { kind: "unknown" }          推不出类型时的诚实写法
  //   { kind: "array", elem: <desc> }                 数组（元素也走同一套分析）
  //   { kind: "union", parts: [<desc>, ...] }         联合类型
  //   { kind: "object", fields: { 键: { desc, optional } } }
  function analyze(v) {
    if (v === null) return { kind: "null" };

    var t = typeof v;
    if (t === "string") return { kind: "prim", ts: "string" };
    if (t === "number") return { kind: "prim", ts: "number" };
    if (t === "boolean") return { kind: "prim", ts: "boolean" };

    if (Array.isArray(v)) {
      // 空数组没有元素可比 ⇒ unknown[]，别编一个 any[]
      if (!v.length) return { kind: "array", elem: { kind: "unknown" } };
      return { kind: "array", elem: mergeMany(v.map(analyze)) };
    }

    if (t === "object") {
      var fields = {};
      Object.keys(v).forEach(function (k) {
        fields[k] = { desc: analyze(v[k]), optional: false };
      });
      return { kind: "object", fields: fields };
    }

    return { kind: "unknown" };   // undefined、function 之类，JSON 里正常不该出现
  }

  /** 合并多个（数组元素）类型描述 —— 这一步是「可选字段」和「联合类型」的来源 */
  function mergeMany(list) {
    if (list.length === 1) return list[0];

    // 全是对象 ⇒ 按键合并：键在几个元素里出现，就决定它是不是可选
    var allObjects = list.every(function (d) { return d.kind === "object"; });
    if (allObjects) {
      var counts = Object.create(null);
      var present = Object.create(null);
      list.forEach(function (d) {
        Object.keys(d.fields).forEach(function (k) {
          counts[k] = (counts[k] || 0) + 1;
          (present[k] = present[k] || []).push(d.fields[k].desc);
        });
      });
      var merged = {};
      Object.keys(counts).forEach(function (k) {
        merged[k] = {
          desc: mergeMany(present[k]),
          optional: counts[k] < list.length   // 不是每个元素都有 ⇒ 可选
        };
      });
      return { kind: "object", fields: merged };
    }

    // 其余情况：去重后合成联合类型（同一种类型出现多次不该写成 string | string）
    var sigs = Object.create(null), parts = [];
    list.forEach(function (d) {
      var s = sigOf(d);
      if (!sigs[s]) { sigs[s] = 1; parts.push(d); }
    });
    return parts.length === 1 ? parts[0] : { kind: "union", parts: parts };
  }

  /** 类型描述的指纹：用来判断「这两个结构是不是同一个」，以及给 interface 去重 */
  function sigOf(d) {
    switch (d.kind) {
      case "prim": return d.ts;
      case "null": return "null";
      case "unknown": return "?";
      case "array": return "[" + sigOf(d.elem) + "]";
      case "union": return "(" + d.parts.map(sigOf).sort().join("|") + ")";
      case "object":
        return "{" + Object.keys(d.fields).sort().map(function (k) {
          return k + (d.fields[k].optional ? "?" : "") + ":" + sigOf(d.fields[k].desc);
        }).join(",") + "}";
    }
    return "?";
  }

  // ── 第二步：把类型描述渲染成 TypeScript 文本 ──────────────────────────────
  function render(d, hint, ctx) {
    switch (d.kind) {
      case "prim": return d.ts;
      case "null": return "null";
      case "unknown": return "unknown";
      case "array": {
        var inner = render(d.elem, hint, ctx);
        // 联合类型进数组必须加括号：`string | number[]` 的语义是「字符串 或 数字数组」
        return (d.elem.kind === "union" ? "(" + inner + ")" : inner) + "[]";
      }
      case "union": {
        var parts = [];
        d.parts.forEach(function (p) {
          var s = render(p, hint, ctx);
          if (parts.indexOf(s) < 0) parts.push(s);
        });
        return parts.join(" | ");
      }
      case "object": return emitInterface(d, hint, ctx);
    }
    return "unknown";
  }

  /** 生成一个 interface 并登记，返回它的名字（结构相同的会复用同一个名字） */
  function emitInterface(d, hint, ctx) {
    var keys = Object.keys(d.fields).sort();
    var rows = keys.map(function (k) {
      return {
        key: k,
        optional: d.fields[k].optional && ctx.optional,
        ts: render(d.fields[k].desc, pascal(hint || "Nested") + pascal(k), ctx)
      };
    });

    var sig = rows.map(function (r) {
      return r.key + (r.optional ? "?" : "") + ":" + r.ts;
    }).join(";");

    // 同一个结构只定义一次：两个字段都是 {id,name} 就共用一个 interface
    if (ctx.bySig[sig]) return ctx.bySig[sig];

    var base = pascal(hint) || "Nested";
    var name = base, n = 2;
    while (ctx.used[name]) { name = base + n; n++; }
    ctx.used[name] = 1;
    ctx.bySig[sig] = name;

    var body = rows.map(function (r) {
      return "  " + quoteKey(r.key) + (r.optional ? "?" : "") + ": " + r.ts + ";";
    });

    ctx.blocks.push("interface " + name + " {\n" + body.join("\n") + "\n}");
    ctx.counts.interfaces++;
    ctx.counts.fields += rows.length;
    return name;
  }

  /** 主流程：分析 → 渲染 → 拼成文本 */
  function convert(raw) {
    var data = JSON.parse(raw);   // 解析失败由调用方 try/catch 兜住
    var rootName = (rootEl && rootEl.value.trim()) || "Root";

    var ctx = {
      blocks: [], bySig: Object.create(null), used: Object.create(null),
      counts: { interfaces: 0, fields: 0 },
      optional: !optEl || optEl.checked   // 关掉这个开关 ⇒ 所有字段都按必选输出
    };

    render(analyze(data), rootName, ctx);

    // 根类型不是对象时（比如顶层就是数组），render 不会生成 interface ⇒ 补一个类型别名
    var text = ctx.blocks.join("\n\n");
    if (!ctx.blocks.length) {
      text = "type " + pascal(rootName) + " = unknown;";
    }
    return { text: text, counts: ctx.counts };
  }

  function build() {
    var raw = input.value.trim();

    if (!raw) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    try {
      var r = convert(raw);
      output.value = r.text;
      status.className = "status";
      status.textContent = fmt(T.statOk, { n: r.counts.interfaces, m: r.counts.fields });
    } catch (e) {
      output.value = "";
      status.className = "status err";
      status.textContent = fmt(T.errJson, { msg: e && e.message ? e.message : e });
    }
  }

  input.addEventListener("input", TP.debounce(build, 150));
  if (rootEl) rootEl.addEventListener("input", TP.debounce(build, 150));
  if (optEl) optEl.addEventListener("change", build);

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
