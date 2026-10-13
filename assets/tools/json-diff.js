/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：json-diff.js —— 两份 JSON 的结构差异
   干什么：把两份 JSON 放在一个框里（中间用一行 `===` 分隔），列出**逐路径**的差异：
          哪些字段新增了、哪些删了、哪些值改了 —— 而不是把两坨文本整段对比。

   为什么值得做成工具：
     ① 文本级对比对 JSON 几乎没用：缩进差一格、键的顺序换了，整段都会显示成"全变了"，
        真正改掉的那一个值反而淹没在里面；
     ② 按**路径**比较才是这行的做法 —— `data.items[2].price: 19.9 → 24.9`
        一眼就知道改了什么，这对排查「接口返回变了」「配置哪里不同」最直接；
     ③ 这类内容常是接口响应或配置，里面有 token、内网地址、用户数据 ——
        本工具全程在你浏览器里跑。

   与本站「逐行对比 / 字符级对比」的分工：那两个比**文本**，这个比**结构**。
   ⚠️ 键的顺序不影响结果（结构比较本就不该受顺序影响）；
      数组按**下标**比较（这是 JSON 的语义 —— 数组是有序的，[a,b] 与 [b,a] 不相同）。
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

  /** 值的"种类"：null / array / object / string / number / boolean */
  function kind(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    return typeof v;
  }

  /** 值的短表示（长值截断，免得一行撑爆） */
  function brief(v, limit) {
    var s = JSON.stringify(v);
    if (s == null) s = String(v);
    return s.length > (limit || 60) ? s.slice(0, (limit || 60) - 1) + "…" : s;
  }

  /** 递归比较：a 缺失 ⇒ 新增；b 缺失 ⇒ 删除；都有但不同 ⇒ 修改 */
  function walk(a, b, path, out) {
    if (a === undefined) { out.push({ p: path || "(root)", t: "add", v: b }); return; }
    if (b === undefined) { out.push({ p: path || "(root)", t: "del", v: a }); return; }

    var ka = kind(a), kb = kind(b);
    if (ka !== kb) { out.push({ p: path || "(root)", t: "change", a: a, b: b }); return; }

    if (ka === "object") {
      var keys = {};
      Object.keys(a).forEach(function (k) { keys[k] = 1; });
      Object.keys(b).forEach(function (k) { keys[k] = 1; });
      Object.keys(keys).sort().forEach(function (k) {
        walk(a[k], b[k], path ? path + "." + k : k, out);
      });
      return;
    }

    if (ka === "array") {
      var n = Math.max(a.length, b.length);
      for (var i = 0; i < n; i++) walk(a[i], b[i], path + "[" + i + "]", out);
      return;
    }

    if (a !== b) out.push({ p: path || "(root)", t: "change", a: a, b: b });
  }

  /** 拆两段：一行 `===` 为界（与站内其他对比工具同一套约定） */
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

    var left, right;
    try {
      left = JSON.parse(parts[0]);
    } catch (e) {
      output.value = "";
      status.className = "status err";
      status.textContent = fmt(T.errLeft, { msg: e.message });
      return;
    }
    try {
      right = JSON.parse(parts[1]);
    } catch (e) {
      output.value = "";
      status.className = "status err";
      status.textContent = fmt(T.errRight, { msg: e.message });
      return;
    }

    var diffs = [];
    walk(left, right, "", diffs);

    if (!diffs.length) {
      output.value = T.statSame || "";
      status.className = "status ok";
      status.textContent = T.statSame || "";
      return;
    }

    var adds = diffs.filter(function (d) { return d.t === "add"; }).length;
    var dels = diffs.filter(function (d) { return d.t === "del"; }).length;
    var chgs = diffs.filter(function (d) { return d.t === "change"; }).length;

    var w = diffs.reduce(function (m, d) { return Math.max(m, d.p.length); }, 10);
    var pad = function (s) { return s + new Array(Math.max(1, w - s.length + 2)).join(" "); };

    var out = [];
    out.push(pad(T.colPath) + T.colChange);
    out.push(new Array(w + 24).join("-"));

    diffs.forEach(function (d) {
      var val;
      if (d.t === "add") val = (T.markAdd || "(added)") + " → " + brief(d.v);
      else if (d.t === "del") val = brief(d.v) + " → " + (T.markDel || "(removed)");
      else val = brief(d.a) + " → " + brief(d.b);
      out.push(pad(d.p) + val);
    });

    output.value = out.join("\n") + "\n";
    status.className = "status";
    status.textContent = fmt(T.statOk, { n: diffs.length, a: adds, d: dels, c: chgs });
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
