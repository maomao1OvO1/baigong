/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：password-gen.js —— 密码生成器（本地随机，绝不上传）
   安全性说明（必须写清，否则就是"胡闹"）：
     · 用 crypto.getRandomValues（操作系统级 CSPRNG）；**不用 Math.random** —— 后者可预测；
     · 页面不联网、不记录、不保存，生成的密码只存在于你的输入框里；
     · 强度估算按「字符集大小 ^ 长度」折算成比特熵，是最保守的下界。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var length = $("length"), lengthVal = $("lengthVal"), output = $("output");
  var upper = $("upper"), lower = $("lower"), digits = $("digits"), symbols = $("symbols");
  var runBtn = $("run"), copyBtn = $("copy"), clearBtn = $("clear"), meter = $("meter");

  var SETS = {
    upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    lower: "abcdefghijklmnopqrstuvwxyz",
    digits: "0123456789",
    symbols: "!@#$%^&*()-_=+[]{};:,.?/~"
  };

  function pick(pool) {
    // 拒绝采样：避免取模偏置（简单实现里最常见的错误）
    var max = Math.floor(256 / pool.length) * pool.length;
    var buf = new Uint8Array(1);
    for (; ;) {
      crypto.getRandomValues(buf);
      if (buf[0] < max) return pool[buf[0] % pool.length];
    }
  }

  function generate() {
    var pools = [];
    ["upper", "lower", "digits", "symbols"].forEach(function (k) {
      var box = { upper: upper, lower: lower, digits: digits, symbols: symbols }[k];
      if (box && box.checked) pools.push(SETS[k]);
    });
    if (!pools.length) pools = [SETS.lower];
    var all = pools.join("");
    var len = parseInt(length.value, 10) || 16;
    var out = [];
    // 先保证每类至少一个，再补足长度（否则"勾了符号却一个符号都没有"）
    pools.forEach(function (p) { out.push(pick(p)); });
    while (out.length < len) out.push(pick(all));
    // 洗牌（同样用 crypto 随机）
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor((crypto.getRandomValues(new Uint8Array(1))[0] / 256) * (i + 1));
      var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out.slice(0, len).join("");
  }

  function strength(pw) {
    var pools = 0;
    if (/[a-z]/.test(pw)) pools += 26;
    if (/[A-Z]/.test(pw)) pools += 26;
    if (/[0-9]/.test(pw)) pools += 10;
    if (/[^a-zA-Z0-9]/.test(pw)) pools += 25;
    var bits = pw.length * Math.log2(pools || 1);
    if (bits >= 100) return T.strengthVeryStrong;
    if (bits >= 75) return T.strengthStrong;
    if (bits >= 55) return T.strengthGood;
    return T.strengthWeak;
  }

  function run() {
    if (lengthVal) lengthVal.textContent = length.value;
    var pw = generate();
    output.value = pw;
    if (meter) meter.textContent = (T.strength || "Strength") + ": " + strength(pw) +
      "  ·  " + Math.round(output.value.length * Math.log2(90)) + " bits";
  }

  length.addEventListener("input", run);
  [upper, lower, digits, symbols].forEach(function (b) { if (b) b.addEventListener("change", run); });
  runBtn.addEventListener("click", run);
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { output.value = ""; if (meter) meter.textContent = ""; });

  run();
})();
