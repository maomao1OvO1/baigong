/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：ip-cidr.js —— IPv4 / CIDR 子网计算
   干什么：输入 192.168.1.10/24 这样的地址，算出网络地址、广播地址、可用主机范围、
     掩码、通配符掩码（反掩码）、地址总数，以及这个地址属于哪一类（私有 / 公网 / 回环…）。
   为什么这类计算容易错：JavaScript 的位运算是 **32 位有符号** 的，
     像 255.255.255.255 这种值按位与会变成 -1；另外 ^ 得到的反掩码也要 & 0xFFFFFFFF 修正，
     否则打印出来是负数。下面的 u32() 与处理就是为了挡住这两处。
   特殊掩码说明：/31 与 /32 在 RFC 3021 里没有"网络与广播各占一个"的概念，
     所以可用地址数不是 2^n − 2 —— 这里按实际可用数给（/32 = 1 个，/31 = 2 个）。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  var u32 = function (n) { return n >>> 0; };                          // 转成无符号 32 位
  function ipToInt(s) {
    var p = String(s).trim().split(".");
    if (p.length !== 4) return null;
    var n = 0;
    for (var i = 0; i < 4; i++) {
      if (!/^\d{1,3}$/.test(p[i])) return null;
      var v = parseInt(p[i], 10);
      if (v > 255) return null;
      n = u32((n << 8) | v);
    }
    return n;
  }
  function intToIp(n) {
    n = u32(n);
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
  }
  function intToBin(n) {
    n = u32(n);
    var parts = [];
    for (var i = 3; i >= 0; i--) {
      var b = (n >>> (i * 8)) & 255;
      parts.push((b + 256).toString(2).slice(1));
    }
    return parts.join(" ");
  }
  function classify(n) {
    var a = (u32(n) >>> 24) & 255, b = (u32(n) >>> 16) & 255;
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "private";
    if (a === 127) return "loopback";
    if (a === 169 && b === 254) return "link-local";
    if (a === 100 && b >= 64 && b <= 127) return "cgnat";
    if (a >= 224 && a <= 239) return "multicast";
    if (a >= 240) return "reserved";
    return "public";
  }

  function run() {
    var raw = input.value.trim();
    if (!raw) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    var m = /^([^/\s]+)(?:\/(\d{1,2}))?$/.exec(raw);
    var ip = m && ipToInt(m[1]);
    if (!m || ip === null) {
      output.value = "";
      status.textContent = T.badIp || "not a valid IPv4 address (e.g. 192.168.1.10/24)";
      status.className = "status err";
      return;
    }
    var bits = m[2] === undefined ? 32 : parseInt(m[2], 10);
    if (bits < 0 || bits > 32) {
      output.value = "";
      status.textContent = T.badPrefix || "prefix must be between 0 and 32";
      status.className = "status err";
      return;
    }
    var mask = bits === 0 ? 0 : u32(0xFFFFFFFF << (32 - bits));
    var wildcard = u32(~mask);
    var network = u32(ip & mask);
    var broadcast = u32(network | wildcard);
    var total = Math.pow(2, 32 - bits);
    var usable = bits >= 31 ? total : total - 2;
    var first = bits >= 31 ? network : u32(network + 1);
    var last = bits >= 31 ? broadcast : u32(broadcast - 1);
    var kind = classify(ip);
    var kindText = (T.kinds && T.kinds[kind]) || kind;

    var lines = [
      (T.rAddress || "Address") + "        " + intToIp(ip) + (bits < 32 ? "/" + bits : ""),
      (T.rNetwork || "Network") + "        " + intToIp(network) + "/" + bits,
      (T.rBroadcast || "Broadcast") + "      " + intToIp(broadcast),
      (T.rRange || "Host range") + "     " + intToIp(first) + " – " + intToIp(last),
      (T.rMask || "Netmask") + "        " + intToIp(mask) + "  (/" + bits + ")",
      (T.rWildcard || "Wildcard") + "       " + intToIp(wildcard),
      (T.rCount || "Addresses") + "      " + total + "  ·  " + (T.rUsable || "usable") + " " + usable,
      (T.rType || "Type") + "           " + kindText,
      "",
      (T.rBinary || "Binary") + "         " + intToBin(ip),
      (T.rBinMask || "        mask") + "   " + intToBin(mask)
    ];
    output.value = lines.join("\n");
    status.textContent = intToIp(network) + "/" + bits + " · " + usable + " " + (T.rUsable || "usable");
    status.className = "status ok";
  }

  input.addEventListener("input", TP.debounce(run, 200));
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; run(); });

  run();
})();
