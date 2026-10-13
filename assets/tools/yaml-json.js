/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：yaml-json.js —— YAML 与 JSON 互转
   干什么：把一份 YAML 转成 JSON（或反过来），用于改配置文件、看 K8s / CI 的 yaml。
   支持范围（**刻意做成常用子集，不是完整 YAML 规范**，页面提示里也如实写明）：
     · 键值对、嵌套缩进、数组（- 开头）、行内数组 [a, b]、行内对象 {a: 1}
     · 字符串/数字/布尔/null 自动识别；引号包起来的按字符串处理
     · # 注释、多行文本块 | 与 >
   不支持：锚点 &/*、标签 !!、复杂流式语法、多文档 --- 分隔
     —— 遇到这些会直接报错并指出行号，而不是悄悄给出错误结果（这点很重要：
        "看起来对、其实错了"的转换比报错危险得多）。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), mode = $("mode"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear"), swapBtn = $("swap");

  /* ── YAML → 值 ─────────────────────────────────────────────────────── */
  function parseYaml(text) {
    var lines = text.replace(/\r\n?/g, "\n").split("\n");
    var i = 0;

    function indentOf(s) { var m = /^(\s*)/.exec(s); return m[1].length; }
    function stripComment(s) {
      // 只处理不在引号里的 #
      var q = null;
      for (var k = 0; k < s.length; k++) {
        var c = s[k];
        if (q) { if (c === q) q = null; continue; }
        if (c === '"' || c === "'") { q = c; continue; }
        if (c === "#" && (k === 0 || /\s/.test(s[k - 1]))) return s.slice(0, k);
      }
      return s;
    }
    function scalar(v) {
      v = v.trim();
      if (v === "" ) return null;
      if (/^"(.*)"$/.test(v)) return v.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
      if (/^'(.*)'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
      if (v === "true" || v === "yes" || v === "on") return true;
      if (v === "false" || v === "no" || v === "off") return false;
      if (v === "null" || v === "~") return null;
      if (/^-?\d+$/.test(v)) return parseInt(v, 10);
      if (/^-?\d*\.\d+([eE][+-]?\d+)?$/.test(v)) return parseFloat(v);
      if (/^\[.*\]$/.test(v)) {
        var inner = v.slice(1, -1).trim();
        return inner === "" ? [] : inner.split(",").map(function (x) { return scalar(x); });
      }
      if (/^\{.*\}$/.test(v)) {
        var o = {}, body = v.slice(1, -1).trim();
        if (!body) return o;
        body.split(",").forEach(function (pair) {
          var m = /^\s*([^:]+):\s*(.*)$/.exec(pair);
          if (m) o[m[1].trim()] = scalar(m[2]);
        });
        return o;
      }
      return v;
    }

    function parseBlock(minIndent) {
      var first = null;
      // 找到第一行有效内容决定是数组还是对象
      for (var k = i; k < lines.length; k++) {
        var t = stripComment(lines[k]).trimEnd();
        if (t.trim() === "" || t.trim() === "---") continue;
        if (indentOf(t) < minIndent) return null;
        first = { s: t, ind: indentOf(t) };
        break;
      }
      if (!first) return null;
      var isArray = first.s.trim().indexOf("- ") === 0 || first.s.trim() === "-";
      var out = isArray ? [] : {};

      while (i < lines.length) {
        var rawLine = lines[i];
        var line = stripComment(rawLine).trimEnd();
        if (line.trim() === "" || line.trim() === "---") { i++; continue; }
        var ind = indentOf(line);
        if (ind < minIndent) break;
        if (ind > minIndent) throw new Error((T.errIndent || "unexpected indent at line {n}").replace("{n}", i + 1));

        var body = line.trim();
        if (isArray) {
          if (body.indexOf("- ") !== 0 && body !== "-") break;
          var restRaw = body === "-" ? "" : body.slice(2);
          var restInd = ind + 2;
          i++;
          if (restRaw.trim() === "") {
            var sub = parseBlockAt(restInd);
            out.push(sub === null ? null : sub);
          } else if (/^[^:]+:\s*/.test(restRaw) && restRaw.indexOf(": ") > 0) {
            // - key: value 形式：先造对象，再把它后面同缩进的兄弟键并进来
            var obj = {};
            var m = /^([^:]+):\s*(.*)$/.exec(restRaw);
            obj[m[1].trim()] = m[2].trim() === "" ? parseBlockAt(restInd + 2) : scalar(m[2]);
            var more = parseBlockAt(restInd);
            if (more && typeof more === "object" && !Array.isArray(more)) {
              Object.keys(more).forEach(function (kk) { obj[kk] = more[kk]; });
            }
            out.push(obj);
          } else {
            out.push(scalar(restRaw));
          }
        } else {
          var mm = /^([^:]+):\s*(.*)$/.exec(body);
          if (!mm) throw new Error((T.errKeyValue || "expected key: value at line {n}").replace("{n}", i + 1));
          var key = mm[1].trim().replace(/^["']|["']$/g, "");
          var valRaw = mm[2];
          i++;
          if (valRaw === "" || valRaw === "|" || valRaw === ">") {
            if (valRaw === "|" || valRaw === ">") {
              var buf = [];
              while (i < lines.length && (lines[i].trim() === "" || indentOf(lines[i]) > ind)) {
                buf.push(lines[i].replace(/^\s{0,100}/, "")); i++;
              }
              out[key] = valRaw === "|" ? buf.join("\n").replace(/\s+$/, "") : buf.join(" ").trim();
            } else {
              // 空值：可能是嵌套块，也可能真的是 null
              var look = null;
              for (var z = i; z < lines.length; z++) {
                var cand = stripComment(lines[z]).trimEnd();
                if (cand.trim() === "") continue;
                if (indentOf(cand) > ind) look = indentOf(cand);
                break;
              }
              out[key] = look === null ? null : parseBlockAt(look);
            }
          } else {
            out[key] = scalar(valRaw);
          }
        }
      }
      return out;
    }
    function parseBlockAt(ind) { return parseBlock(ind); }

    var result = parseBlock(0);
    // 顶层只允许一个文档；多个文档直接拒绝（免得静默丢掉后面的内容）
    for (var k = i; k < lines.length; k++) {
      var t = stripComment(lines[k]).trimEnd();
      if (t.trim() !== "" && t.trim() !== "---") throw new Error((T.errMultiDoc || "multiple documents are not supported (line {n})").replace("{n}", k + 1));
    }
    return result;
  }

  /* ── 值 → YAML ─────────────────────────────────────────────────────── */
  function toYaml(v, ind) {
    ind = ind || 0;
    var pad = new Array(ind + 1).join(" ");
    if (v === null || v === undefined) return "null";
    if (typeof v !== "object") {
      if (typeof v === "string") {
        if (v === "" || /[:#\-\[\]{}]|^\s|\s$/.test(v) || /^(true|false|null|yes|no|on|off|~)$/.test(v) || /^-?\d/.test(v)) {
          return JSON.stringify(v);
        }
        return v;
      }
      return String(v);
    }
    if (Array.isArray(v)) {
      if (!v.length) return "[]";
      return v.map(function (item) {
        var s = toYaml(item, ind + 2);
        if (s.indexOf("\n") >= 0) return pad + "-\n" + s;
        return pad + "- " + s;
      }).join("\n");
    }
    var keys = Object.keys(v);
    if (!keys.length) return "{}";
    return keys.map(function (k) {
      var s = toYaml(v[k], ind + 2);
      if (s.indexOf("\n") >= 0) return pad + k + ":\n" + s;
      return pad + k + ": " + s;
    }).join("\n");
  }

  function run() {
    var text = input.value;
    if (!text.trim()) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    try {
      if (mode.value === "y2j") {
        var v = parseYaml(text);
        output.value = JSON.stringify(v, null, 2);
        status.textContent = T.yamlOk || "converted";
      } else {
        var obj = JSON.parse(text);
        output.value = toYaml(obj, 0);
        status.textContent = T.jsonOk || "converted";
      }
      status.className = "status ok";
    } catch (e) {
      output.value = "";
      status.textContent = (mode.value === "y2j" ? (T.badYaml || "YAML error") : (T.badJson || "JSON error")) + ": " + e.message;
      status.className = "status err";
    }
  }

  input.addEventListener("input", TP.debounce(run, 250));
  mode.addEventListener("change", run);
  if (swapBtn) swapBtn.addEventListener("click", function () {
    if (!output.value) return;
    input.value = output.value;
    mode.value = mode.value === "y2j" ? "j2y" : "y2j";
    run();
  });
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; output.value = ""; status.textContent = ""; });

  run();
})();
