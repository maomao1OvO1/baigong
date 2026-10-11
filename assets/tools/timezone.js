/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：timezone.js —— 一个时间，换算成多个时区
   干什么：填一个时间（或留空 = 现在），一次看到它在各主要时区的对应时刻与相差几小时。
   为什么不用手算：时区不只是固定偏移 —— 欧美有夏令时，一年里会切换两次；
     用 Intl 交给浏览器自带的时区数据库（IANA），比自己维护一张偏移表靠谱得多。
   注意：输出里的偏移量是按**该时刻**算的（例如纽约在 3 月和 11 月是两个不同的偏移），
     这正是手算最容易错的地方。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), zone = $("zone"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  // 常用时区（挑的是国内用户最常打交道的几个）
  var ZONES = [
    ["UTC", "UTC"],
    ["Asia/Shanghai", "北京 / 上海"],
    ["Asia/Tokyo", "东京"],
    ["Asia/Singapore", "新加坡"],
    ["Europe/London", "伦敦"],
    ["Europe/Berlin", "柏林 / 巴黎"],
    ["America/New_York", "纽约"],
    ["America/Los_Angeles", "洛杉矶"],
    ["Australia/Sydney", "悉尼"],
  ];

  function fmtIn(tz, date) {
    try {
      return new Intl.DateTimeFormat("sv-SE", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      }).format(date);
    } catch (e) { return "(unknown timezone)"; }
  }
  /** 某时区在该时刻的 UTC 偏移（分钟）—— 夏令时靠它自动跟上 */
  function offsetMin(tz, date) {
    try {
      var s = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(date)
        .find(function (p) { return p.type === "timeZoneName"; }).value;   // 形如 GMT+8 / GMT-4
      var m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(s);
      if (!m) return 0;
      return (m[1] === "-" ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3] || "0", 10));
    } catch (e) { return 0; }
  }

  function run() {
    var raw = input.value.trim();
    var base;
    if (!raw) {
      base = new Date();
    } else if (/^\d{9,13}$/.test(raw)) {
      var n = Number(raw);
      base = new Date(Math.abs(n) < 1e11 ? n * 1000 : n);            // 10 位当秒、13 位当毫秒
    } else {
      var norm = raw.replace(/\//g, "-").replace(" ", "T");
      base = new Date(norm);
      // 没写时区的时间按用户选的源时区解释
      if (zone.value !== "local" && !/[zZ]|[+-]\d\d:?\d\d$/.test(norm)) {
        var guess = new Date(norm + "Z");
        if (!isNaN(guess.getTime())) base = new Date(guess.getTime() - offsetMin(zone.value, guess) * 60000);
      }
    }
    if (isNaN(base.getTime())) {
      output.value = "";
      status.textContent = T.badTime || "not a valid time";
      status.className = "status err";
      return;
    }
    var baseOff = offsetMin("Asia/Shanghai", base);
    var lines = ZONES.map(function (z) {
      var off = offsetMin(z[0], base);
      var diff = (off - baseOff) / 60;
      var sign = diff === 0 ? "±0" : (diff > 0 ? "+" + diff : String(diff));
      return (z[1] + "                     ").slice(0, 21) + fmtIn(z[0], base) + "   " + sign + "h";
    });
    output.value = lines.join("\n");
    status.textContent = T.shown || "times shown";
    status.className = "status ok";
  }

  input.addEventListener("input", TP.debounce(run, 200));
  zone.addEventListener("change", run);
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; run(); });

  run();
})();
