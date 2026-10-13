/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：chmod-calc.js —— 文件权限换算（755 ⇄ rwxr-xr-x）
   干什么：八进制（755 / 4755）与符号（rwxr-xr-x，含 ls -l 输出里的前缀）
          双向换算，并把每一位代表什么、特殊位是哪几个讲清楚。

   为什么值得做成工具：
     ① `755` 谁都会背，但 `4755` 里的那个 4、`rwxr-sr-x` 里的 s、`rwxrwxrwt` 里的 t，
        很多人是「见过，说不清」—— 而它们恰好与提权有关（setuid 二进制是提权漏洞的重灾区）；
     ② 部署时最常见的两种翻车都和权限有关：给 Web 目录 777（任何人可写，等于开后门）、
        给私钥 644（同机器上的其他账号能读走）；
     ③ 从 `ls -l` 复制出来的是 `-rwxr-xr-x` 这种带文件类型前缀的形式，
        直接拿去 chmod 会报错，得先把第一位拆掉。

   说明：只做**换算与解释**，不碰你的文件系统 —— 这是个网页，本来也碰不到。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  function fmt(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  /** 一个数字（0-7）→ 三个字符（如 5 → r-x）；execChar 用来处理特殊位里的大写/小写区别 */
  function digitToSym(d, execChar) {
    var s = "";
    s += (d & 4) ? "r" : "-";
    s += (d & 2) ? "w" : "-";
    if (d & 1) s += execChar || "x";
    else s += (execChar ? (execChar === "x" ? "-" : execChar.toUpperCase()) : "-");
    return s;
  }

  /** 八进制（3 或 4 位）→ 结构化权限 */
  function fromOctal(str) {
    var s = str.length === 3 ? "0" + str : str;
    if (!/^[0-7]{4}$/.test(s)) return null;
    var sp = +s.charAt(0), u = +s.charAt(1), g = +s.charAt(2), o = +s.charAt(3);

    var setuid = !!(sp & 4), setgid = !!(sp & 2), sticky = !!(sp & 1);

    // setuid 有「x」时显示小写 s，没有执行位时显示大写 S（这是 ls 的约定，也是判断有没有真正生效的依据）
    var sym = digitToSym(u, setuid ? "s" : "x") +
              digitToSym(g, setgid ? "s" : "x") +
              digitToSym(o, sticky ? "t" : "x");

    return { octal: s, digits: [u, g, o], sym: sym, setuid: setuid, setgid: setgid, sticky: sticky };
  }

  /** 符号（9 位）→ 结构化权限 */
  function fromSymbolic(sym) {
    if (!/^[rwxsSt-]{9}$/.test(sym)) return null;

    function d(t) {
      var n = 0;
      if (t.charAt(0) === "r") n += 4;
      if (t.charAt(1) === "w") n += 2;
      if (/[xsSt]/.test(t.charAt(2))) n += 1;
      return n;
    }

    var u = d(sym.substr(0, 3)), g = d(sym.substr(3, 3)), o = d(sym.substr(6, 3));
    var setuid = /[sS]/.test(sym.charAt(2));   // 位置固定：属性的第三个字符
    var setgid = /[sS]/.test(sym.charAt(5));
    var sticky = /[tT]/.test(sym.charAt(8));

    var sp = (setuid ? 4 : 0) + (setgid ? 2 : 0) + (sticky ? 1 : 0);
    return { octal: "" + sp + u + g + o, digits: [u, g, o], sym: sym, setuid: setuid, setgid: setgid, sticky: sticky };
  }

  /** 权限描述：把数字变成人话（三语文案拼出来） */
  function describe(digit) {
    var parts = [];
    if (digit & 4) parts.push(T.pRead);
    if (digit & 2) parts.push(T.pWrite);
    if (digit & 1) parts.push(T.pExec);
    return parts.length ? parts.join(T.pJoin) : T.pNone;
  }

  function build() {
    var raw = input.value.trim();

    if (!raw) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    /* 认三种写法：纯八进制、9 位符号、ls -l 的 10 位（带文件类型前缀）*/
    var perms = null;
    var lsMatch = /^([-dlbcps])([rwxsSt-]{9})$/.exec(raw);
    if (lsMatch) perms = fromSymbolic(lsMatch[2]);
    else if (/^[0-7]{3,4}$/.test(raw)) perms = fromOctal(raw);
    else if (/^[rwxsSt-]{9}$/.test(raw)) perms = fromSymbolic(raw);

    if (!perms) {
      output.value = "";
      status.className = "status err";
      status.textContent = T.errBad || "";
      return;
    }

    var out = [];
    out.push(fmt(T.headLine, { oct: perms.octal, sym: perms.sym }));
    out.push("");
    out.push("  " + T.colWho + "   " + T.colSym + "   " + T.colNum + "   " + T.colMeans);
    out.push("  " + fmt(T.rowOwner, { sym: perms.sym.substr(0, 3), n: perms.digits[0], d: describe(perms.digits[0]) }));
    out.push("  " + fmt(T.rowGroup, { sym: perms.sym.substr(3, 3), n: perms.digits[1], d: describe(perms.digits[1]) }));
    out.push("  " + fmt(T.rowOther, { sym: perms.sym.substr(6, 3), n: perms.digits[2], d: describe(perms.digits[2]) }));
    out.push("");

    // 特殊位：没有也要明说「没有」，省得用户以为工具漏看了
    var sp = [];
    if (perms.setuid) sp.push(T.spSetuid);
    if (perms.setgid) sp.push(T.spSetgid);
    if (perms.sticky) sp.push(T.spSticky);
    out.push(T.spTitle + ": " + (sp.length ? sp.join(" · ") : T.spNone));

    if (perms.setuid || perms.setgid) {
      out.push("");
      out.push(T.spWarn);
    }

    out.push("");
    out.push(T.cmdTitle + ": chmod " + perms.octal + " <file>");

    // 两种最典型的部署翻车，值一到就提醒
    var warn = [];
    if (perms.octal === "0777" || perms.octal === "777") warn.push(T.warn777);
    if (perms.octal === "0666" || perms.octal === "666") warn.push(T.warn666);
    if (warn.length) {
      out.push("");
      out.push("⚠️ " + warn.join("\n⚠️ "));
    }

    output.value = out.join("\n");
    status.className = "status";
    status.textContent = fmt(T.statOk, { oct: perms.octal, sym: perms.sym });
  }

  input.addEventListener("input", TP.debounce(build, 120));

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
