/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：hash.js —— 文本哈希：MD5 / SHA-1 / SHA-256 / SHA-512
   干什么：把输入框里的文字算成摘要，同时给出 hex 与 base64 两种写法。
   为什么要 MD5 单独手写：浏览器的 WebCrypto（crypto.subtle）只给了 SHA 系列，
     而日常对校验码（老接口、老文档、下载站）最常用的偏偏是 MD5 —— 所以按 RFC 1321 自己实现一份。
   注意（三条）：
     ① MD5 与 SHA-1 早就不能用于安全场景（碰撞已被构造出来），这里只是"算校验值"，别拿它当加密；
     ② 输入变化是异步算的（SHA 走 WebCrypto 是 Promise），所以用 seq 序号挡"旧结果覆盖新结果"；
     ③ 空输入直接清空输出 —— 否则页面上会留上一次的残值，让人以为空串也有哈希。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), algo = $("algo"), upper = $("upper"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");
  var seq = 0;                     // 异步竞态保护：只有最后一次输入的结果能落到界面上

  /* ── MD5（RFC 1321）：返回 16 字节摘要 ──────────────────────────────────
     实现要点：先补一个 0x80，再补 0 到「56 mod 64」，最后 8 字节写原始位长（小端）。 */
  function md5(bytes) {
    var S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
             5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
             4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
             6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    var K = new Int32Array(64);
    for (var i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;

    var len = bytes.length;
    var padLen = (((len + 8) >> 6) + 1) << 6;   // 64 的倍数，且末尾留 8 字节长度
    var buf = new Uint8Array(padLen);
    buf.set(bytes);
    buf[len] = 0x80;
    var bits = len * 8;
    var lo = bits >>> 0, hi = Math.floor(bits / 4294967296) >>> 0;
    for (var k = 0; k < 4; k++) {
      buf[padLen - 8 + k] = (lo >>> (k * 8)) & 0xff;
      buf[padLen - 4 + k] = (hi >>> (k * 8)) & 0xff;
    }

    var a = 0x67452301 | 0, b = 0xefcdab89 | 0, c = 0x98badcfe | 0, d = 0x10325476 | 0;
    for (var off = 0; off < padLen; off += 64) {
      var M = new Int32Array(16);
      for (var j = 0; j < 16; j++) {
        M[j] = buf[off + j * 4] | (buf[off + j * 4 + 1] << 8) | (buf[off + j * 4 + 2] << 16) | (buf[off + j * 4 + 3] << 24);
      }
      var A = a, B = b, C = c, D = d;
      for (var t = 0; t < 64; t++) {
        var F, g;
        if (t < 16) { F = (B & C) | (~B & D); g = t; }
        else if (t < 32) { F = (D & B) | (~D & C); g = (5 * t + 1) % 16; }
        else if (t < 48) { F = B ^ C ^ D; g = (3 * t + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * t) % 16; }
        F = (F + A + K[t] + M[g]) | 0;
        A = D; D = C; C = B;
        B = (B + ((F << S[t]) | (F >>> (32 - S[t])))) | 0;
      }
      a = (a + A) | 0; b = (b + B) | 0; c = (c + C) | 0; d = (d + D) | 0;
    }
    var out = new Uint8Array(16);
    var words = [a, b, c, d];
    for (var w = 0; w < 4; w++) {
      for (var q = 0; q < 4; q++) out[w * 4 + q] = (words[w] >>> (q * 8)) & 0xff;
    }
    return out;
  }

  var HEX = "0123456789abcdef";
  function toHex(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += HEX[bytes[i] >> 4] + HEX[bytes[i] & 15];
    return s;
  }
  function toBase64(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  /** 统一入口：返回 Promise<Uint8Array>（MD5 是同步算的，但也包成 Promise 好统一处理） */
  function digest(name, bytes) {
    if (name === "md5") return Promise.resolve(md5(bytes));
    if (!(window.crypto && crypto.subtle)) return Promise.reject(new Error("NO_SUBTLE"));
    return crypto.subtle.digest(name, bytes).then(function (ab) { return new Uint8Array(ab); });
  }

  function run() {
    var text = input.value;
    var mine = ++seq;
    if (!text) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    var bytes = new TextEncoder().encode(text);
    digest(algo.value, bytes).then(function (out) {
      if (mine !== seq) return;                    // 已经有更新的输入了，丢弃这次结果
      var hex = toHex(out);
      if (upper.checked) hex = hex.toUpperCase();
      output.value = hex + "\n\n" + toBase64(out) + "\n\n" + bytes.length + " " + (T.bytesUnit || "bytes");
      status.textContent = (T.done || "") + " " + algo.value.toUpperCase();
      status.className = "status ok";
    }, function (err) {
      if (mine !== seq) return;
      output.value = "";
      status.textContent = (err && err.message === "NO_SUBTLE") ? (T.noSubtle || "WebCrypto unavailable") : (T.fail || "failed");
      status.className = "status err";
    });
  }

  input.addEventListener("input", TP.debounce(run, 200));
  algo.addEventListener("change", run);
  upper.addEventListener("change", run);
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; seq++; run(); });

  run();
})();
