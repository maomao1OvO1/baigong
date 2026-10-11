/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：color-palette.js —— 配色板生成（互补 / 类似 / 三角 / 明度阶梯）
   干什么：给一个颜色，算出成套的搭配色，直接抄 hex 值用。
   为什么先转 HSL 再配色：RGB 里「转 180 度」是没有意义的（三个通道各自线性变化），
     而色相环只在 HSL 里成立。所以流程固定是 HEX → HSL → 调 H/S/L → 回 HEX。
   明度阶梯的用途：界面里同一个强调色往往需要 5~7 个深浅档（hover、按下、禁用、浅底），
     手调容易调偏色，按固定 L 值取就能保持同一色相。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), picker = $("color"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  function parseHex(s) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(s).trim());
    if (!m) return null;
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2, h = 0, s = 0;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return { h: h, s: s, l: l };
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    var rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
            : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return "#" + rgb.map(function (v) {
      var n = Math.round((v + m) * 255);
      return (n < 16 ? "0" : "") + n.toString(16);
    }).join("");
  }
  function rgbStr(c) { return "rgb(" + c.r + ", " + c.g + ", " + c.b + ")"; }

  function run() {
    var raw = input.value.trim();
    if (!raw) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    var c = parseHex(raw);
    if (!c) {
      output.value = "";
      status.textContent = T.badColor || "not a valid hex color";
      status.className = "status err";
      return;
    }
    var hsl = rgbToHsl(c.r, c.g, c.b);
    if (picker.value.toLowerCase() !== "#" + [c.r, c.g, c.b].map(function (v) { return (v < 16 ? "0" : "") + v.toString(16); }).join("")) {
      picker.value = hslToHex(hsl.h, hsl.s, hsl.l);   // 让取色器跟着走，双向同步
    }

    var rows = [
      [T.cBase || "Base", hslToHex(hsl.h, hsl.s, hsl.l), rgbStr(c) + "  hsl(" + Math.round(hsl.h) + ", " + Math.round(hsl.s * 100) + "%, " + Math.round(hsl.l * 100) + "%)"],
      [T.cComplement || "Complement", hslToHex(hsl.h + 180, hsl.s, hsl.l), "h+180"],
      [T.cAnalog1 || "Analogous −30", hslToHex(hsl.h - 30, hsl.s, hsl.l), "h−30"],
      [T.cAnalog2 || "Analogous +30", hslToHex(hsl.h + 30, hsl.s, hsl.l), "h+30"],
      [T.cTriad1 || "Triad +120", hslToHex(hsl.h + 120, hsl.s, hsl.l), "h+120"],
      [T.cTriad2 || "Triad +240", hslToHex(hsl.h + 240, hsl.s, hsl.l), "h+240"]
    ];
    var lines = rows.map(function (r) { return (r[0] + "                      ").slice(0, 20) + r[1] + "   " + r[2]; });
    lines.push("");
    lines.push(T.cShades || "Lightness ladder (same hue, 7 steps)");
    lines.push("──────────────────────────────");
    var ladder = [];
    for (var i = 0; i < 7; i++) {
      var l = 0.92 - i * 0.14;                          // 0.92 → 0.08
      ladder.push(hslToHex(hsl.h, hsl.s, l) + "  " + Math.round(l * 100) + "%");
    }
    lines.push(ladder.join("\n"));
    output.value = lines.join("\n");
    status.textContent = T.cOk || "palette ready";
    status.className = "status ok";
  }

  input.addEventListener("input", TP.debounce(run, 150));
  if (picker) picker.addEventListener("input", function () { input.value = picker.value; run(); });
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; output.value = ""; status.textContent = ""; });

  run();
})();
