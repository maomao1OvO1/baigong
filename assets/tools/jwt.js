/* ============================================================================
   文件：jwt.js —— JWT 解析（只解码，不验证签名）
   干什么：贴一个 JWT，把 header / payload 解成好看的 JSON，并把 exp / iat / nbf 换成
     人能读的时间，顺手告诉你"这个 token 过期了没"。
   ⚠️ 必须写清楚的三句话（页面提示文案里也要有）：
     ① 这里**不验证签名** —— 能解开 ≠ 有效，签名才是判断真伪的东西；调试时别把"能解码"当成"合法"。
     ② token 是凭据，等于密码 —— 别把生产环境的 token 贴进任何在线工具（本页不上传，但习惯要养成）。
     ③ base64url 与 base64 不是一回事：JWT 用 - 和 _ 代替 + 和 /，且**省略末尾的 =**，
        直接 atob 会报错，必须先补回来 —— 这是解析 JWT 最常见的第一个坑。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  function b64urlToText(seg) {
    var s = seg.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";                     // 补回被省略的 padding
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);      // 用 UTF-8 解，才能显示中文声明
  }

  function fmtTime(sec) {
    var d = new Date(sec * 1000);
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
           pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  function humanSpan(ms) {
    var s = Math.abs(Math.floor(ms / 1000));
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d) return d + "d " + h + "h";
    if (h) return h + "h " + m + "m";
    if (m) return m + "m " + (s % 60) + "s";
    return s + "s";
  }

  function run() {
    var raw = input.value.trim().replace(/^Bearer\s+/i, "").replace(/\s+/g, "");
    if (!raw) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    var parts = raw.split(".");
    if (parts.length !== 3) {
      output.value = "";
      status.textContent = T.badShape || "not a JWT";
      status.className = "status err";
      return;
    }
    var head, body;
    try {
      head = JSON.parse(b64urlToText(parts[0]));
      body = JSON.parse(b64urlToText(parts[1]));
    } catch (e) {
      output.value = "";
      status.textContent = (T.badDecode || "decode failed") + ": " + e.message;
      status.className = "status err";
      return;
    }

    var now = Math.floor(Date.now() / 1000);
    var notes = [];
    if (body.exp) {
      if (now >= body.exp) notes.push("⛔ " + (T.expired || "expired") + " · " + fmtTime(body.exp) + " (" + humanSpan(now * 1000 - body.exp * 1000) + " " + (T.ago || "ago") + ")");
      else notes.push("✅ " + (T.validFor || "valid for") + " " + humanSpan(body.exp * 1000 - now * 1000) + " · " + fmtTime(body.exp));
    } else notes.push("⚠️ " + (T.noExp || "no exp claim"));
    if (body.nbf && now < body.nbf) notes.push("⚠️ nbf " + fmtTime(body.nbf) + " (" + (T.notYet || "not yet valid") + ")");
    if (body.iat) notes.push("🕒 iat " + fmtTime(body.iat));
    if (head.alg) notes.push("alg " + head.alg + (head.typ ? " · " + head.typ : ""));

    output.value =
      "── HEADER ──\n" + JSON.stringify(head, null, 2) +
      "\n\n── PAYLOAD ──\n" + JSON.stringify(body, null, 2) +
      "\n\n── NOTES ──\n" + notes.join("\n") +
      "\n\n── SIGNATURE ──\n" + parts[2].slice(0, 32) + (parts[2].length > 32 ? "…" : "") +
      "\n(" + (T.notVerified || "signature NOT verified") + ")";

    var expired = body.exp && now >= body.exp;
    status.textContent = expired ? (T.expired || "expired") : (T.decoded || "decoded OK");
    status.className = expired ? "status err" : "status ok";
  }

  input.addEventListener("input", TP.debounce(run, 200));
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; run(); });

  run();
})();
