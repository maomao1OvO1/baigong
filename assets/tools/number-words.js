/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：number-words.js —— 数字转中文大写 / 英文读法
   干什么：把一串数字转成中文财务大写（壹佰贰拾叁万肆仟伍佰），或中文读法、英文读法。
   为什么有人需要它：报销单、合同、支票上的金额必须写大写 —— 手写最容易错两处：
     ① 零的位置（1002003 到底几个零）；② 万与亿的分节。
   实现要点：中文按「四位一节」处理（个/万/亿），节内再逐位读，这样 1 亿 2000 万 3 这种
     跨节数字才不会读错；英文同理按千分节，节名 thousand/million/billion。
   ⚠️ 用 Number 而不是 BigInt：金额一般不超过 2^53，超出范围会提示，而不是给出错误答案。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), mode = $("mode"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  var CN_D = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  var CN_U = ["", "十", "百", "千"];
  var CN_BIG = ["", "万", "亿", "万亿"];
  var FIN_D = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
  var FIN_U = ["", "拾", "佰", "仟"];
  var EN_1 = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  var EN_T = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  var EN_BIG = ["", " thousand", " million", " billion", " trillion"];

  /** 节内四位 → 中文（fin 为 true 时用财务大写字符） */
  function section4(n, d, u, fin) {
    var s = "", zero = false;
    for (var pos = 3; pos >= 0; pos--) {
      var digit = Math.floor(n / Math.pow(10, pos)) % 10;
      if (digit === 0) { zero = true; continue; }
      if (zero && s) s += d[0];
      zero = false;
      s += d[digit] + u[pos];
    }
    return s;
  }

  function cnWords(intStr, d, u, big, fin) {
    if (intStr === "0") return d[0];
    var groups = [];
    var rest = intStr;
    while (rest.length) { groups.push(rest.slice(-4)); rest = rest.slice(0, -4); }
    var out = "";
    for (var i = groups.length - 1; i >= 0; i--) {
      var g = parseInt(groups[i], 10);
      if (g === 0) {
        // 整节为零：只在后面还有非零数字时补一个「零」，避免出现两个连续零
        if (out && out.slice(-1) !== d[0] && groups.slice(0, i).some(function (x) { return parseInt(x, 10) !== 0; })) out += d[0];
        continue;
      }
      var seg = section4(g, d, u, fin);
      // 节内不足四位（如 1002 读作一千零二）已经在 section4 处理；这里补跨节的零
      if (out && parseInt(groups[i], 10) < 1000 && out.slice(-1) !== d[0]) out += d[0];
      out += seg + big[i];
    }
    return out;
  }

  function enWords(n) {
    if (n === 0) return "zero";
    var out = "";
    var grp = 0;
    while (n > 0) {
      var part = n % 1000;
      if (part) {
        var s = "";
        var h = Math.floor(part / 100), t = part % 100;
        if (h) s += EN_1[h] + " hundred";
        if (t) {
          if (s) s += " and ";
          if (t < 20) s += EN_1[t];
          else s += EN_T[Math.floor(t / 10)] + (t % 10 ? "-" + EN_1[t % 10] : "");
        }
        out = s + EN_BIG[grp] + (out ? " " + out : "");
      }
      n = Math.floor(n / 1000);
      grp++;
    }
    return out;
  }

  function run() {
    var raw = input.value.trim().replace(/[,\s]/g, "");
    if (!raw) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    if (!/^-?\d+(\.\d+)?$/.test(raw)) {
      output.value = "";
      status.textContent = T.badNumber || "not a number";
      status.className = "status err";
      return;
    }
    var neg = raw[0] === "-";
    var body = neg ? raw.slice(1) : raw;
    var parts = body.split(".");
    var intPart = parts[0].replace(/^0+(?=\d)/, "");
    var frac = parts[1] || "";
    if (intPart.length > 15) {
      output.value = "";
      status.textContent = T.tooBig || "number too large (over 15 digits)";
      status.className = "status err";
      return;
    }

    var lines = [];
    if (mode.value === "cn") {
      lines.push((neg ? "负" : "") + cnWords(intPart, CN_D, CN_U, CN_BIG, false) +
        (frac ? "点" + frac.split("").map(function (c) { return CN_D[+c]; }).join("") : ""));
    } else if (mode.value === "fin") {
      lines.push((neg ? "负" : "") + cnWords(intPart, FIN_D, FIN_U, ["", "万", "亿", "万亿"], true) +
        (frac ? "点" + frac.split("").map(function (c) { return FIN_D[+c]; }).join("") : ""));
    } else {
      var n = Math.floor(Number(body));
      lines.push((neg ? "negative " : "") + enWords(n) + (frac ? " point " + frac.split("").map(function (c) { return EN_1[+c]; }).join(" ") : ""));
    }
    // 顺手给出千分位写法（写文案时常用）
    lines.push("");
    lines.push((T.grouped || "grouped") + ":  " + (neg ? "-" : "") + intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? "." + frac : ""));
    output.value = lines.join("\n");
    status.textContent = T.ok || "converted";
    status.className = "status ok";
  }

  input.addEventListener("input", TP.debounce(run, 150));
  mode.addEventListener("change", run);
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; run(); });

  run();
})();
