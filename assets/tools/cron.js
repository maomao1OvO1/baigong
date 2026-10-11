/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：cron.js —— Cron 表达式解析（字段含义 + 未来 5 次运行时间）
   干什么：把 "0,15,30,45 9-18 * * 1-5" 这样的表达式翻译成人话，并算出接下来会跑 5 次的具体时间。
   ⚠️ 写这个文件时踩过一次：注释里直接写「星号紧跟斜杠」（步进语法）会**提前结束块注释**，
     整个文件报 SyntaxError: Unexpected number。要举例就写 0,15,30,45，或把两个字符分开写。
   为什么值得自己做：「任务怎么没跑」这类问题九成是表达式写错了某一格 ——
     把每一格单独解释出来，比盯着 5 个星号猜快得多。
   两个必须写对的语义（写错就会出现"看起来对、跑起来不对"）：
     ① 星期里 0 和 7 都表示周日 ⇒ 统一对 7 取模；
     ② 日期（日）与星期同时被限定时，标准 cron（Vixie cron）是 **或** 的关系，不是"与"。
        比如 "0 0 1 * 1" 表示「每月 1 号**或**每周一」，很多人以为是"每月 1 号且是周一"。
   性能：逐分钟向后找，最多扫 20 万分钟（约 139 天）就停手 —— 不存在的时间（如 2 月 30 日）不会死循环。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  var FIELDS = [
    { name: "minute", min: 0, max: 59 },
    { name: "hour", min: 0, max: 23 },
    { name: "dom", min: 1, max: 31 },
    { name: "month", min: 1, max: 12 },
    { name: "dow", min: 0, max: 6 }
  ];
  var NAMES = { en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] };
  var MAX_SCAN = 200000;

  /** 解析一格：支持 *  ,  -  / （数字与范围混用） */
  function parseField(part, min, max) {
    var set = {}, ok = false;
    part.split(",").forEach(function (piece) {
      piece = piece.trim();
      if (!piece) return;
      var step = 1, range = piece, slash = piece.indexOf("/");
      if (slash >= 0) {
        range = piece.slice(0, slash);
        step = parseInt(piece.slice(slash + 1), 10);
        if (!isFinite(step) || step < 1) step = 1;
      }
      var lo, hi;
      if (range === "*") { lo = min; hi = max; }
      else if (range.indexOf("-") > 0) {
        var ab = range.split("-");
        lo = parseInt(ab[0], 10); hi = parseInt(ab[1], 10);
      } else {
        lo = parseInt(range, 10); hi = lo;
      }
      if (!isFinite(lo) || !isFinite(hi)) return;
      for (var v = lo; v <= hi; v += step) {
        var n = v;
        if (max === 6 && n === 7) n = 0;               // 星期 7 也指周日
        if (n >= min && n <= max) { set[n] = true; ok = true; }
      }
    });
    return ok ? set : null;
  }

  function run() {
    var raw = input.value.trim();
    if (!raw) { output.value = ""; status.textContent = ""; status.className = "status"; return; }
    var parts = raw.split(/\s+/);
    if (parts.length !== 5) {
      output.value = "";
      status.textContent = T.badCron || "a cron expression needs exactly 5 fields (minute hour day month weekday)";
      status.className = "status err";
      return;
    }
    var sets = {}, bad = null;
    for (var i = 0; i < 5; i++) {
      var s = parseField(parts[i], FIELDS[i].min, FIELDS[i].max);
      if (!s) { bad = FIELDS[i].name; break; }
      sets[FIELDS[i].name] = s;
    }
    if (bad) {
      output.value = "";
      status.textContent = (T.badField || "invalid field") + ": " + bad;
      status.className = "status err";
      return;
    }

    var domAny = parts[2].indexOf("*") === 0 || parts[2].indexOf("?") >= 0;
    var dowAny = parts[4].indexOf("*") === 0 || parts[4].indexOf("?") >= 0;
    function matches(d) {
      if (!sets.minute[d.getMinutes()]) return false;
      if (!sets.hour[d.getHours()]) return false;
      if (!sets.month[d.getMonth() + 1]) return false;
      var domOk = sets.dom[d.getDate()] === true;
      var dowOk = sets.dow[d.getDay()] === true;
      if (domAny && dowAny) return true;
      if (domAny) return dowOk;
      if (dowAny) return domOk;
      return domOk || dowOk;                            // 两者都限定 ⇒ 或
    }

    var names = T.weekNames || NAMES.en;
    var d = new Date();
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + 1);
    var found = [];
    for (var n = 0; n < MAX_SCAN && found.length < 5; n++) {
      if (matches(d)) found.push(new Date(d.getTime()));
      d.setMinutes(d.getMinutes() + 1);
    }

    var pad = function (x) { return String(x).padStart(2, "0"); };
    var lines = [
      (T.cFields || "Fields") + "   " + parts.join("  "),
      (T.cExplain || "Meaning") + "  " + parts[0] + " " + (T.cMin || "min") + " · " + parts[1] + " " + (T.cHour || "hour") + " · " +
        parts[2] + " " + (T.cDom || "day") + " · " + parts[3] + " " + (T.cMonth || "month") + " · " + parts[4] + " " + (T.cDow || "weekday"),
      (T.cCombo || "Note") + "     " + (domAny || dowAny ? (T.cComboAny || "day/weekday use OR when both are set") : (T.cComboBoth || "day AND weekday are both restricted → OR")),
      "",
      (T.cNext || "Next 5 runs")
    ];
    if (!found.length) {
      lines.push("(" + (T.cNone || "no run time found within 139 days — check the day/month fields") + ")");
    } else {
      found.forEach(function (t) {
        lines.push("  " + t.getFullYear() + "-" + pad(t.getMonth() + 1) + "-" + pad(t.getDate()) + " " +
          pad(t.getHours()) + ":" + pad(t.getMinutes()) + "  " + names[t.getDay()]);
      });
    }
    output.value = lines.join("\n");
    status.textContent = found.length ? (T.cNext || "") + " " + found.length : (T.cNone || "none");
    status.className = found.length ? "status ok" : "status err";
  }

  input.addEventListener("input", TP.debounce(run, 250));
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; run(); });

  run();
})();
