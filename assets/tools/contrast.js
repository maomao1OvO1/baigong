/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：contrast.js —— 颜色对比度检查（WCAG）
   干什么：给两个颜色（前景 / 背景），算出 WCAG 规定的对比度比值，
          再逐条判定 AA / AAA 有没有达标 —— 分「正常文字」和「大字」两档。

   为什么值得做成工具：
     ① 对比度不是「看着够清楚就行」—— 它是 4.5 : 1 这样的硬数字，肉眼估不准。
        典型的翻车配色：浅灰底配中灰字，看着挺清楚，实测只有 3.9 : 1，AA 就是不过。
     ② 这是无障碍合规的硬指标（政府站点、App 上架、欧盟无障碍法案都会查它），
        而设计稿里那两个十六进制值是看不出比值的。
     ③ 「大字」的门槛**比正常文字低**（3 : 1 而不是 4.5 : 1）—— 这条规则知道的人不多，
        标题被误判成不达标、或者正文照大字的门槛放过，都是常见的错。

   算法：WCAG 2.1 的相对亮度 + 对比度公式（sRGB 先线性化，再加权求和）。
   ⚠️ 公式里两端各加 0.05 是**规定**，不是凑数字：它让比值范围落在 1 : 1 ~ 21 : 1，
      并且保证「浅色在前」和「深色在后」得到同一个结果 —— 所以本工具不区分前后顺序。
   ⚠️ 别用「RGB 平均值」估算亮度：人眼对绿色最敏感、对蓝色最不敏感（权重 0.7152 / 0.0722），
      拿平均值算会把 #00ff00 和 #0000ff 判成一样亮，结论就是错的。

   输入：第一行前景色、第二行背景色；只写一行时背景按白色算。
   认得出的写法：#rgb · #rrggbb · rgb(r,g,b)（也接受不带 # 的六位十六进制）。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  /* AA / AAA 的门槛值（WCAG 2.1 里的原文数字）——
     正常文字 4.5 / 7，大字 3 / 4.5。
     「大字」的定义：≥ 18.66px 的粗体，或者 ≥ 24px 的普通字体。 */
  var NEED = { normalAA: 4.5, normalAAA: 7, largeAA: 3, largeAAA: 4.5 };

  /** 把 {n} 换成实际数字 —— 三语模板都放在 i18n 里，脚本这边只管填值 */
  function fmt(tpl, vars) {
    var s = String(tpl == null ? "" : tpl);
    return s.replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  /** 解析颜色字符串 → {r,g,b}；认不出返回 null（不猜、不糊弄） */
  function parseColor(raw) {
    var s = String(raw == null ? "" : raw).trim();
    if (!s) return null;

    // 十六进制：3 位缩写和 6 位完整写法（设计稿里复制出来常常没有 #）
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16)
      };
    }

    // rgb(1,2,3) / rgb(1 2 3) / rgb(1,2,3,0.5) —— 逗号与空格混用都要认（各家工具导出的格式不一样）
    m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(s);
    if (m) {
      var r = +m[1], g = +m[2], b = +m[3];
      if (r > 255 || g > 255 || b > 255) return null;   // 越界说明这行根本不是颜色，别硬算
      return { r: r, g: g, b: b };
    }

    // 十六进制里带中文全角井号（从设计软件里复制常见）—— 单独兜一下
    m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.replace(/^＃/, ""));
    if (m) {
      var h2 = m[1];
      if (h2.length === 3) h2 = h2[0] + h2[0] + h2[1] + h2[1] + h2[2] + h2[2];
      return {
        r: parseInt(h2.slice(0, 2), 16),
        g: parseInt(h2.slice(2, 4), 16),
        b: parseInt(h2.slice(4, 6), 16)
      };
    }
    return null;
  }

  /** 相对亮度（WCAG 2.1 定义）：每个通道先转成 0~1，
   *  再按 sRGB 的伽马校正线性化，最后按人眼敏感度加权。 */
  function luminance(c) {
    function channel(v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
  }

  /** 对比度比值 =（较亮 + 0.05）/（较暗 + 0.05）—— 顺序无关，所以先比大小 */
  function contrastRatio(a, b) {
    var la = luminance(a), lb = luminance(b);
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  /** 十六进制回写（报告里统一按 #rrggbb 展示，跟设计稿对齐） */
  function hex(c) {
    function p(v) { return ("0" + v.toString(16)).slice(-2); }
    return "#" + p(c.r) + p(c.g) + p(c.b);
  }

  /** 判定一行：达标写 PASS、不达标写 FAIL（两个词都走 i18n，英文原文在三语里保留） */
  function verdict(ratio, need) {
    return (ratio >= need ? T.pass : T.fail) + "（" + ratio.toFixed(2) + " : 1）";
  }

  function build() {
    var lines = String(input.value || "").split(/\r?\n/).map(function (s) { return s.trim(); });

    // 空输入时给一对默认色（黑字白底）—— 页面一进来就有结果，不是空白一片
    var fgRaw = lines[0] || "#000000";
    var bgRaw = lines[1] || "#ffffff";

    var fg = parseColor(fgRaw), bg = parseColor(bgRaw);

    if (!fg || !bg) {
      output.value = "";
      status.className = "status err";
      status.textContent = fmt(T.badColor, { s: !fg ? fgRaw : bgRaw });
      return;
    }

    var ratio = contrastRatio(fg, bg);

    var out = [];
    out.push(fmt(T.head, { fg: hex(fg), bg: hex(bg), ratio: ratio.toFixed(2) }));
    out.push("");
    out.push(hex(fg) + " → " + fmt(T.rowNormalAA, { need: NEED.normalAA }) + " " + verdict(ratio, NEED.normalAA));
    out.push(hex(fg) + " → " + fmt(T.rowNormalAAA, { need: NEED.normalAAA }) + " " + verdict(ratio, NEED.normalAAA));
    out.push(hex(fg) + " → " + fmt(T.rowLargeAA, { need: NEED.largeAA }) + " " + verdict(ratio, NEED.largeAA));
    out.push(hex(fg) + " → " + fmt(T.rowLargeAAA, { need: NEED.largeAAA }) + " " + verdict(ratio, NEED.largeAAA));
    out.push("");
    out.push(fmt(T.noteLarge, { px1: "18.66px", px2: "24px" }));
    output.value = out.join("\n");

    status.className = "status";
    status.textContent = fmt(T.statOk, {
      ratio: ratio.toFixed(2),
      ok: [NEED.normalAA, NEED.normalAAA, NEED.largeAA, NEED.largeAAA].filter(function (n) { return ratio >= n; }).length,
      all: 4
    });
  }

  /* 输入用防抖：一边敲十六进制一边重算，逐字符重建整份报告没必要 */
  input.addEventListener("input", TP.debounce(build, 120));

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

  build();   // 首屏先跑一遍：默认一对黑白，直接给出 21 : 1 让用户知道这工具怎么读
})();
