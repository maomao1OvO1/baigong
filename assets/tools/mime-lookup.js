/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：mime-lookup.js —— MIME 类型速查（扩展名 ⇄ Content-Type）
   干什么：输入扩展名（png / .png）或 MIME（image/png），双向查对方，
          顺带给出 Content-Type 头写法、<input accept> 写法和「这是文本还是二进制」。

   为什么值得做成工具：
     ① 「这个扩展名的 MIME 到底是什么」是高频问题，而答案常常反直觉 ——
        js 的正式类型是 text/javascript，.ico 有 image/x-icon 与 image/vnd.microsoft.icon 两种写法，
        .yaml 至今没有统一的注册类型（application/yaml 与 text/yaml 都在用）；
     ② 静态站最常见的「资源加载不出来」，根因就是服务端给的 Content-Type 不对 ——
        CSS 给了 text/plain，浏览器会**直接拒绝**执行（不是警告，是拒绝），
        报错信息却只说「MIME type mismatch」；
     ③ 一个 MIME 往往对应多个扩展名（image/jpeg ↔ .jpg / .jpeg / .jpe），
        反向查的时候这一步最容易漏。

   ⚠️ 安全边界（写在页面上比藏在心里强）：**别拿扩展名或 MIME 做上传校验**。
      两者都是客户端说了算的字段，改一个字就能绕过；服务端必须**嗅探真实内容**
      （magic bytes），或者干脆重命名 + 转码后再存。

   数据说明：表里是**常用**类型，不是我抄了 IANA 全表 —— 冷门类型查不到会如实说查不到。
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

  /* 表：[扩展名（不带点）, MIME, 类别]
     类别用来在结果里说明「这是什么类的东西」，类别名走三语文案。 */
  var DATA = [
    // ── 图片 ──
    ["png", "image/png", "image"],
    ["jpg", "image/jpeg", "image"],
    ["jpeg", "image/jpeg", "image"],
    ["gif", "image/gif", "image"],
    ["webp", "image/webp", "image"],
    ["avif", "image/avif", "image"],
    ["svg", "image/svg+xml", "image"],
    ["ico", "image/x-icon", "image"],
    ["bmp", "image/bmp", "image"],
    ["tif", "image/tiff", "image"],
    ["tiff", "image/tiff", "image"],
    ["heic", "image/heic", "image"],
    ["heif", "image/heif", "image"],
    ["psd", "image/vnd.adobe.photoshop", "image"],
    // ── 音频 ──
    ["mp3", "audio/mpeg", "audio"],
    ["wav", "audio/wav", "audio"],
    ["ogg", "audio/ogg", "audio"],
    ["oga", "audio/ogg", "audio"],
    ["m4a", "audio/mp4", "audio"],
    ["aac", "audio/aac", "audio"],
    ["flac", "audio/flac", "audio"],
    ["opus", "audio/opus", "audio"],
    ["weba", "audio/webm", "audio"],
    // ── 视频 ──
    ["mp4", "video/mp4", "video"],
    ["m4v", "video/mp4", "video"],
    ["webm", "video/webm", "video"],
    ["ogv", "video/ogg", "video"],
    ["mov", "video/quicktime", "video"],
    ["avi", "video/x-msvideo", "video"],
    ["mkv", "video/x-matroska", "video"],
    ["m3u8", "application/vnd.apple.mpegurl", "video"],
    ["ts", "video/mp2t", "video"],
    // ── 网页 / 文本 ──
    ["html", "text/html", "text"],
    ["htm", "text/html", "text"],
    ["css", "text/css", "text"],
    ["js", "text/javascript", "text"],
    ["mjs", "text/javascript", "text"],
    ["cjs", "text/javascript", "text"],
    ["json", "application/json", "text"],
    ["map", "application/json", "text"],
    ["jsonld", "application/ld+json", "text"],
    ["txt", "text/plain", "text"],
    ["md", "text/markdown", "text"],
    ["csv", "text/csv", "text"],
    ["tsv", "text/tab-separated-values", "text"],
    ["xml", "application/xml", "text"],
    ["yaml", "application/yaml", "text"],
    ["yml", "application/yaml", "text"],
    ["toml", "application/toml", "text"],
    ["ini", "text/plain", "text"],
    ["ics", "text/calendar", "text"],
    ["vtt", "text/vtt", "text"],
    ["srt", "application/x-subrip", "text"],
    ["rtf", "application/rtf", "text"],
    // ── 字体 ──
    ["woff", "font/woff", "font"],
    ["woff2", "font/woff2", "font"],
    ["ttf", "font/ttf", "font"],
    ["otf", "font/otf", "font"],
    ["eot", "application/vnd.ms-fontobject", "font"],
    // ── 文档 ──
    ["pdf", "application/pdf", "doc"],
    ["doc", "application/msword", "doc"],
    ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "doc"],
    ["xls", "application/vnd.ms-excel", "doc"],
    ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "doc"],
    ["ppt", "application/vnd.ms-powerpoint", "doc"],
    ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "doc"],
    ["epub", "application/epub+zip", "doc"],
    ["odt", "application/vnd.oasis.opendocument.text", "doc"],
    // ── 压缩 / 二进制 ──
    ["zip", "application/zip", "archive"],
    ["gz", "application/gzip", "archive"],
    ["tgz", "application/gzip", "archive"],
    ["tar", "application/x-tar", "archive"],
    ["7z", "application/x-7z-compressed", "archive"],
    ["rar", "application/vnd.rar", "archive"],
    ["bz2", "application/x-bzip2", "archive"],
    ["xz", "application/x-xz", "archive"],
    ["zst", "application/zstd", "archive"],
    // ── 应用 / 清单 ──
    ["webmanifest", "application/manifest+json", "app"],
    ["appcache", "text/cache-manifest", "app"],
    ["wasm", "application/wasm", "app"],
    ["apk", "application/vnd.android.package-archive", "app"],
    ["dmg", "application/x-apple-diskimage", "app"],
    ["exe", "application/x-msdownload", "app"],
    ["msi", "application/x-msi", "app"],
    ["deb", "application/vnd.debian.binary-package", "app"],
    ["rpm", "application/x-rpm", "app"],
    ["iso", "application/x-iso9660-image", "app"],
    ["bin", "application/octet-stream", "app"],
    ["torrent", "application/x-bittorrent", "app"],
    ["pem", "application/x-pem-file", "app"],
    ["p12", "application/x-pkcs12", "app"],
    ["sqlite", "application/vnd.sqlite3", "app"]
  ];

  /* 两个索引：扩展名 → 记录；MIME → 记录数组（一个 MIME 常有多个扩展名） */
  var byExt = Object.create(null), byMime = Object.create(null);
  DATA.forEach(function (r) {
    byExt[r[0]] = r;
    (byMime[r[1]] = byMime[r[1]] || []).push(r);
  });

  /** 类别名走三语文案 */
  function kindName(kind) {
    return T["kind_" + kind] || kind;
  }

  /** 这个类型能不能当文本处理（决定「复制粘贴 / 直接看」这类操作安不安全） */
  function isTextual(mime) {
    return /^text\//.test(mime) || /(json|xml|javascript|yaml|toml|markdown|csv|urlencoded)/i.test(mime);
  }

  function build() {
    var raw = String(input.value || "").trim();

    if (!raw) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    var out = [], statusText = "";

    /* 输入里带斜杠 ⇒ 当 MIME 查；否则当扩展名查（去掉开头的点与星号：
       用户经常直接粘 `*.png` 或 `.png`） */
    if (raw.indexOf("/") >= 0) {
      var mime = raw.toLowerCase().split(";")[0].trim();   // 允许粘贴带参数的 Content-Type
      var hits = byMime[mime];

      if (!hits) {
        // 别名：ico / xml / yaml 这几个在现实里有两种写法，直接给出另一个
        var alt = { "image/vnd.microsoft.icon": "image/x-icon", "text/xml": "application/xml",
                    "text/yaml": "application/yaml", "application/x-yaml": "application/yaml",
                    "application/javascript": "text/javascript", "text/json": "application/json",
                    "application/x-www-form-urlencoded": null }[mime];

        output.value = "";
        status.className = "status err";
        status.textContent = fmt(T.notFoundMime, { s: mime }) + (alt ? " · " + fmt(T.aliasHint, { s: alt }) : "");
        return;
      }

      out.push(fmt(T.rowMime, { s: mime }));
      out.push(fmt(T.rowExt, { s: hits.map(function (h) { return "." + h[0]; }).join(" · ") }));
      out.push(fmt(T.rowKind, { s: kindName(hits[0][2]) }));
      out.push(fmt(T.rowTextual, { s: isTextual(mime) ? T.yes : T.no }));
      out.push("");
      out.push(fmt(T.rowHeader, { s: "Content-Type: " + mime }));
      out.push(fmt(T.rowAccept, { s: hits.map(function (h) { return "." + h[0]; }).join(",") + "," + mime }));
      statusText = fmt(T.statOkMime, { n: hits.length });
    } else {
      var ext = raw.toLowerCase().replace(/^[*.\s]+/, "").replace(/^\./, "");
      var rec = byExt[ext];

      if (!rec) {
        output.value = "";
        status.className = "status err";
        status.textContent = fmt(T.notFoundExt, { s: ext });
        return;
      }

      out.push(fmt(T.rowExt, { s: "." + rec[0] }));
      out.push(fmt(T.rowMime, { s: rec[1] }));
      out.push(fmt(T.rowKind, { s: kindName(rec[2]) }));
      out.push(fmt(T.rowTextual, { s: isTextual(rec[1]) ? T.yes : T.no }));
      out.push("");
      out.push(fmt(T.rowHeader, { s: "Content-Type: " + rec[1] }));
      out.push(fmt(T.rowAccept, { s: "." + rec[0] + "," + rec[1] }));

      // 这个 MIME 还有别的扩展名 ⇒ 一并列出来（反向查最常漏的就是这一步）
      var sib = (byMime[rec[1]] || []).map(function (r) { return "." + r[0]; });
      if (sib.length > 1) out.push(fmt(T.rowSiblings, { s: sib.join(" · ") }));

      statusText = fmt(T.statOkExt, { s: rec[1] });
    }

    // 安全提醒：不论查到什么都带上，因为它比查表本身更重要
    out.push("");
    out.push(T.safety);
    output.value = out.join("\n");

    status.className = "status";
    status.textContent = statusText;
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
