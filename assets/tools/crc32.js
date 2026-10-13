/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：crc32.js —— CRC-32 / CRC-32C / Adler-32 校验和
   干什么：给一段文本或一串十六进制字节算三种常见的**校验和**（不是加密哈希）。

   为什么值得做成工具：
     ① 这三个值在生活里到处冒出来，但没人认得出来：ZIP 与 PNG 内部用的是 CRC-32，
        zlib/gzip 流尾部是 Adler-32，iSCSI 与部分文件系统（以及若干分布式存储）
        用的是 CRC-32C —— 拿到一个 `0xCBF43926` 想核对，得先在本地算出来；
     ② 它们的作用是**发现传输/存储错误**，不是防篡改：CRC-32 能挡随机位翻转，
        挡不住刻意构造的碰撞。知道这个区别，就不会拿它当签名用；
     ③ 校验通常发生在「对比线上文件与本地文件」时，而线上文件里常有业务数据 ——
        本工具全程在你浏览器里算，不上传。

   实现说明（避免自以为是的坑）：
     · CRC-32 用反射多项式 0xEDB88320（IEEE 802.3，也就是 ZIP/PNG 用的那个）；
     · CRC-32C 用 0x82F63B78（Castagnoli）；
     · 表是运行时生成的，不内嵌 1KB 常量表 —— 少一段看不懂的二进制墙；
     · 文本按 **UTF-8** 编码后再算（跟文件里存的一致），十六进制模式则按字节解析。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");
  var hexEl = $("hexmode");

  function fmt(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  /** 生成 256 项查表：crc 表法比逐位算快一个数量级，而表本身 20 行就能生成 */
  function makeTable(poly) {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (poly ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  }
  var T32 = makeTable(0xEDB88320);    // CRC-32（IEEE 802.3 / ZIP / PNG）
  var T32C = makeTable(0x82F63B78);   // CRC-32C（Castagnoli / iSCSI）

  function crc(bytes, table, init, xorout) {
    var c = init;
    for (var i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ xorout) >>> 0;
  }

  /** Adler-32：zlib 用的那个，比 CRC 快但检错能力弱一些 */
  function adler32(bytes) {
    var a = 1, b = 0;
    for (var i = 0; i < bytes.length; i++) {
      a = (a + bytes[i]) % 65521;
      b = (b + a) % 65521;
    }
    return (((b << 16) | a) >>> 0);
  }

  function toHex32(n) {
    return "0x" + ("00000000" + n.toString(16).toUpperCase()).slice(-8);
  }

  /** 十六进制字符串 → 字节数组；遇到非法字符返回 null（不猜、不跳过） */
  function parseHex(s) {
    var clean = String(s).replace(/[\s:,-]/g, "").replace(/^0x/i, "");
    if (!clean) return new Uint8Array(0);
    if (!/^[0-9a-fA-F]+$/.test(clean)) return null;
    if (clean.length % 2) return null;   // 奇数个十六进制字符说明这段不是合法字节流
    var out = new Uint8Array(clean.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  }

  function build() {
    var raw = input.value;

    if (!raw.length) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    var bytes, note;
    if (hexEl && hexEl.checked) {
      bytes = parseHex(raw);
      if (!bytes) {
        output.value = "";
        status.className = "status err";
        status.textContent = T.errHex || "";
        return;
      }
      note = T.noteHex;
    } else {
      bytes = new TextEncoder().encode(raw);
      note = T.noteUtf8;
    }

    var r32 = crc(bytes, T32, 0xFFFFFFFF, 0xFFFFFFFF);
    var r32c = crc(bytes, T32C, 0xFFFFFFFF, 0xFFFFFFFF);
    var ad = adler32(bytes);

    var w = 26;
    function row(label, v) {
      return label + new Array(Math.max(1, w - label.length)).join(" ") + toHex32(v) + "   " + v;
    }

    var out = [
      row("CRC-32", r32),
      row("CRC-32C", r32c),
      row("Adler-32", ad),
      "",
      fmt(T.statBytes, { n: bytes.length }) + " · " + note,
      "",
      T.noteUse
    ];

    output.value = out.join("\n");
    status.className = "status";
    status.textContent = fmt(T.statOk, { s: toHex32(r32) });
  }

  input.addEventListener("input", TP.debounce(build, 150));
  if (hexEl) hexEl.addEventListener("change", build);

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

  build();
})();
