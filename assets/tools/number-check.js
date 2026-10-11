/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：number-check.js —— 银行卡号 / 身份证号 校验
   干什么：判断一串号码是不是"格式上合法"：银行卡走 Luhn 算法，身份证走 GB 11643 的校验位。
   为什么值得做：录错一位数字是最常见的输入错误，而校验位就是专门用来抓这个的 ——
     本地先测一遍，比提交到系统里等报错快得多。
   ⚠️ 三句必须说清的话（页面提示里也有）：
     ① 全部在本机算，**号码不会上传**（这类号码属于个人敏感信息，本站从设计上就不碰网络）；
     ② 校验通过只说明**格式合法**，不证明这张卡/这个号码真实存在；
     ③ 本站不储存、不记录、不推断归属地 —— 只做校验位数学。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  /** Luhn：从右往左，偶数位乘 2（超过 9 就减 9），总和能被 10 整除即合法 */
  function luhn(digits) {
    var sum = 0, alt = false;
    for (var i = digits.length - 1; i >= 0; i--) {
      var n = digits.charCodeAt(i) - 48;
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  var W = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  var CK = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];
  /** 身份证：前 17 位加权求和取模，对照校验码表 */
  function idCard(s) {
    s = s.toUpperCase();
    if (!/^\d{17}[\dX]$/.test(s)) return { ok: false, why: "shape" };
    var sum = 0;
    for (var i = 0; i < 17; i++) sum += (s.charCodeAt(i) - 48) * W[i];
    var want = CK[sum % 11];
    return { ok: s[17] === want, why: s[17] === want ? "" : ("checksum:" + want) };
  }

  function idInfo(s) {
    var y = s.slice(6, 10), m = s.slice(10, 12), d = s.slice(12, 14);
    var date = new Date(Date.UTC(+y, +m - 1, +d));
    var valid = date.getUTCFullYear() === +y && date.getUTCMonth() === +m - 1 && date.getUTCDate() === +d;
    return { birthday: y + "-" + m + "-" + d, dateOk: valid, sex: (+s[16] % 2 ? "male" : "female") };
  }

  function run() {
    var raw = input.value.replace(/[\s-]/g, "");
    if (!raw) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    if (!/^[0-9Xx]+$/.test(raw)) {
      output.value = "";
      status.textContent = T.badChars || "only digits (and a trailing X for ID cards)";
      status.className = "status err";
      return;
    }
    var lines = [];

    // 18 位（含 X）按身份证看；13~19 位纯数字按银行卡看
    if (/^\d{17}[\dXx]$/.test(raw)) {
      var r = idCard(raw);
      var info = idInfo(raw.toUpperCase());
      lines.push((T.typeId || "ID card (18 digits)") + ": " + (r.ok ? "✅ " + (T.valid || "valid") : "❌ " + (T.invalid || "invalid")));
      if (!r.ok && r.why) lines.push("  " + r.why);
      lines.push("");
      lines.push((T.birthday || "birth date") + "  " + info.birthday + (info.dateOk ? "" : "  ⚠️ " + (T.badDate || "impossible date")));
      lines.push((T.sex || "sex") + "         " + (info.sex === "male" ? (T.male || "male") : (T.female || "female")));
      // 刻意不推断归属地：那需要外部数据库，也会让"纯本地"这件事变味
      status.textContent = r.ok ? (T.valid || "valid") : (T.invalid || "invalid");
      status.className = r.ok ? "status ok" : "status err";
    } else if (/^\d{12,19}$/.test(raw)) {
      var ok = luhn(raw);
      var brand = /^4/.test(raw) ? "Visa" : /^5[1-5]/.test(raw) ? "Mastercard" : /^62/.test(raw) ? "UnionPay" :
        /^3[47]/.test(raw) ? "American Express" : /^35/.test(raw) ? "JCB" : (T.unknown || "unknown");
      lines.push((T.typeCard || "Bank card") + ": " + (ok ? "✅ " + (T.valid || "valid") : "❌ " + (T.invalid || "invalid")));
      lines.push("");
      lines.push((T.length || "length") + "   " + raw.length);
      lines.push((T.likely || "likely brand") + "   " + brand + (raw.length === 16 ? "" : "  (" + (T.checkLen || "check the expected length for this brand") + ")"));
      status.textContent = ok ? (T.valid || "valid") : (T.invalid || "invalid");
      status.className = ok ? "status ok" : "status err";
    } else {
      output.value = "";
      status.textContent = T.badLength || "unrecognized length (bank card 12–19, ID card 18)";
      status.className = "status err";
      return;
    }
    lines.push("");
    lines.push("— " + (T.localOnly || "computed on your device; nothing is uploaded"));
    output.value = lines.join("\n");
  }

  input.addEventListener("input", TP.debounce(run, 180));
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; run(); });

  run();
})();
