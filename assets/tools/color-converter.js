/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：color-converter.js —— HEX / RGB / HSL 互转（输入任意一种，三种全出）
   设计取舍：不做「先选格式再输」——用户手里有什么就粘什么，自动识别即可，
   少一步操作就是少一次放弃。识别顺序：HEX → rgb() → hsl()。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output");

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  /** 解析任意一种颜色写法 → {r,g,b}（0-255）；认不出来返回 null */
  function parse(text) {
    var s = String(text || "").trim().toLowerCase();
    var m;
    if ((m = /^#?([0-9a-f]{3})$/.exec(s))) {
      var h3 = m[1];
      return { r: parseInt(h3[0] + h3[0], 16), g: parseInt(h3[1] + h3[1], 16), b: parseInt(h3[2] + h3[2], 16) };
    }
    if ((m = /^#?([0-9a-f]{6})$/.exec(s))) {
      return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16) };
    }
    if ((m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(s))) {
      return { r: clamp(+m[1], 0, 255), g: clamp(+m[2], 0, 255), b: clamp(+m[3], 0, 255) };
    }
    if ((m = /hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/.exec(s))) {
      return hslToRgb(+m[1], +m[2], +m[3]);
    }
    return null;
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2, d = max - min;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = l - c / 2, rgb = [0, 0, 0];
    if (h < 60) rgb = [c, x, 0]; else if (h < 120) rgb = [x, c, 0];
    else if (h < 180) rgb = [0, c, x]; else if (h < 240) rgb = [0, x, c];
    else if (h < 300) rgb = [x, 0, c]; else rgb = [c, 0, x];
    return { r: Math.round((rgb[0] + m) * 255), g: Math.round((rgb[1] + m) * 255), b: Math.round((rgb[2] + m) * 255) };
  }

  function hex2(n) { return n.toString(16).padStart(2, "0"); }

  function run() {
    var rgb = parse(input.value);
    if (!rgb) { output.value = ""; return; }
    var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    var hex = "#" + hex2(rgb.r) + hex2(rgb.g) + hex2(rgb.b);
    output.value =
      "HEX  " + hex + "\n" +
      "RGB  rgb(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ")\n" +
      "HSL  hsl(" + hsl.h + ", " + hsl.s + "%, " + hsl.l + "%)";
    var swatch = $("swatch");
    if (swatch) swatch.style.background = hex;
  }

  input.addEventListener("input", TP.debounce(run, 120));
  // 取色器：选了颜色就回填到输入框（否则用户点它没反应，会以为坏了）
  var picker = $("picker");
  if (picker) picker.addEventListener("input", function () { input.value = picker.value; run(); });
  $("copy").addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  $("clear").addEventListener("click", function () { input.value = ""; output.value = ""; });

  run();
})();
