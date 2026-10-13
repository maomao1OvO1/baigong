/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：base32.js —— Base32 / Base58 编解码
   干什么：Base64 之外的两种常见编码。它们的存在理由很具体：
     · **Base32**（RFC 4648）：只用 A-Z 与 2-7，全部是**不易看错**的字符 ——
       适合人工抄写、口播、以及大小写不敏感的场景（比如某些 2FA 密钥、TOTP）。
     · **Base58**：去掉了 0 O I l 这四个易混字符，比特币地址与 IPFS 用的就是它。
   注意：Base58 与 Base32 都是**编码不是加密** —— 页面提示里如实说明，别让人误用。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), mode = $("mode"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear"), swapBtn = $("swap");

  var B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  var B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

  function utf8Bytes(s) { return new TextEncoder().encode(s); }
  function bytesToText(b) { return new TextDecoder("utf-8", { fatal: false }).decode(b); }

  function b32enc(bytes) {
    var bits = 0, value = 0, out = "";
    for (var i = 0; i < bytes.length; i++) {
      value = (value << 8) | bytes[i];
      bits += 8;
      while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    while (out.length % 8) out += "=";          // 补齐到 8 的倍数（RFC 4648 要求）
    return out;
  }
  function b32dec(s) {
    s = s.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
    var bits = 0, value = 0, out = [];
    for (var i = 0; i < s.length; i++) {
      var idx = B32.indexOf(s[i]);
      if (idx < 0) throw new Error((T.errB32 || "invalid Base32 character: ") + s[i]);
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
    }
    return new Uint8Array(out);
  }

  function b58enc(bytes) {
    var digits = [0];
    for (var i = 0; i < bytes.length; i++) {
      var carry = bytes[i];
      for (var j = 0; j < digits.length; j++) {
        carry += digits[j] << 8;
        digits[j] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
    }
    var out = "";
    for (var k = 0; k < bytes.length && bytes[k] === 0; k++) out += B58[0];      // 开头的零字节保持为零字符
    for (var m = digits.length - 1; m >= 0; m--) out += B58[digits[m]];
    return out;
  }
  function b58dec(s) {
    var bytes = [0];
    for (var i = 0; i < s.length; i++) {
      var idx = B58.indexOf(s[i]);
      if (idx < 0) throw new Error((T.errB58 || "invalid Base58 character: ") + s[i]);
      var carry = idx;
      for (var j = 0; j < bytes.length; j++) {
        carry += bytes[j] * 58;
        bytes[j] = carry & 255;
        carry >>= 8;
      }
      while (carry) { bytes.push(carry & 255); carry >>= 8; }
    }
    for (var k = 0; k < s.length && s[k] === B58[0]; k++) bytes.push(0);
    return new Uint8Array(bytes.reverse());
  }

  function run() {
    var text = input.value.replace(/\s/g, "");
    if (!text) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    var dec = mode.value.indexOf("dec") > 0;
    var kind = mode.value.indexOf("b58") === 0 ? "b58" : "b32";
    try {
      if (kind === "b32") {
        output.value = dec ? bytesToText(b32dec(text)) : b32enc(utf8Bytes(input.value));
      } else {
        output.value = dec ? bytesToText(b58dec(text)) : b58enc(utf8Bytes(input.value));
      }
      status.textContent = (dec ? (T.decoded || "decoded") : (T.encoded || "encoded")) + " · " + kind.toUpperCase();
      status.className = "status ok";
    } catch (e) {
      output.value = "";
      status.textContent = (T.fail || "failed") + ": " + e.message;
      status.className = "status err";
    }
  }

  input.addEventListener("input", TP.debounce(run, 180));
  mode.addEventListener("change", run);
  if (swapBtn) swapBtn.addEventListener("click", function () {
    if (!output.value) return;
    input.value = output.value;
    mode.value = mode.value.indexOf("-dec") > 0 ? mode.value.replace("-dec", "-enc") : mode.value.replace("-enc", "-dec");
    run();
  });
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; output.value = ""; status.textContent = ""; });

  run();
})();
