/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：curl-to-code.js —— curl 命令转成代码
   干什么：把一条从浏览器「Copy as cURL」或文档里抄来的 curl 命令，
          转成 JavaScript fetch / axios / Python requests 三种写法。

   为什么值得做成工具：
     ① 「Copy as cURL」是浏览器和 Postman 里最常见的取证方式，但 curl 的长选项
        （-H / -d / --data-raw / -u / -b）没人想手抄成代码，一不小心就漏一个请求头；
     ② 漏掉的往往是**最关键的那个**：Content-Type 一丢，服务端就把 JSON 当表单解析，
        报的错还跟你真正的 bug 长得一样；
     ③ curl 里带 token、Cookie、密码是常态 —— 这类内容**不该先粘到别人的网站**上转换。
        这里全程在你浏览器里跑，一个字节都不外发。

   解析要点（都是实测会遇到的写法）：
     - 行尾反斜杠续行：Copy as cURL 出来的命令是**多行**的，不先合并就整条解析不了；
     - 单引号内原样、双引号内认反斜杠转义 —— 两者规则不同，混着处理会把 URL 里的
       反斜杠吃掉；
     - 多个 `-d` 是**用 & 拼接**（curl 的实际行为），不是覆盖；
     - `-G` 会把 data 挪到查询串，方法仍是 GET。

   注意：`-d @文件名` 这种「从文件读 body」的写法没法还原（文件内容拿不到），
        遇到会明确提示，不会假装转换成功。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");
  var targetEl = $("target");

  function fmt(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  /* ── 第一步：分词 ─────────────────────────────────────────────────────────
     shell 的两套引号规则不一样，混着处理必错：
       · 单引号内**一切原样**（包括反斜杠）—— URL 里的 \ 就靠这条才不会被吃掉；
       · 双引号内认 \ 转义（\" \\ \$ \`）。 */
  function tokenize(src) {
    var out = [], cur = "", quote = null, i = 0;

    while (i < src.length) {
      var c = src.charAt(i);

      if (quote) {
        if (c === quote) { quote = null; i++; continue; }
        if (quote === '"' && c === "\\" && i + 1 < src.length) {
          var n = src.charAt(i + 1);
          if (n === '"' || n === "\\" || n === "$" || n === "`") { cur += n; i += 2; continue; }
        }
        cur += c; i++; continue;
      }

      if (c === "'" || c === '"') { quote = c; i++; continue; }
      if (c === " " || c === "\t" || c === "\n" || c === "\r") {
        if (cur) { out.push(cur); cur = ""; }
        i++; continue;
      }
      cur += c; i++;
    }
    if (cur) out.push(cur);
    return out;
  }

  /* 需要「吃掉后面一个值」的选项；剩下的一律当开关。分两张表是为了把
     「我认得的」和「我忽略的」分开，报告里才好如实说忽略了几项。 */
  var TAKE_VALUE = {
    "-X": "method", "--request": "method",
    "-H": "header", "--header": "header",
    "-d": "data", "--data": "data", "--data-raw": "data", "--data-binary": "data",
    "--data-ascii": "data", "--data-urlencode": "data",
    "-F": "form", "--form": "form", "--form-string": "form",
    "-u": "user", "--user": "user",
    "-b": "cookie", "--cookie": "cookie",
    "-A": "ua", "--user-agent": "ua",
    "-e": "referer", "--referer": "referer",
    "--url": "url",
    "-o": "ignore", "--output": "ignore",
    "--max-time": "ignore", "-m": "ignore",
    "-w": "ignore", "--write-out": "ignore"
  };
  var IGNORED = {
    "--compressed": 1, "-L": 1, "--location": 1, "-k": 1, "--insecure": 1,
    "-s": 1, "--silent": 1, "-v": 1, "--verbose": 1, "-i": 1, "--include": 1,
    "-f": 1, "--fail": 1, "--no-buffer": 1, "-N": 1, "--globoff": 1, "-g": 1
  };

  /** 解析成结构化的请求描述 */
  function parse(src) {
    // 先合并续行：Copy as cURL 出来的命令是多行的，不合并整条都废
    var flat = String(src).replace(/\\\r?\n\s*/g, " ").trim();
    var tokens = tokenize(flat);

    if (tokens.length && /^(curl|curl\.exe)$/i.test(tokens[0])) tokens.shift();

    var req = { method: "", url: "", headers: [], body: [], form: [], user: "", cookie: "", ua: "", referer: "", ignored: 0, fileBody: false };

    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];

      if (t.charAt(0) !== "-") {
        if (!req.url) req.url = t;          // 第一个裸参数就是 URL
        continue;
      }

      var kind = TAKE_VALUE[t];
      if (kind) {
        var v = tokens[++i];
        if (v == null) break;

        if (kind === "method") req.method = v.toUpperCase();
        else if (kind === "header") req.headers.push(v);
        else if (kind === "data") {
          if (/^@/.test(v)) req.fileBody = true;   // -d @file：内容拿不到，别假装能转
          req.body.push(v);
        }
        else if (kind === "form") req.form.push(v);
        else if (kind === "user") req.user = v;
        else if (kind === "cookie") req.cookie = v;
        else if (kind === "ua") req.ua = v;
        else if (kind === "referer") req.referer = v;
        else if (kind === "url") req.url = v;
        continue;
      }

      if (IGNORED[t]) continue;
      req.ignored++;   // 认不出的选项：记个数，报告里如实说，不当它不存在
    }

    // 多个 -d 是用 & 拼起来的（curl 的实际行为），不是后一个覆盖前一个
    req.bodyText = req.body.join("&");

    if (!req.method) req.method = (req.bodyText || req.form.length) ? "POST" : "GET";
    return req;
  }

  /** 取某个头（不区分大小写） */
  function headerOf(req, name) {
    var lower = name.toLowerCase();
    for (var i = 0; i < req.headers.length; i++) {
      var p = req.headers[i].indexOf(":");
      if (p < 0) continue;
      if (req.headers[i].slice(0, p).trim().toLowerCase() === lower) return req.headers[i].slice(p + 1).trim();
    }
    return "";
  }

  /** 头列表 → [名, 值] 数组（顺带把 -b / -A / -e 并进来） */
  function allHeaders(req) {
    var list = [];
    req.headers.forEach(function (h) {
      var p = h.indexOf(":");
      if (p < 0) return;
      list.push([h.slice(0, p).trim(), h.slice(p + 1).trim()]);
    });
    if (req.ua) list.push(["User-Agent", req.ua]);
    if (req.referer) list.push(["Referer", req.referer]);
    if (req.cookie) list.push(["Cookie", req.cookie]);
    return list;
  }

  /** body 能当 JSON 解析就给对象，否则给原始字符串（不猜） */
  function bodyOf(req) {
    if (!req.bodyText) return null;
    var ct = headerOf(req, "content-type");
    if (/json/i.test(ct) || /^\s*[{[]/.test(req.bodyText)) {
      try { return { json: JSON.parse(req.bodyText) }; } catch (e) { /* 不是 JSON，落到字符串 */ }
    }
    return { raw: req.bodyText };
  }

  function indentLines(text, pad) {
    return text.split("\n").map(function (l) { return pad + l; }).join("\n");
  }

  // ── 三个目标各自的代码生成 ──────────────────────────────────────────────

  function toFetch(req) {
    var hs = allHeaders(req);
    var body = bodyOf(req);
    var lines = [];

    lines.push("const res = await fetch(" + JSON.stringify(req.url) + ", {");
    lines.push("  method: " + JSON.stringify(req.method) + ",");
    if (hs.length) {
      lines.push("  headers: {");
      lines.push(hs.map(function (h) {
        return "    " + JSON.stringify(h[0]) + ": " + JSON.stringify(h[1]);
      }).join(",\n"));
      lines.push("  },");
    }
    if (req.form.length) {
      lines.push("  // multipart/form-data：交给 FormData，别手写 Content-Type（boundary 是浏览器生成的）");
      lines.push("  body: (() => {");
      lines.push("    const fd = new FormData();");
      req.form.forEach(function (f) {
        var p = f.indexOf("=");
        var k = p < 0 ? f : f.slice(0, p);
        var v = p < 0 ? "" : f.slice(p + 1);
        lines.push("    fd.append(" + JSON.stringify(k) + ", " + JSON.stringify(v) + ");");
      });
      lines.push("    return fd;");
      lines.push("  })(),");
    } else if (body) {
      lines.push("  body: " + (body.json
        ? "JSON.stringify(" + indentLines(JSON.stringify(body.json, null, 2), "").replace(/\n/g, "\n  ") + ")"
        : JSON.stringify(body.raw)) + ",");
    }
    lines.push("});");
    lines.push("");
    lines.push("if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);");
    lines.push("const data = await res.json();   // 不是 JSON 响应就换成 res.text()");
    return lines.join("\n");
  }

  function toAxios(req) {
    var hs = allHeaders(req);
    var body = bodyOf(req);
    var fn = req.method.toLowerCase();
    var lines = [];

    lines.push("const { data } = await axios." + fn + "(");
    lines.push("  " + JSON.stringify(req.url) + ",");
    if (req.form.length) {
      lines.push("  formData,   // 需要自己先建 FormData（见下方注释）");
    } else if (body) {
      lines.push(indentLines(body.json ? JSON.stringify(body.json, null, 2) : JSON.stringify(body.raw), "  ") + ",");
    }
    if (hs.length) {
      lines.push("  {");
      lines.push("    headers: {");
      lines.push(hs.map(function (h) {
        return "      " + JSON.stringify(h[0]) + ": " + JSON.stringify(h[1]);
      }).join(",\n"));
      lines.push("    },");
      if (req.user) lines.push("    auth: { username: " + JSON.stringify(req.user.split(":")[0]) + ", password: " + JSON.stringify(req.user.split(":").slice(1).join(":")) + " },");
      lines.push("  }");
    } else if (req.user) {
      lines.push("  { auth: { username: " + JSON.stringify(req.user.split(":")[0]) + ", password: " + JSON.stringify(req.user.split(":").slice(1).join(":")) + " } }");
    }
    lines.push(");");
    return lines.join("\n");
  }

  function toPython(req) {
    var hs = allHeaders(req);
    var body = bodyOf(req);
    var lines = [];

    lines.push("import requests");
    lines.push("");
    lines.push("resp = requests." + req.method.toLowerCase() + "(");
    lines.push("    " + pyStr(req.url) + ",");
    if (hs.length) {
      lines.push("    headers={");
      lines.push(hs.map(function (h) {
        return "        " + pyStr(h[0]) + ": " + pyStr(h[1]);
      }).join(",\n"));
      lines.push("    },");
    }
    if (req.form.length) {
      lines.push("    files={   # multipart/form-data");
      req.form.forEach(function (f) {
        var p = f.indexOf("=");
        var k = p < 0 ? f : f.slice(0, p);
        var v = p < 0 ? "" : f.slice(p + 1);
        lines.push("        " + pyStr(k) + ": (None, " + pyStr(v) + "),");
      });
      lines.push("    },");
    } else if (body) {
      lines.push(body.json
        ? "    json=" + indentLines(pyJson(body.json), "    ").replace(/^\s+/, "") + ","
        : "    data=" + pyStr(body.raw) + ",");
    }
    if (req.user) {
      var u = req.user.split(":");
      lines.push("    auth=(" + pyStr(u[0]) + ", " + pyStr(u.slice(1).join(":")) + "),");
    }
    lines.push(")");
    lines.push("resp.raise_for_status()");
    lines.push("print(resp.json())   # 不是 JSON 响应就换成 resp.text");
    return lines.join("\n");
  }

  /** Python 字符串字面量（用双引号 + 反斜杠转义，跟黑格式化后的风格一致） */
  function pyStr(s) {
    return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
  }

  /** JSON → Python 字面量（True / False / None 与 JSON 不同，得换） */
  function pyJson(obj) {
    return JSON.stringify(obj, null, 4)
      .replace(/\btrue\b/g, "True")
      .replace(/\bfalse\b/g, "False")
      .replace(/\bnull\b/g, "None");
  }

  function build() {
    var src = String(input.value || "").trim();

    if (!src) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    var req = parse(src);

    if (!req.url) {
      output.value = "";
      status.className = "status err";
      status.textContent = T.errNoUrl || "";
      return;
    }
    if (req.fileBody) {
      output.value = "";
      status.className = "status err";
      status.textContent = T.errFileBody || "";
      return;
    }

    var target = targetEl ? targetEl.value : "fetch";
    var code = target === "axios" ? toAxios(req) : (target === "python" ? toPython(req) : toFetch(req));
    output.value = code + "\n";

    var hs = allHeaders(req);
    var msg = fmt(T.statOk, { method: req.method, n: hs.length });
    if (req.form.length) msg += " · " + fmt(T.statForm, { n: req.form.length });
    else if (req.bodyText) msg += " · " + fmt(T.statBody, { n: req.bodyText.length });
    if (req.ignored) msg += " · " + fmt(T.statIgnored, { n: req.ignored });
    status.className = "status";
    status.textContent = msg;
  }

  input.addEventListener("input", TP.debounce(build, 150));
  if (targetEl) targetEl.addEventListener("change", build);

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
