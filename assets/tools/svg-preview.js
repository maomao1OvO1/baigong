/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：svg-preview.js —— SVG 压缩与预览
   干什么：把设计工具导出的臃肿 SVG 压小（去注释、去标签间空白），
          同时就地渲染出来，改完立刻看得见。

   为什么值得做成工具：
     ① 设计工具导出的 SVG 里塞满了编辑器元数据（注释、`id="路径_1"`、无用分组），
        图标类文件常常能压掉三到五成 —— 而内联进页面时，每一 KB 都是实打实的；
     ② 改 SVG 最怕"改完不知道长什么样"：这里输入框下面就是预览，不用来回切窗口；
     ③ 压缩**只动标签之间的空白**。SVG 里的 `<text>` 内容是文字，
        `xml:space="preserve"` 更是明确要求保留空白 —— 所以文本节点一个字符都不碰。

   ⚠️ 不做的事：不重写路径、不做几何优化（svgo 那种），也不校验 SVG 合法性。
      这里只做「去冗余空白与注释」这一件确定安全的事。
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

  /* ── 词法：注释 / CDATA / 标签 / 文本 ────────────────────────────────────
     必须按字符扫描而不是正则替换：正则处理不了「引号里的 >」与「CDATA 里的 ]]> 之外的一切」，
     而这些在真实 SVG 里都会出现（比如 path 的 d 属性值里就有引号和尖括号）。 */
  function tokenize(src) {
    var toks = [], i = 0, len = src.length;

    while (i < len) {
      if (src.charAt(i) !== "<") {
        var j = src.indexOf("<", i);
        if (j < 0) j = len;
        toks.push({ t: "text", raw: src.slice(i, j) });
        i = j;
        continue;
      }
      if (src.substr(i, 4) === "<!--") {
        var e1 = src.indexOf("-->", i + 4);
        e1 = e1 < 0 ? len : e1 + 3;
        toks.push({ t: "comment", raw: src.slice(i, e1) });
        i = e1;
        continue;
      }
      if (src.substr(i, 9) === "<![CDATA[") {
        var e2 = src.indexOf("]]>", i + 9);
        e2 = e2 < 0 ? len : e2 + 3;
        toks.push({ t: "cdata", raw: src.slice(i, e2) });
        i = e2;
        continue;
      }
      // 标签：找到不在引号里的 >
      var k = i + 1, q = null, end = -1;
      while (k < len) {
        var c = src.charAt(k);
        if (q) { if (c === q) q = null; }
        else if (c === '"' || c === "'") q = c;
        else if (c === ">") { end = k + 1; break; }
        k++;
      }
      if (end < 0) { toks.push({ t: "text", raw: src.slice(i) }); break; }
      toks.push({ t: "tag", raw: src.slice(i, end) });
      i = end;
    }
    return toks;
  }

  /** 压缩：删注释、删标签之间的纯空白、把标签内部的连续空白折成一个空格 */
  function compress(src) {
    var toks = tokenize(src);
    var out = [];

    toks.forEach(function (tk) {
      if (tk.t === "comment") return;                                  // 编辑器元数据多半在这儿
      if (tk.t === "text") {
        if (/\S/.test(tk.raw)) out.push(tk.raw);                       // 文本节点原样保留
        return;                                                        // 纯空白 ⇒ 只是缩进
      }
      if (tk.t === "tag") {
        // 标签内部：把连续空白折成一个空格（属性之间），但**不动引号里的内容**
        var parts = tk.raw.split(/("[^"]*"|'[^']*')/);
        out.push(parts.map(function (p) {
          return /^["']/.test(p) ? p : p.replace(/\s+/g, " ").replace(/ ?\/?>$/, function (m) { return m.trim() ? m.replace(/^ /, "") : m; });
        }).join(""));
        return;
      }
      out.push(tk.raw);   // CDATA
    });

    return out.join("").replace(/\s?>/, ">").trim();
  }

  /** 取尺寸：优先 width/height，退回 viewBox */
  function svgSize(src) {
    var svg = /<svg[^>]*>/i.exec(src);
    if (!svg) return null;
    var tag = svg[0];
    var w = /\bwidth\s*=\s*["']([^"']+)["']/i.exec(tag);
    var h = /\bheight\s*=\s*["']([^"']+)["']/i.exec(tag);
    var vb = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(tag);
    return {
      w: w ? w[1] : "",
      h: h ? h[1] : "",
      vb: vb ? vb[1] : ""
    };
  }

  /** 预览图：用 data URI 喂给 <img>（比 innerHTML 更安全，也不会执行脚本）
   *  ⚠️ 整段包 try：预览是加分项，而单测环境里的 DOM 极简（没有 parentNode / removeAttribute），
   *  让它把压缩功能一起带崩就本末倒置了。 */
  function preview(svg) {
    try {
      var box = document.getElementById("svgPreview");
      var img = document.getElementById("svgPreviewImg");
      if (!box || !img) return;

      if (!svg || !/<svg[\s>]/i.test(svg)) {
        box.hidden = true;
        if (img.removeAttribute) img.removeAttribute("src");
        return;
      }
      box.hidden = false;
      img.alt = T.previewAlt || "";
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    } catch (e) { /* 看不到预览不要紧，压缩结果照给 */ }
  }

  function build() {
    var raw = input.value;

    if (!raw.trim()) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      preview("");
      return;
    }

    if (!/<svg[\s>]/i.test(raw)) {
      output.value = "";
      status.className = "status err";
      status.textContent = T.errNoSvg || "";
      preview("");
      return;
    }

    var compressed = compress(raw);
    output.value = compressed + "\n";

    var size = svgSize(raw);
    var before = raw.length, after = compressed.length;
    var pct = before ? Math.round((after / before) * 100) : 100;

    var msg = fmt(T.statOk, { a: before, b: after, p: pct });
    if (size && (size.w || size.vb)) {
      msg += " · " + fmt(T.statSize, { w: size.w || "?", h: size.h || "?", vb: size.vb || "—" });
    }
    status.className = "status ok";
    status.textContent = msg;

    preview(compressed);
  }

  /* 预览容器：插在结果框下面 —— 只是显示，不参与布局计算。
     ⚠️ 同样包 try：Node 测试环境里的元素没有 parentNode / nextSibling。 */
  (function ensurePreviewBox() {
    try {
      if (document.getElementById("svgPreview")) return;
      var box = document.createElement("div");
      box.id = "svgPreview";
      box.hidden = true;
      box.style.cssText = "margin:8px 0 4px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;text-align:center";
      var img = document.createElement("img");
      img.id = "svgPreviewImg";
      img.style.cssText = "max-width:100%;max-height:260px;display:inline-block";
      if (!box.appendChild) return;
      box.appendChild(img);
      if (output.parentNode && output.parentNode.insertBefore) output.parentNode.insertBefore(box, output.nextSibling);
      else if (document.body && document.body.appendChild) document.body.appendChild(box);
    } catch (e) { /* 没有预览容器也能用 */ }
  })();

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
