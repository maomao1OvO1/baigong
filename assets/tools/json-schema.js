/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：json-schema.js —— JSON Schema 校验（常用子集）
   干什么：一边贴 JSON Schema、一边贴数据（中间用一行 === 分隔），
          校验数据是否符合 schema，并**逐条指出哪个路径哪里不符合**。

   为什么值得做成工具：
     ① 接口返回不对时，先要判断「是我用错了，还是它真的没按规定返回」——
        拿 schema 比一遍是最快的办法，而人眼扫几百行 JSON 找不出类型问题；
     ② 校验器最有用的是**错误信息**：说清「哪个路径、期望什么、实际是什么」，
        比只回一句"不合法"有用得多；
     ③ 接口响应里常有 token、用户数据 —— 本工具全程在你浏览器里跑。

   支持的关键字（覆盖日常校验的绝大多数场景）：
     type（含数组形式）· required · properties · items · enum ·
     minimum / maximum · minLength / maxLength / pattern ·
     minItems / maxItems · additionalProperties: false
   ⚠️ 只做**结构校验**，不解析 $ref、不加载外部 schema、不做 format 语义校验
      （如 email/date-time 的格式检查）—— 这些会让人误以为"通过就是真的合法"。
      遇到 $ref 会在结果里**明确说没解析**，而不是假装通过。
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

  function kindOf(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    return typeof v;
  }

  /** 类型匹配：注意 integer 是 number 的子集，而 JSON 里没有单独的整数类型 */
  function matchesType(v, t) {
    var k = kindOf(v);
    if (t === "integer") return k === "number" && Number.isInteger(v);
    if (t === "number") return k === "number";
    return k === t;
  }

  function validate(data, schema, path, errs, notes) {
    if (schema == null || typeof schema !== "object") return;

    // $ref 我们不解析 —— 明说，不装作验过了
    if (schema.$ref) { notes.push(fmt(T.noteRef, { p: path || "(root)", s: schema.$ref })); return; }

    if (schema.type) {
      var types = Array.isArray(schema.type) ? schema.type : [schema.type];
      var okType = types.some(function (t) { return matchesType(data, t); });
      if (!okType) {
        errs.push(fmt(T.msgType, { p: path || "(root)", want: types.join(" | "), got: kindOf(data) }));
        return;   // 类型都不对，后面的约束没有意义
      }
    }

    if (schema.enum) {
      var hit = schema.enum.some(function (e) { return JSON.stringify(e) === JSON.stringify(data); });
      if (!hit) errs.push(fmt(T.msgEnum, { p: path || "(root)", s: brief(schema.enum) }));
    }

    if (typeof data === "number") {
      if (typeof schema.minimum === "number" && data < schema.minimum)
        errs.push(fmt(T.msgMin, { p: path, n: schema.minimum, v: data }));
      if (typeof schema.maximum === "number" && data > schema.maximum)
        errs.push(fmt(T.msgMax, { p: path, n: schema.maximum, v: data }));
    }

    if (typeof data === "string") {
      if (typeof schema.minLength === "number" && data.length < schema.minLength)
        errs.push(fmt(T.msgMinLen, { p: path, n: schema.minLength, v: data.length }));
      if (typeof schema.maxLength === "number" && data.length > schema.maxLength)
        errs.push(fmt(T.msgMaxLen, { p: path, n: schema.maxLength, v: data.length }));
      if (schema.pattern) {
        var re = null;
        try { re = new RegExp(schema.pattern); } catch (e) { re = null; }
        if (!re) errs.push(fmt(T.msgPatternBad, { p: path, s: schema.pattern }));
        else if (!re.test(data)) errs.push(fmt(T.msgPattern, { p: path, s: schema.pattern }));
      }
    }

    if (Array.isArray(data)) {
      if (typeof schema.minItems === "number" && data.length < schema.minItems)
        errs.push(fmt(T.msgMinItems, { p: path, n: schema.minItems, v: data.length }));
      if (typeof schema.maxItems === "number" && data.length > schema.maxItems)
        errs.push(fmt(T.msgMaxItems, { p: path, n: schema.maxItems, v: data.length }));
      if (schema.items) {
        data.forEach(function (v, i) { validate(v, schema.items, path + "[" + i + "]", errs, notes); });
      }
    }

    if (data && typeof data === "object" && !Array.isArray(data)) {
      (schema.required || []).forEach(function (k) {
        if (!(k in data)) errs.push(fmt(T.msgRequired, { p: (path ? path + "." : "") + k }));
      });
      if (schema.properties) {
        Object.keys(schema.properties).forEach(function (k) {
          if (k in data) validate(data[k], schema.properties[k], (path ? path + "." : "") + k, errs, notes);
        });
        if (schema.additionalProperties === false) {
          Object.keys(data).forEach(function (k) {
            if (!(k in schema.properties)) errs.push(fmt(T.msgAdditional, { p: (path ? path + "." : "") + k }));
          });
        }
      }
    }
  }

  function brief(v) {
    var s = JSON.stringify(v);
    return s && s.length > 56 ? s.slice(0, 55) + "…" : s;
  }

  function splitTwo(text) {
    var lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    for (var i = 0; i < lines.length; i++) {
      if (/^={3,}\s*$/.test(lines[i])) return [lines.slice(0, i).join("\n"), lines.slice(i + 1).join("\n")];
    }
    return null;
  }

  function build() {
    var raw = input.value;

    if (!raw.trim()) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    var parts = splitTwo(raw);
    if (!parts) {
      output.value = "";
      status.className = "status err";
      status.textContent = T.errNeedSep || "";
      return;
    }

    var schema, data;
    try { schema = JSON.parse(parts[0]); }
    catch (e) {
      output.value = "";
      status.className = "status err";
      status.textContent = fmt(T.errSchema, { msg: e.message });
      return;
    }
    try { data = JSON.parse(parts[1]); }
    catch (e) {
      output.value = "";
      status.className = "status err";
      status.textContent = fmt(T.errData, { msg: e.message });
      return;
    }

    var errs = [], notes = [];
    validate(data, schema, "", errs, notes);

    var out = [];
    if (!errs.length) {
      out.push(T.passLine);
    } else {
      out.push(fmt(T.failLine, { n: errs.length }));
      out.push("");
      errs.slice(0, 200).forEach(function (e) { out.push("  " + e); });
      if (errs.length > 200) out.push("  … " + fmt(T.moreErrors, { n: errs.length - 200 }));
    }
    if (notes.length) {
      out.push("");
      notes.slice(0, 20).forEach(function (n) { out.push("  " + n); });
    }

    output.value = out.join("\n") + "\n";
    status.className = errs.length ? "status err" : "status ok";
    status.textContent = errs.length ? fmt(T.statFail, { n: errs.length }) : (T.statPass || "");
  }

  input.addEventListener("input", TP.debounce(build, 200));

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
