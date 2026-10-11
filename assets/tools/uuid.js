/* ============================================================================
   文件：uuid.js —— 唯一 ID 生成器（UUID v4 / v7 / ULID / NanoID）
   干什么：一次生成 1~100 个 ID，可切大小写、可去连字符，点一下全选复制。
   为什么四种都留（各自适用的场景不同，别混用）：
     · UUID v4 —— 随机 122 位，最通用；做数据库主键时是随机写，索引会碎。
     · UUID v7 —— 前 48 位是毫秒时间戳，**既唯一又按时间递增** ⇒ 排序和分页友好，是新项目首选。
     · ULID   —— 26 位 Crockford Base32，同样时间有序，但更适合人类读写与短 URL。
     · NanoID —— 21 位 URL 安全字符，比 UUID 短得多（短链、文件名、分享码的常见选择）。
   注意：随机源优先用 crypto.getRandomValues（真随机）；老环境退化为 Math.random 时，
     status 会显示 insecure 提醒 —— 生成密钥这类用途必须在有 crypto 的环境里做。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var type = $("type"), count = $("count"), upper = $("upper"), nodash = $("nodash"), genBtn = $("gen");
  var output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  var HAS_CRYPTO = !!(window.crypto && crypto.getRandomValues);
  var HEX = "0123456789abcdef";
  var B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";        // Crockford Base32（去掉 I L O U，避免看错）
  var NANO = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";  // NanoID 官方字母表（62 个 URL 安全字符）

  function bytes(n) {
    if (HAS_CRYPTO) {
      var b = new Uint8Array(n);
      crypto.getRandomValues(b);
      return b;
    }
    var out = new Uint8Array(n);
    for (var i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
    return out;
  }

  function uuid4() {
    var b = bytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;     // 版本 4
    b[8] = (b[8] & 0x3f) | 0x80;     // 变体 10xx
    var s = "";
    for (var i = 0; i < 16; i++) {
      s += HEX[b[i] >> 4] + HEX[b[i] & 15];
      if (i === 3 || i === 5 || i === 7 || i === 9) s += "-";
    }
    return s;
  }

  function uuid7() {
    var b = bytes(16);
    var ms = Date.now();
    // 前 6 字节 = 毫秒时间戳（大端）⇒ 字符串排序 == 时间排序
    b[0] = (ms / 4294967296) & 0xff; b[1] = (ms / 16777216) & 0xff; b[2] = (ms / 65536) & 0xff;
    b[3] = (ms / 256) & 0xff; b[4] = ms & 0xff; b[5] = Math.floor(Math.random() * 256);
    // ⚠️ 上面这种写法只保证前 40 位精确；要 48 位精确必须用 BigInt 或位运算拼接，
    //    这里改用更稳的方式重算前 6 字节（同一毫秒内多次调用仍靠后 10 字节随机区分）：
    var t = ms;
    for (var k = 5; k >= 0; k--) { b[k] = t & 0xff; t = Math.floor(t / 256); }
    b[6] = (b[6] & 0x0f) | 0x70;     // 版本 7
    b[8] = (b[8] & 0x3f) | 0x80;     // 变体
    var s = "";
    for (var i = 0; i < 16; i++) {
      s += HEX[b[i] >> 4] + HEX[b[i] & 15];
      if (i === 3 || i === 5 || i === 7 || i === 9) s += "-";
    }
    return s;
  }

  function ulid() {
    // 48 位时间（10 个字符）+ 80 位随机（16 个字符）= 26 字符
    var time = Date.now(), chars = [];
    for (var i = 9; i >= 0; i--) { chars[i] = B32[time % 32]; time = Math.floor(time / 32); }
    var r = bytes(16);
    for (var j = 0; j < 16; j++) chars.push(B32[r[j] & 31]);
    return chars.join("");
  }

  function nanoid(len) {
    var r = bytes(len || 21), s = "";
    for (var i = 0; i < len; i++) s += NANO[r[i] & 63];
    return s;
  }

  function run() {
    var n = Math.max(1, Math.min(100, parseInt(count.value, 10) || 1));
    var kind = type.value, list = [];
    for (var i = 0; i < n; i++) {
      if (kind === "uuid4") list.push(uuid4());
      else if (kind === "uuid7") list.push(uuid7());
      else if (kind === "ulid") list.push(ulid());
      else list.push(nanoid(21));
    }
    if (nodash.checked && kind.indexOf("uuid") === 0) {
      list = list.map(function (v) { return v.replace(/-/g, ""); });
    }
    if (upper.checked) list = list.map(function (v) { return v.toUpperCase(); });
    output.value = list.join("\n");
    status.textContent = n + " × " + kind.toUpperCase() + (HAS_CRYPTO ? "" : " · " + (T.insecure || "insecure random"));
    status.className = HAS_CRYPTO ? "status ok" : "status err";
  }

  genBtn.addEventListener("click", run);
  type.addEventListener("change", run);
  count.addEventListener("change", run);
  upper.addEventListener("change", run);
  nodash.addEventListener("change", run);
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { output.value = ""; status.textContent = ""; });

  run();
})();
