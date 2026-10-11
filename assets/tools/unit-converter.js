/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：unit-converter.js —— 单位换算（长度 / 重量 / 数据大小 / 温度）
   设计取舍：不做「一个页面一个单位对」那种站群（SEO 垃圾做法）。
             这里一张换算表 + 一次输入，同类别单位全部算出来。
   ⚠️ 修过的坑（2026-10-11，毛毛反馈「单位换算用不了」）：
     1) 原算法写死 `units["m"]` 当基准 —— 但重量表里没有 m、数据表里也没有 m，
        结果 NaN，重量与数据两类直接废掉。改成用每张表自己的 `base` 字段。
     2) 页面曾经没有 #output 元素（生成器把输入输出一起省了），脚本往空元素写值直接报错。
        生成器已改为「输出区永远生成」。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var category = $("category"), value = $("value"), output = $("output");

  /* units：1 个该单位等于多少「基准单位」；base 同时表示「输入框里填的是哪个单位」 */
  var tables = {
    length: { base: "m",  units: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 } },
    weight: { base: "kg", units: { mg: 1e-6, g: 0.001, kg: 1, t: 1000, oz: 0.028349523125, lb: 0.45359237 } },
    data:   { base: "MB", units: { B: 1e-6, KB: 0.001, MB: 1, GB: 1000, TB: 1e6 } }
  };

  function format(n) {
    if (!isFinite(n)) return "—";
    if (n === 0) return "0";
    var abs = Math.abs(n);
    if (abs >= 1e9 || abs < 1e-6) return n.toExponential(4);
    return String(parseFloat(n.toPrecision(8)));
  }

  function toAll(v, cat) {
    var table = tables[cat];
    if (!table) return [];
    var baseValue = v * table.units[table.base];   // 先换成基准单位，再换成其它单位
    return Object.keys(table.units).map(function (u) {
      return u + "  " + format(baseValue / table.units[u]);
    });
  }

  function fromCelsius(v) {
    return ["C", "F", "K"].map(function (u) {
      var r = u === "C" ? v : (u === "F" ? v * 9 / 5 + 32 : v + 273.15);
      return u + "  " + format(r);
    });
  }

  function run() {
    var cat = category.value;
    var v = parseFloat(value.value);
    var unitBadge = $("unitLabel");

    // ⚠️ 温度必须先处理：它不在 tables 里（非线性，用公式算），
    //    如果先查 tables 再防御，温度会被当成「未知类别」直接清空输出（测试抓到过这个）。
    if (cat === "temp") {
      if (unitBadge) unitBadge.textContent = "°C";
      output.value = isFinite(v) ? fromCelsius(v).join("\n") : "";
      return;
    }
    var table = tables[cat];
    if (!table) { output.value = ""; return; }            // 类别值异常时安静清空，不抛错
    if (unitBadge) unitBadge.textContent = table.base;    // 输入单位提示（m / kg / MB）
    output.value = isFinite(v) ? toAll(v, cat).join("\n") : "";
  }

  category.addEventListener("change", run);
  value.addEventListener("input", TP.debounce(run, 120));
  $("copy").addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  $("clear").addEventListener("click", function () { value.value = ""; output.value = ""; });

  run();
})();
