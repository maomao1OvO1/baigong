/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：cookie-parse.js —— Cookie 解析与安全检查
   干什么：两种粘贴方式都认 ——
           ① `Cookie` 请求头（也就是 document.cookie 的样子）：`a=1; b=2`
           ② `Set-Cookie` 响应头（带属性）：`name=v; Path=/; Secure; HttpOnly; SameSite=Lax`
          前者拆成清单看长度，后者拆出属性并**检查安全性**。

   为什么值得做成工具：
     ① 登录态调试第一步就是看 Cookie，而 `document.cookie` 打出来是一长串分号连接，
        哪个是会话、哪个是埋点、哪个值超长了，肉眼分不出来；
     ② `Set-Cookie` 的属性写漏了**不会报错**，只会静默失去一层防护：
        缺 `HttpOnly` ⇒ 脚本（含 XSS）能读走会话；
        缺 `Secure` ⇒ HTTP 请求也会带上它；
        缺 `SameSite` ⇒ 依赖浏览器默认值（Chrome 现在是 Lax，但这不是规范保证的）；
        `SameSite=None` 却没配 `Secure` ⇒ **浏览器直接丢弃这个 Cookie**（跨站场景最常踩）；
     ③ Cookie 里装的都是会话凭据，**绝不该贴到别人的服务上**。
   ⚠️ 注意：本工具**只解析、不回显以外做任何事** —— 不发送、不请求、不验证这个 Cookie 有没有效。
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

  /** 长值截断显示（保留首尾，中间省略）—— 会话值常常上百字符，全铺出来没法看 */
  function short(v) {
    v = String(v);
    return v.length <= 48 ? v : v.slice(0, 34) + "…" + v.slice(-10);
  }

  /** 秒数转人话 */
  function humanAge(sec) {
    var n = parseInt(sec, 10);
    if (isNaN(n)) return String(sec);
    if (n <= 0) return fmt(T.ageExpired, { n: n });
    if (n < 60) return fmt(T.ageSec, { n: n });
    if (n < 3600) return fmt(T.ageMin, { n: Math.round(n / 60) });
    if (n < 86400) return fmt(T.ageHour, { n: (n / 3600).toFixed(1) });
    return fmt(T.ageDay, { n: (n / 86400).toFixed(1) });
  }

  /** 判断这是不是 Set-Cookie（带属性）—— 有任何一个属性关键字就按它解析 */
  function looksLikeSetCookie(text) {
    return /(?:^|;|\n)\s*(Secure|HttpOnly|SameSite|Path|Domain|Expires|Max-Age|Partitioned)\s*(=|;|$)/im.exec(text) != null;
  }

  /** 解析一行 Set-Cookie */
  function parseSetCookie(line) {
    var parts = String(line).split(";");
    var first = parts.shift() || "";
    var eq = first.indexOf("=");

    var c = {
      name: eq < 0 ? first.trim() : first.slice(0, eq).trim(),
      value: eq < 0 ? "" : first.slice(eq + 1).trim(),
      attrs: [], secure: false, httpOnly: false, sameSite: "", maxAge: null, path: "", domain: ""
    };

    parts.forEach(function (p) {
      var s = p.trim();
      if (!s) return;
      var i = s.indexOf("=");
      var k = (i < 0 ? s : s.slice(0, i)).trim();
      var v = i < 0 ? "" : s.slice(i + 1).trim();
      var lk = k.toLowerCase();

      if (lk === "secure") c.secure = true;
      else if (lk === "httponly") c.httpOnly = true;
      else if (lk === "samesite") c.sameSite = v;
      else if (lk === "max-age") c.maxAge = v;
      else if (lk === "path") c.path = v;
      else if (lk === "domain") c.domain = v;

      c.attrs.push([k, v]);
    });
    return c;
  }

  function build() {
    var raw = input.value.trim();

    if (!raw) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    /* Set-Cookie 可能一次给多行（响应里本来就是多行），逐行处理；
       Cookie 请求头只有一行，按分号拆。 */
    var isSet = looksLikeSetCookie(raw);
    var out = [];

    if (isSet) {
      var lines = raw.split(/\r?\n/).map(function (s) { return s.replace(/^set-cookie:\s*/i, "").trim(); })
                                .filter(Boolean);
      var advice = [];

      lines.forEach(function (line, idx) {
        var c = parseSetCookie(line);
        if (!c.name) return;

        if (idx > 0) out.push("");
        out.push(fmt(T.rowName, { s: c.name }));
        out.push(fmt(T.rowValue, { s: short(c.value) }) + "  (" + c.value.length + ")");

        if (c.attrs.length) {
          out.push(T.attrTitle + ":");
          c.attrs.forEach(function (a) {
            var label = "  " + a[0] + (a[1] ? " = " + a[1] : "");
            if (/^max-age$/i.exec(a[0])) label += "   " + humanAge(a[1]);
            out.push(label);
          });
        }

        // 逐条安全判定
        if (!c.secure) advice.push(fmt(T.advNotSecure, { s: c.name }));
        if (!c.httpOnly) advice.push(fmt(T.advNotHttpOnly, { s: c.name }));
        if (!c.sameSite) advice.push(fmt(T.advNoSameSite, { s: c.name }));
        else if (/^none$/i.exec(c.sameSite) && !c.secure) advice.push(fmt(T.advNoneNoSecure, { s: c.name }));
        if (c.value.length > 4096) advice.push(fmt(T.advTooLong, { s: c.name, n: c.value.length }));
      });

      out.push("");
      out.push("— " + T.adviceTitle + " —");
      out.push(advice.length ? advice.map(function (a) { return "· " + a; }).join("\n") : T.adviceOk);

      status.className = "status";
      status.textContent = fmt(T.statSetCookie, { n: lines.length, m: advice.length });
    } else {
      // Cookie 请求头：`a=1; b=2; …`
      var items = raw.replace(/^cookie:\s*/i, "").split(";")
        .map(function (s) { return s.trim(); })
        .filter(Boolean)
        .map(function (s) {
          var i = s.indexOf("=");
          return { name: i < 0 ? s : s.slice(0, i).trim(), value: i < 0 ? "" : s.slice(i + 1).trim() };
        });

      if (!items.length) {
        output.value = "";
        status.className = "status err";
        status.textContent = T.errNothing || "";
        return;
      }

      var total = raw.length;
      var longest = items.reduce(function (a, b) { return b.value.length > a.value.length ? b : a; }, items[0]);

      out.push(fmt(T.statHeader, { n: items.length, m: total }));
      out.push("");

      // 名字对齐着列出来，一眼能扫完
      var width = items.reduce(function (w, it) { return Math.max(w, it.name.length); }, 0);
      items.forEach(function (it) {
        var pad = it.name + new Array(Math.max(1, width - it.name.length + 2)).join(" ");
        out.push(pad + short(it.value) + "   (" + it.value.length + ")");
      });

      out.push("");
      out.push(T.headerOut + ":");
      out.push(items.map(function (it) { return it.name + "=" + it.value; }).join("; "));
      out.push("");
      out.push(T.longestOut + ": " + longest.name + " (" + longest.value.length + " " + T.chars + ")");

      status.className = "status";
      status.textContent = fmt(T.statHeader, { n: items.length, m: total });
    }

    output.value = out.join("\n");
  }

  input.addEventListener("input", TP.debounce(build, 150));

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
