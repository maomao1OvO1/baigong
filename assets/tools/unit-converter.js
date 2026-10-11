/* ============================================================================
   文件：unit-converter.js —— 单位换算（长度 / 重量 / 温度）
   设计取舍：不做「一个页面一个单位对」那种站群（那是 SEO 垃圾做法）。
   这里用一张换算表 + 一次输入算出全部同类别单位 —— 用户要的是答案，不是点击。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var category = $("category"), value = $("value"), output = $("output");

  /* 换算表：一律「1 单位 = 多少基准单位」。温度不是线性比例，单独处理。 */
  var tables = {
    length: {
      label: T.catLength, base: "m",
      units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 }
    },
    weight: {
      label: T.catWeight, base: "kg",
      units: { mg: 1e-6, g: 0.001, kg: 1, t: 1000, oz: 0.028349523125, lb: 0.45359237 }
    },
    data: {
      label: T.catData, base: "MB",
      units: { B: 1e-6, KB: 0.001, MB: 1, GB: 1000, TB: 1e6 }
    }
  };

  function format(n) {
    if (!isFinite(n)) return "—";
    if (n === 0) return "0";
    var abs = Math.abs(n);
    if (abs >= 1e9 || abs < 1e-6) return n.toExponential(4);
    return String(parseFloat(n.toPrecision(8)));
  }

  function convertTemperature(v, from, to) {
    var c = from === "C" ? v : (from === "F" ? (v - 32) * 5 / 9 : v - 273.15);
    return to === "C" ? c : (to === "F" ? c * 9 / 5 + 32 : c + 273.15);
  }

  function run() {
    var v = parseFloat(value.value);
    var cat = category.value;
    var out = [];
    if (cat === "temp") {
      if (!isFinite(v)) { output.value = ""; return; }
      out = ["C", "F", "K"].map(function (u) {
        return u + "  " + format(convertTemperature(v, "C", u));
      });
      output.value = (T.fromCelsius || "Input is °C") + "\n" + out.join("\n");
      return;
    }
    var table = tables[cat];
    if (!isFinite(v)) { output.value = ""; return; }
    var 基准 = v * table.units["m"] * (cat === "length" ? 1 : 1);   // 输入按表格里的第一个单位算（m/kg/MB）
    Object.keys(table.units).forEach(function (u) {
      out.push(u + "  " + format(基准 / table.units[u]));
    });
    output.value = out.join("\n");
  }

  /** 温度类别时把提示换掉（其它类别首行写「输入按 X 计」） */
  function initCategory() {
    var cat = category.value;
    var first = cat === "temp" ? "C" : (cat === "weight" ? "kg" : (cat === "data" ? "MB" : "m"));
    $("unitLabel").textContent = first;
    run();
  }

  category.addEventListener("change", initCategory);
  value.addEventListener("input", TP.debounce(run, 150));
  $("copy").addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  $("clear").addEventListener("click", function () { value.value = ""; output.value = ""; });

  initCategory();
})();
