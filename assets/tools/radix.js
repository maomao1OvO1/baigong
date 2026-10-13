/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：radix.js —— 进制转换（2 / 8 / 10 / 16 / 36 + 位视图）
   干什么：一个数字，同时给出各进制的写法，外加二进制分组视图和字节占用。
   为什么用 BigInt 而不是 Number：JavaScript 的 Number 只能精确表示 2^53 以内的整数，
     而哈希值、雪花 ID、权限掩码这类数字动辄 18~20 位 —— 用 Number 会在末位悄悄变值，
     这类"看起来对、其实错了"的 bug 最难查，所以这里全程 BigInt。
   自动识别（auto）的规则：0x/0b/0o 前缀按对应进制，带 a-f 字母按 16 进制，其余按 10 进制。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), base = $("base"), group = $("group"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  /** 把用户输入解析成 BigInt；失败返回 null（错误信息由调用方给） */
  function parse(text, mode) {
    var s = text.trim().replace(/[\s_]/g, "");
    if (!s) return null;
    var sign = 1n;
    if (s[0] === "+" ) s = s.slice(1);
    else if (s[0] === "-") { sign = -1n; s = s.slice(1); }
    var radix = 10;
    if (mode === "auto") {
      if (/^0[xX]/.test(s)) { radix = 16; s = s.slice(2); }
      else if (/^0[bB]/.test(s)) { radix = 2; s = s.slice(2); }
      else if (/^0[oO]/.test(s)) { radix = 8; s = s.slice(2); }
      else if (/[a-fA-F]/.test(s)) { radix = 16; }
    } else {
      radix = parseInt(mode, 10);
      if (radix === 16) s = s.replace(/^0[xX]/, "");
      if (radix === 2) s = s.replace(/^0[bB]/, "");
      if (radix === 8) s = s.replace(/^0[oO]/, "");
    }
    var digits = "0123456789abcdefghijklmnopqrstuvwxyz".slice(0, radix);
    s = s.toLowerCase();
    for (var i = 0; i < s.length; i++) {
      if (digits.indexOf(s[i]) < 0) return null;      // 出现了该进制里不存在的字符
    }
    try { return parseBig(s, radix, sign); } catch (e) { return null; }
  }

  /** BigInt 手写按位累乘 —— BigInt(str, radix) 只接受字面量写法，这里要通用所以自己算 */
  function parseBig(s, radix, sign) {
    var r = BigInt(radix), v = 0n;
    for (var i = 0; i < s.length; i++) {
      v = v * r + BigInt(parseInt(s[i], radix));
    }
    return sign * v;
  }

  function run() {
    var text = input.value;
    if (!text.trim()) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    var v = parse(text, base.value);
    if (v === null) {
      output.value = "";
      status.textContent = T.badNumber || "not a valid number";
      status.className = "status err";
      return;
    }
    var neg = v < 0n, abs = neg ? -v : v;
    var bin = abs.toString(2);
    // 位视图：按 4 位（半字节）分组，不足前面补 0
    var pad = group.value === "4" ? 4 : 8;
    while (bin.length % pad !== 0) bin = "0" + bin;
    var grouped = [];
    for (var i = 0; i < bin.length; i += pad) grouped.push(bin.slice(i, i + pad));
    var bytes = Math.ceil(bin.length / 8);
    var lines = [
      "DEC   " + v.toString(10),
      "HEX   " + (neg ? "-" : "") + "0x" + abs.toString(16),
      "BIN   " + (neg ? "-" : "") + "0b" + abs.toString(2),
      "OCT   " + (neg ? "-" : "") + "0o" + abs.toString(8),
      "36    " + v.toString(36),
      "",
      (T.bitsLabel || "bits") + "  " + abs.toString(2).length + "  ·  " + (T.bytesLabel || "bytes") + " " + bytes,
      (T.groupLabel || "bits") + "  " + (neg ? "-" : "") + grouped.join(" ")
    ];
    output.value = lines.join("\n");
    status.textContent = v.toString(10).length + " " + (T.digitsLabel || "digits");
    status.className = "status ok";
  }

  input.addEventListener("input", TP.debounce(run, 150));
  base.addEventListener("change", run);
  group.addEventListener("change", run);
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; run(); });

  run();
})();
