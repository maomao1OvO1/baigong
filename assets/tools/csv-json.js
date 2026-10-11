/* ============================================================================
   文件：csv-json.js —— CSV ⇄ JSON 互转
   干什么：左边贴 CSV（或 JSON 数组），选一下方向，右边出结果。
   为什么 CSV 解析要写成状态机（而不是 split(",")）：因为真实 CSV 里有三种会把 split 搞死的情况 ——
     ① 字段里本身带逗号："北京, 朝阳区" ；
     ② 字段里有换行（Excel 导出的备注列常见）；
     ③ 字段里的引号写成两个引号转义："" → "
     这三种只有逐字符扫描才处理得对。所以下面 parseCsv 老老实实走状态机。
   JSON → CSV 时：键取所有对象的并集（后面的对象多出来的字段不会被丢掉），缺的字段留空。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), mode = $("mode"), delim = $("delim"), header = $("header"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear"), swapBtn = $("swap");

  function delimChar() {
    return delim.value === "tab" ? "\t" : delim.value === "semicolon" ? ";" : ",";
  }

  /** CSV 文本 → 二维数组（状态机，处理引号、逗号、换行） */
  function parseCsv(text, d) {
    var rows = [], row = [], cell = "", inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }     // "" → 一个引号
          else inQuotes = false;
        } else cell += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === d) {
        row.push(cell); cell = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = "";
        rows.push(row); row = [];
      } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    // 丢掉完全空白的尾行（粘贴时常带一个换行）
    return rows.filter(function (r) { return !(r.length === 1 && r[0].trim() === ""); });
  }

  function quote(v, d) {
    var s = v === undefined || v === null ? "" : String(v);
    if (s.indexOf('"') >= 0 || s.indexOf(d) >= 0 || s.indexOf("\n") >= 0 || s.indexOf("\r") >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function csvToJson(text) {
    var d = delimChar();
    var rows = parseCsv(text, d);
    if (!rows.length) return { ok: false, msg: T.emptyInput || "empty input" };
    var keys, dataRows;
    if (header.checked) {
      keys = rows[0].map(function (k, i) { return k.trim() || ("col" + (i + 1)); });
      dataRows = rows.slice(1);
    } else {
      var width = rows.reduce(function (mx, r) { return Math.max(mx, r.length); }, 0);
      keys = [];
      for (var i2 = 0; i2 < width; i2++) keys.push("col" + (i2 + 1));
      dataRows = rows;
    }
    var out = dataRows.map(function (r) {
      var o = {};
      keys.forEach(function (k, i3) {
        var v = r[i3] === undefined ? "" : r[i3];
        // 看起来像数字/布尔就转成对应类型 —— 否则下游拿到全是字符串，还得再转一遍
        if (/^-?\d+(\.\d+)?$/.test(v) && v !== "" && String(Number(v)) === v) o[k] = Number(v);
        else if (v === "true" || v === "false") o[k] = v === "true";
        else o[k] = v;
      });
      return o;
    });
    return { ok: true, text: JSON.stringify(out, null, 2), rows: out.length, cols: keys.length };
  }

  function jsonToCsv(text) {
    var d = delimChar();
    var data;
    try { data = JSON.parse(text); } catch (e) { return { ok: false, msg: (T.badJson || "invalid JSON") + ": " + e.message }; }
    if (!Array.isArray(data)) {
      // 允许传 {"list": [...]} 这类包一层的写法
      var arr = null;
      if (data && typeof data === "object") {
        for (var k in data) { if (Array.isArray(data[k])) { arr = data[k]; break; } }
      }
      if (!arr) return { ok: false, msg: T.needArray || "need an array" };
      data = arr;
    }
    if (!data.length) return { ok: false, msg: T.emptyInput || "empty input" };
    if (typeof data[0] !== "object" || data[0] === null) {
      // 纯值数组 → 一列
      return { ok: true, text: data.map(function (v) { return quote(v, d); }).join("\n"), rows: data.length, cols: 1 };
    }
    var keys = [];
    data.forEach(function (o) {
      Object.keys(o || {}).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    });
    var lines = [];
    if (header.checked) lines.push(keys.map(function (k) { return quote(k, d); }).join(d));
    data.forEach(function (o) {
      lines.push(keys.map(function (k) {
        var v = o ? o[k] : "";
        if (typeof v === "object" && v !== null) v = JSON.stringify(v);      // 嵌套对象压成 JSON 字符串
        return quote(v, d);
      }).join(d));
    });
    return { ok: true, text: lines.join("\n"), rows: data.length, cols: keys.length };
  }

  function run() {
    var text = input.value;
    if (!text.trim()) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    var res = mode.value === "csv2json" ? csvToJson(text) : jsonToCsv(text);
    if (!res.ok) {
      output.value = "";
      status.textContent = res.msg;
      status.className = "status err";
      return;
    }
    output.value = res.text;
    status.textContent = res.rows + " × " + res.cols;
    status.className = "status ok";
  }

  input.addEventListener("input", TP.debounce(run, 200));
  mode.addEventListener("change", run);
  delim.addEventListener("change", run);
  header.addEventListener("change", run);
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  // 「互换」：把结果放回输入框，方向翻过来 —— 连点两下就是一次往返，方便检查有没有丢字段
  swapBtn.addEventListener("click", function () {
    if (!output.value) return;
    input.value = output.value;
    mode.value = mode.value === "csv2json" ? "json2csv" : "csv2json";
    run();
  });
  clearBtn.addEventListener("click", function () { input.value = ""; output.value = ""; status.textContent = ""; });

  run();
})();
