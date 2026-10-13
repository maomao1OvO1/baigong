/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：ipv6.js —— IPv6 地址展开 / 压缩 / 类型识别
   干什么：把一个 IPv6 地址在「完整写法」与「压缩写法」之间互转，并说明它属于哪一类地址。
   为什么容易出错：IPv6 的压缩规则（:: 只能用一次、每组前导零可省）和
     常见笔误（写两个 ::、组数不足 8）都是手写高发区；加上回环 ::1、
     链路本地 fe80::、唯一本地 fc00::/7 这些分类，光靠眼睛看很容易判错。
   输出还给了二进制/十六进制分组，排查掩码时比看压缩写法直观。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  /** 解析成 8 组（每组 16 位），失败抛错并说明原因 */
  function parse(str) {
    var s = str.trim().toLowerCase();
    if (s.indexOf("::") >= 0 && s.indexOf("::", s.indexOf("::") + 2) > 0) throw new Error(T.errOneColon || "only one :: is allowed");
    // 允许带 zone id（fe80::1%eth0）
    s = s.replace(/%.*$/, "");
    var parts = s.split("::");
    var head = parts[0] ? parts[0].split(":") : [];
    var tail = parts.length > 1 && parts[1] ? parts[1].split(":") : [];
    if (parts.length > 1 && head.length + tail.length > 7) throw new Error(T.errTooManyGroups || "too many groups around ::");
    var groups = [];
    head.forEach(function (g) { groups.push(g); });
    var fill = 8 - head.length - tail.length;
    if (parts.length === 1) {
      if (head.length !== 8) throw new Error((T.errNeed8 || "an IPv6 address needs 8 groups (got {n})").replace("{n}", head.length));
    } else {
      for (var i = 0; i < fill; i++) groups.push("0");
    }
    tail.forEach(function (g) { groups.push(g); });
    if (groups.length !== 8) throw new Error((T.errNeed8 || "an IPv6 address needs 8 groups (got {n})").replace("{n}", groups.length));
    return groups.map(function (g) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) throw new Error("bad group: " + g);
      return parseInt(g, 16);
    });
  }

  function full(gs) { return gs.map(function (g) { return g.toString(16).padStart(4, "0"); }).join(":"); }
  /** 压缩规则：找最长的一段连续 0（长度 ≥2），替换成 ::；同样长取靠前的 */
  function short(gs) {
    var best = { start: -1, len: 0 }, cur = { start: -1, len: 0 };
    gs.forEach(function (g, i) {
      if (g === 0) { if (cur.start < 0) cur.start = i; cur.len++; if (cur.len > best.len) best = { start: cur.start, len: cur.len }; }
      else cur = { start: -1, len: 0 };
    });
    if (best.len < 2) return full(gs);
    var head = gs.slice(0, best.start).map(function (g) { return g.toString(16); }).join(":");
    var tail = gs.slice(best.start + best.len).map(function (g) { return g.toString(16); }).join(":");
    return head + "::" + tail;
  }

  function classify(gs) {
    if (gs.every(function (g) { return g === 0; })) return "unspecified (::)";
    if (gs.slice(0, 7).every(function (g) { return g === 0; }) && gs[7] === 1) return "loopback (::1)";
    var first = gs[0];
    if ((first & 0xff00) === 0xff00) return "multicast (ff00::/8)";
    if ((first & 0xffc0) === 0xfe80) return "link-local (fe80::/10)";
    if ((first & 0xffc0) === 0xfec0) return "site-local, deprecated (fec0::/10)";
    if ((first & 0xfe00) === 0xfc00) return "unique local (fc00::/7)";
    if (gs[0] === 0x2001 && gs[1] === 0x0db8) return "documentation (2001:db8::/32)";
    if ((gs[0] & 0xe000) === 0x2000) return "global unicast (2000::/3)";
    if (gs[0] === 0 && gs[1] === 0 && gs[2] === 0 && gs[3] === 0 && gs[4] === 0 && gs[5] === 0xffff) return "IPv4-mapped (::ffff:0:0/96)";
    return "other / reserved";
  }

  /** 万一是 IPv4-mapped，顺手把内嵌的 IPv4 也读出来（排查双栈问题时有用） */
  function embeddedV4(gs) {
    if (gs.slice(0, 5).every(function (g) { return g === 0; }) && (gs[5] === 0xffff || gs[5] === 0)) {
      return [gs[6] >> 8, gs[6] & 255, gs[7] >> 8, gs[7] & 255].join(".");
    }
    return null;
  }

  function run() {
    var raw = input.value.trim();
    if (!raw) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    var gs;
    try { gs = parse(raw); }
    catch (e) {
      output.value = "";
      status.textContent = (T.badIpv6 || "not a valid IPv6 address") + ": " + e.message;
      status.className = "status err";
      return;
    }
    var lines = [
      (T.full || "Full") + "       " + full(gs),
      (T.short || "Short") + "      " + short(gs),
      (T.type || "Type") + "       " + classify(gs),
      "",
      (T.groups || "Groups") + "     " + gs.map(function (g) { return g.toString(16).padStart(4, "0"); }).join(" "),
      (T.binary || "Binary") + "     " + gs.slice(0, 2).map(function (g) { return g.toString(2).padStart(16, "0"); }).join(" ") + " …",
    ];
    var v4 = embeddedV4(gs);
    if (v4) lines.push((T.embedded || "Embedded IPv4") + "  " + v4);
    output.value = lines.join("\n");
    status.textContent = classify(gs);
    status.className = "status ok";
  }

  input.addEventListener("input", TP.debounce(run, 180));
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; run(); });

  run();
})();
