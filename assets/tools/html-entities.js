/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：html-entities.js —— HTML 实体编解码
   干什么：把 HTML 片段里的特殊字符转成实体（防注入 / 防解析），或把实体还原成原字符。
   为什么顺序不能反（编码时）：必须先转义 & 再转其它字符。
     如果反过来 —— 先把 < 转成 &lt;，再去转 &，那么刚生成的 &lt; 会被自己再转一次，
     变成 &amp;lt;（双重转义）。这是新手最常踩的坑，页面上显示出来就是一堆乱码。
   为什么非 ASCII 要单独开关：中文页面上把「中」写成 &#x4E2D; 会让源码长好几倍，
     只有需要「纯 ASCII 输出」（邮件模板、老系统、某些 API）时才值得开。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), mode = $("mode"), all = $("all"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear"), swapBtn = $("swap");

  var NAMED_ENCODE = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  var NAMED_DECODE = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0",
    copy: "©", reg: "®", trade: "™", hellip: "…", mdash: "—", ndash: "–",
    ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", times: "×", divide: "÷",
    laquo: "«", raquo: "»", deg: "°", middot: "·", bull: "•", euro: "€", pound: "£", yen: "¥"
  };

  function encode(text, allNonAscii) {
    var s = text.replace(/[&<>"']/g, function (c) { return NAMED_ENCODE[c]; });
    if (allNonAscii) {
      // ⚠️ 必须带 u 标志：否则 emoji（代理对）会被拆成两半，各自转成一个错误的实体
      s = s.replace(/[^\x00-\x7F]/gu, function (c) {
        return "&#x" + c.codePointAt(0).toString(16).toUpperCase() + ";";
      });
    }
    return s;
  }

  function fromCodePoint(n) {
    if (!isFinite(n) || n < 0 || n > 0x10ffff) return "";
    try { return String.fromCodePoint(n); } catch (e) { return ""; }
  }

  function decode(text) {
    return text
      .replace(/&#x([0-9a-f]{1,6});/gi, function (m, h) { return fromCodePoint(parseInt(h, 16)) || m; })
      .replace(/&#(\d{1,7});/g, function (m, d) { return fromCodePoint(parseInt(d, 10)) || m; })
      .replace(/&([a-z]{2,7});/gi, function (m, name) {
        var v = NAMED_DECODE[name.toLowerCase()];
        return v === undefined ? m : v;      // 认不出来的实体原样保留，不擅自删掉
      });
  }

  function run() {
    var text = input.value;
    if (!text) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    var isEncode = mode.value === "encode";
    output.value = isEncode ? encode(text, all.checked) : decode(text);
    // 计数：编码看生成了多少实体，解码看还原了多少个字符
    var n = isEncode ? (output.value.match(/&[#a-zA-Z0-9]+;/g) || []).length
                     : (text.match(/&[#a-zA-Z0-9]+;/g) || []).length;
    status.textContent = (isEncode ? (T.entitiesOut || "entities") : (T.entitiesIn || "entities decoded")) + ": " + n;
    status.className = "status ok";
    all.disabled = !isEncode;    // 「转义非 ASCII」只在编码方向有意义
  }

  input.addEventListener("input", TP.debounce(run, 150));
  mode.addEventListener("change", run);
  all.addEventListener("change", run);
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  // 「互换」：把结果搬回输入框并翻转方向 —— 来回点两下就是一次往返校验
  if (swapBtn) swapBtn.addEventListener("click", function () {
    if (!output.value) return;
    input.value = output.value;
    mode.value = mode.value === "encode" ? "decode" : "encode";
    run();
  });
  clearBtn.addEventListener("click", function () { input.value = ""; output.value = ""; status.textContent = ""; });

  run();
})();
