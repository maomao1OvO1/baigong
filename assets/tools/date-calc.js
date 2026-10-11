/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：date-calc.js —— 日期计算器（相差天数 / 加减天数 / 周几与年内序）
   干什么：输入一个日期，算出它离今天多少天、加 N 天是哪天，以及周几、年内第几天、ISO 周。
   为什么要用 Date.UTC 而不是本地时间做差值：夏令时和时区会让「本地时间相减」出现
     23 小时或 25 小时的天，除下来就不是整数天。用 UTC 构造这两个日期再相减，天数是准的。
   ISO 周（ISO-8601）：周一是一周的第一天，且**包含当年第一个周四的那一周算第 1 周** ——
     跨年那几天容易出现"12 月 31 日在下一年的第 1 周"这种情况，所以必须按标准算。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), days = $("days"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  var WEEK = { en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] };

  /** 解析 YYYY-MM-DD / YYYY/MM/DD / YYYYMMDD；非法返回 null */
  function parseDate(s) {
    var t = s.trim().replace(/[/.]/g, "-");
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t) || /^(\d{4})(\d{2})(\d{2})$/.exec(t.replace(/-/g, ""));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    // 反查一遍：2026-02-30 这种会被 Date 自动进位成 3 月，必须拒绝
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return dt;
  }

  var DAY = 86400000;
  function fmt(d) {
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
  }
  function isoWeek(d) {
    var t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    var day = t.getUTCDay() || 7;                 // 周日算 7
    t.setUTCDate(t.getUTCDate() + 4 - day);       // 移到本周四
    var yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return { week: Math.ceil(((t - yearStart) / DAY + 1) / 7), year: t.getUTCFullYear() };
  }
  function dayOfYear(d) {
    return Math.round((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY) + 1;
  }
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

  function run() {
    var raw = input.value.trim();
    var today = new Date();
    var todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    var base = raw ? parseDate(raw) : todayUtc;
    if (!base) {
      output.value = "";
      status.textContent = T.badDate || "not a valid date";
      status.className = "status err";
      return;
    }
    var offset = parseInt(days.value, 10);
    if (isNaN(offset)) offset = 0;
    var diff = Math.round((base - todayUtc) / DAY);
    var target = new Date(base.getTime() + offset * DAY);
    var wk = isoWeek(base);
    var names = T.weekNames || WEEK.en;
    var lines = [
      (T.baseLabel || "Date") + "        " + fmt(base) + "  ·  " + names[base.getUTCDay()],
      (T.vsToday || "vs today") + "     " + (diff === 0 ? "0" : (diff > 0 ? "+" + diff : String(diff))) + " " + (T.daysUnit || "days"),
      (T.dayOfYear || "day of year") + "   " + dayOfYear(base) + " / " + (isLeap(base.getUTCFullYear()) ? 366 : 365),
      (T.isoWeek || "ISO week") + "       " + wk.year + "-W" + String(wk.week).padStart(2, "0"),
      (T.leap || "leap year") + "       " + (isLeap(base.getUTCFullYear()) ? "yes" : "no"),
      "",
      (T.offsetLabel || "with offset") + " " + (offset >= 0 ? "+" : "") + offset + " →  " + fmt(target) + "  ·  " + names[target.getUTCDay()]
    ];
    output.value = lines.join("\n");
    status.textContent = raw ? fmt(base) : (T.usingToday || "using today");
    status.className = "status ok";
  }

  input.addEventListener("input", TP.debounce(run, 200));
  days.addEventListener("change", run);
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; run(); });

  run();
})();
