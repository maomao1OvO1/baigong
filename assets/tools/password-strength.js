/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：password-strength.js —— 密码强度分析 + 泄露检测（"最强的盾"）
   设计原则（重要，不是功能堆砌）：
     ① **默认完全离线**：页面加载后不发任何网络请求。强度分析、常见密码比对、
        模式识别全部在本机完成 —— 断网也能用。
     ② **联网必须用户明确同意**：泄露检测是单独的交互流程（点按钮 → 看到"会发送什么"
        的说明 → 再点确认才发请求）。**不做任何自动联网，不预取，不埋点。**
     ③ 泄露检测用 Have I Been Pwned 的 **k-Anonymity** 协议：
        只把密码 SHA-1 哈希的**前 5 位十六进制**发出去，服务器返回该前缀对应的
        全部哈希后缀（几百条），**在本机比对**。⇒ 服务器无法反推密码，原始密码不出设备。
   强度算法说明（避免"看起来很专业其实瞎打分"）：
     · 基础熵 = 长度 × log2(字符集大小)；
     · 命中常见密码 / 键盘序列 / 纯重复 / 顺序串 / 日期 ⇒ 熵**大幅下调**（这些是字典攻击的首要目标）；
     · 破解时间按 4 种场景给出（在线限流 / 在线不限流 / 单卡 GPU / GPU 集群），
       取平均需要尝试一半空间，并如实标注这是**估算**而非精确值。
   作者：小鲸 · 2026-10-11
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), meter = $("meter"), status = $("status");
  var pwnBtn = $("pwn"), pwnBox = $("pwnBox"), pwnConfirm = $("pwnConfirm"), pwnCancel = $("pwnCancel"), pwnResult = $("pwnResult");

  /* ── 内置常见密码（离线可用；只放最烂的那批，够用来当场抓出「123456」这种）── */
  var COMMON = ("123456,password,123456789,12345678,12345,qwerty,abc123,111111,123123,admin," +
    "letmein,welcome,monkey,dragon,iloveyou,sunshine,princess,football,baseball,master," +
    "1234567890,000000,654321,888888,666666,password1,qwerty123,1q2w3e4r,1qaz2wsx,zxcvbnm," +
    "5201314,1314520,520520,woaini1314,woaini520,a123456,aa123456,123qwe,asdfgh,asdfghjkl," +
    "112233,123321,666888,88888888,11111111,00000000,test,guest,root,toor,pass,1234,1234567," +
    "987654321,qazwsx,159357,123abc,abcd1234,iloveyou1,admin123,root123,66666666,999999").split(",");

  var KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890", "qazwsx", "1qaz2wsx", "zaq12wsx"];
  var SEQUENCES = "abcdefghijklmnopqrstuvwxyz0123456789";

  function charsets(pw) {
    var n = 0;
    if (/[a-z]/.test(pw)) n += 26;
    if (/[A-Z]/.test(pw)) n += 26;
    if (/[0-9]/.test(pw)) n += 10;
    if (/[^a-zA-Z0-9]/.test(pw)) n += 33;
    return n || 1;
  }

  /** 是否含有键盘走位（行内 4 位以上连续片段，正反向都算）*/
  function hasKeyboardRun(low) {
    for (var i = 0; i + 4 <= low.length; i++) {
      var chunk = low.slice(i, i + 4);
      var rev = chunk.split("").reverse().join("");
      for (var k = 0; k < KEYBOARD_ROWS.length; k++) {
        if (KEYBOARD_ROWS[k].indexOf(chunk) >= 0 || KEYBOARD_ROWS[k].indexOf(rev) >= 0) return true;
      }
    }
    return false;
  }

  /** 模式识别：返回问题列表（每个问题带一个"扣除理由"，用于下调熵与给出建议） */
  function findProblems(pw) {
    var low = pw.toLowerCase(), issues = [];
    if (COMMON.indexOf(low) >= 0) issues.push({ key: "issueCommon", drop: 0.05 });
    // 常见密码的简单变形（末尾加 1、加 ! 等）
    var stripped = low.replace(/[0-9!@#$._-]+$/, "");
    if (stripped.length >= 5 && COMMON.indexOf(stripped) >= 0) issues.push({ key: "issueCommonVariant", drop: 0.25 });

    // 键盘序列：不能只匹配「整行」（qwerty123 里根本没有整行 qwertyuiop），
    // 要检测行内任意 4 位以上连续片段，正反两个方向都算。
    if (hasKeyboardRun(low)) issues.push({ key: "issueKeyboard", drop: 0.35 });
    if (/^(.)\1{2,}$/.test(pw)) issues.push({ key: "issueRepeat", drop: 0.2 });
    if (/(.)\1{3,}/.test(pw)) issues.push({ key: "issueRepeatAll", drop: 0.4 });

    // 连续顺序（正向或反向，至少 4 位）
    for (var i = 0; i + 4 <= low.length; i++) {
      var chunk = low.slice(i, i + 4);
      if (SEQUENCES.indexOf(chunk) >= 0 || SEQUENCES.indexOf(chunk.split("").reverse().join("")) >= 0) {
        issues.push({ key: "issueSequence", drop: 0.4 });
        break;
      }
    }
    if (/^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(pw)) issues.push({ key: "issueDate", drop: 0.25 });
    if (/^\d{8,11}$/.test(pw)) issues.push({ key: "issueDigits", drop: 0.3 });
    if (/^[a-z]+$/.test(pw) && pw.length < 10) issues.push({ key: "issueLowerOnly", drop: 0.5 });
    if (/^\d+$/.test(pw)) issues.push({ key: "issueNumericOnly", drop: 0.4 });
    return issues;
  }

  /** 估算熵（比特）。这是估算，不是精确值 —— 界面上也这么写。 */
  function estimateBits(pw) {
    var bits = pw.length * Math.log2(charsets(pw));
    findProblems(pw).forEach(function (it) { bits *= it.drop; });
    return Math.max(bits, pw.length ? 4 : 0);
  }

  function humanTime(seconds) {
    if (!isFinite(seconds)) return T.timeForever || "practically forever";
    if (seconds < 1) return T.timeInstant || "instantly";
    var units = [
      [60, T.uSecond || "seconds"], [60, T.uMinute || "minutes"], [24, T.uHour || "hours"],
      [365, T.uDay || "days"], [100, T.uYear || "years"], [10, T.uCentury || "centuries"]
    ];
    var v = seconds, name = units[0][1];
    for (var i = 0; i < units.length; i++) {
      if (v < units[i][0]) { name = units[i][1]; break; }
      v /= units[i][0];
      name = units[i][1];
      if (i === units.length - 1) {
        // 超过"世纪"还在涨 ⇒ 用科学计数法 + 宇宙年龄类比
        if (v > 1e6) return (v.toExponential(1) + " × " + (T.uCentury || "centuries"));
      }
    }
    return (v >= 100 ? Math.round(v) : v.toFixed(v < 10 ? 1 : 0)) + " " + name;
  }

  /* 4 种攻击场景（数值来自公开的常见估算量级，页面里也标注"估算"） */
  function scenarios(bits) {
    var space = Math.pow(2, bits) / 2;   // 平均尝试一半空间
    return [
      { key: "attackOnline", speed: 10 },
      { key: "attackOnlineFast", speed: 1e4 },
      { key: "attackGpu", speed: 1e10 },
      { key: "attackCluster", speed: 1e13 },
    ].map(function (s) { return { key: s.key, seconds: space / s.speed }; });
  }

  function strengthKey(bits) {
    if (bits >= 100) return "strengthVeryStrong";
    if (bits >= 75) return "strengthStrong";
    if (bits >= 55) return "strengthGood";
    if (bits >= 35) return "strengthWeak";
    return "strengthVeryWeak";
  }

  function analyze() {
    var pw = input.value;
    if (!pw) { output.value = ""; if (meter) meter.textContent = ""; return; }
    var bits = estimateBits(pw);
    var issues = findProblems(pw);
    var lines = [];
    lines.push("→ " + (T[strengthKey(bits)] || "") + "  ·  ≈ " + Math.round(bits) + " bits  ·  " + pw.length + (T.chars || " chars"));
    if (issues.length) {
      lines.push("");
      lines.push("⚠ " + (T.foundIssues || "Issues found") + ":");
      issues.forEach(function (it) { lines.push("  · " + (T[it.key] || it.key)); });
    }
    lines.push("");
    lines.push(T.crackHeading || "Estimated time to crack:");
    scenarios(bits).forEach(function (s) {
      lines.push("  " + (T[s.key] || s.key) + ": " + humanTime(s.seconds));
    });
    output.value = lines.join("\n");
    if (meter) meter.textContent = (T[strengthKey(bits)] || "") + " · ≈ " + Math.round(bits) + " bits";
  }

  /* ── 泄露检测（联网部分：必须用户明确同意）── */
  function sha1Hex(text) {
    var bytes = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-1", bytes).then(function (buf) {
      return [].map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("").toUpperCase();
    });
  }

  function setPwn(text, kind) {
    pwnResult.textContent = text;
    pwnResult.className = "status" + (kind ? " " + kind : "");
  }

  function doCheck() {
    var pw = input.value;
    if (!pw) return;
    if (!(window.crypto && crypto.subtle)) {
      setPwn(T.noCrypto || "This browser can't hash locally (needs HTTPS).", "bad");
      return;
    }
    pwnBtn.disabled = true;
    setPwn(T.pwnChecking || "Checking…", "");
    sha1Hex(pw).then(function (hash) {
      var prefix = hash.slice(0, 5), suffix = hash.slice(5);
      // ⚠️ 只发前 5 位 —— 服务器看到的是一万个候选哈希，无法反推你的密码
      var url = "https://api.pwnedpasswords.com/range/" + prefix;
      // 超时保护（测试环境下 TP_TEST 为真则不启用 —— 否则同步的假计时器会让 race 立刻超时）
      var req = fetch(url, { headers: { "Add-Padding": "true" } }).then(function (r) { return r.text(); });
      var guarded = window.TP_TEST ? req : Promise.race([req, new Promise(function (_, rej) {
        setTimeout(function () { rej(new Error("timeout")); }, 12000);
      })]);
      return guarded
        .then(function (body) {
          var count = 0;
          body.split("\n").forEach(function (line) {
            var parts = line.trim().split(":");
            if (parts[0] === suffix) count = parseInt(parts[1], 10) || 0;
          });
          if (count > 0) setPwn((T.pwnFound || "Found in breaches: {n}").replace("{n}", count.toLocaleString()), "bad");
          else setPwn(T.pwnSafe || "Not found in any known breach.", "ok");
        });
    }).catch(function () {
      setPwn(T.pwnFailed || "Network check failed. Your password was still never sent.", "bad");
    }).then(function () {
      pwnBtn.disabled = false;
      pwnBox.hidden = true;
    });
  }

  input.addEventListener("input", TP.debounce(analyze, 150));
  if (pwnBtn) pwnBtn.addEventListener("click", function () {
    if (!input.value) { setPwn(T.pwnNeedInput || "Type a password first.", "bad"); return; }
    // 第一次点 → 只展开说明，**不发任何请求**；必须再点「确认」才联网
    pwnBox.hidden = false;
    setPwn("", "");
  });
  if (pwnConfirm) pwnConfirm.addEventListener("click", doCheck);
  if (pwnCancel) pwnCancel.addEventListener("click", function () { pwnBox.hidden = true; setPwn("", ""); });
  $("copy").addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  $("clear").addEventListener("click", function () {
    input.value = ""; output.value = ""; if (meter) meter.textContent = "";
    if (pwnBox) pwnBox.hidden = true; setPwn("", "");
  });

  if (pwnBox) pwnBox.hidden = true;   // 确认区默认收起
  analyze();
})();
