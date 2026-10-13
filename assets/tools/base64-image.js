/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：base64-image.js —— 图片转 Base64 / data URI
   干什么：把图片读成 Base64，按需要给出四种可直接粘的形态：
          data URI · 纯 Base64 · CSS 的 background-image · HTML 的 <img src>。

   为什么值得做成工具：
     ① 小图标内联进 CSS/HTML 能**少一次网络请求**，而手边没有命令行时会嫌麻烦；
     ② Base64 的体积不是「差不多」而是**精确 +33%**（每 3 字节变 4 个字符），
        算错这一步会让人误以为内联没多大代价 —— 工具里直接把两个体积并排摆出来；
     ③ 这类图片常是**客户或自己的私有素材**，而在线转换站多半会把文件传上去。
        这里用 FileReader 在你浏览器里读，一个字节都不外传。

   四种形态（各有用处，别混）：
     · `data:` URI        —— CSS、HTML、JSON 里通用
     · 纯 Base64          —— 给只接受裸 Base64 的接口 / 字段
     · CSS 写法           —— 直接是 `background-image: url("data:…")`
     · HTML 写法          —— 直接是 `<img src="data:…">`

   ⚠️ 内联的代价（页面上也会提示）：data URI 无法被浏览器单独缓存，
      也不能用 CDN；超过约 10 KB 就不该内联了，大图内联会让 HTML/CSS 明显变大、首屏变慢。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var picker = $("picker"), drop = $("drop"), results = $("results");
  var runBtn = $("run"), clearBtn = $("clear");
  var modeEl = $("mode");

  var files = [];

  function fmt(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  /** Base64 之后的字符数：每 3 字节变 4 个字符（不足 3 的补 = ，所以向上取整） */
  function b64Size(bytes) {
    return Math.ceil(bytes / 3) * 4;
  }

  /** 按模式拼出要复制的内容（纯函数 —— 不碰 DOM，方便单测） */
  function compose(mime, b64, mode) {
    var uri = "data:" + (mime || "application/octet-stream") + ";base64," + b64;
    if (mode === "base64") return b64;
    if (mode === "css") return 'background-image: url("' + uri + '");';
    if (mode === "html") return '<img src="' + uri + '" alt="">';
    return uri;   // 默认给完整 data URI
  }

  /* ── 选文件：点击与拖拽两条路都通 ─────────────────────────────────────── */
  drop.addEventListener("click", function () { picker.click(); });
  picker.addEventListener("change", function () { add([].slice.call(picker.files)); });
  ["dragover", "dragenter"].forEach(function (e) {
    drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.add("over"); });
  });
  ["dragleave", "drop"].forEach(function (e) {
    drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.remove("over"); });
  });
  drop.addEventListener("drop", function (ev) { add([].slice.call(ev.dataTransfer.files)); });

  function add(list) {
    list.filter(function (f) { return /^image\//.test(f.type); }).forEach(function (f) { files.push(f); });
    refresh();
  }

  function refresh() {
    runBtn.disabled = !files.length;
    clearBtn.disabled = !files.length;
    runBtn.textContent = T.run;
    if (!files.length) results.innerHTML = "";
  }

  /** 读一个文件成 data URL（失败不抛，交给调用方显示「读不出来」） */
  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result)); };
      fr.onerror = function () { reject(new Error("read")); };
      fr.readAsDataURL(file);
    });
  }

  runBtn.addEventListener("click", function () {
    runBtn.disabled = true;
    runBtn.textContent = T.working;
    results.innerHTML = "";
    var mode = modeEl ? modeEl.value : "datauri";

    var chain = Promise.resolve();
    files.forEach(function (file) {
      chain = chain.then(function () {
        return readAsDataUrl(file).then(function (dataUrl) {
          // data URL 形如 data:image/png;base64,XXXX —— 逗号后面才是纯 Base64
          var comma = dataUrl.indexOf(",");
          var mime = /^data:([^;,]+)/.exec(dataUrl);
          mime = mime ? mime[1] : (file.type || "application/octet-stream");
          var b64 = dataUrl.slice(comma + 1);
          var payload = compose(mime, b64, mode);

          var li = document.createElement("li");
          li.innerHTML = '<img alt="">' +
            '<div class="meta"><b></b><span class="note"></span></div>' +
            '<div class="btnrow"><button class="cp"></button><button class="dl"></button></div>';

          li.querySelector("img").src = dataUrl;
          li.querySelector("b").textContent = file.name;

          var orig = file.size, enc = b64Size(orig);
          var ratio = orig ? Math.round((enc / orig) * 100 - 100) : 0;
          li.querySelector(".note").textContent =
            mime + " · " + TP.human(orig) + " → " + TP.human(enc) + " (+" + ratio + "%)" +
            (enc > 10240 ? "  ⚠️ " + T.heavyTip : "  ✓ " + T.lightTip);

          var cp = li.querySelector(".cp");
          cp.textContent = T.copyPayload;
          cp.onclick = function () {
            TP.copy(payload).then(function () { TP.toast(T.copied); },
              function () { TP.toast(T.copyFail); });
          };

          var dl = li.querySelector(".dl");
          dl.textContent = T.download;
          dl.onclick = function () {
            TP.download(new Blob([payload], { type: "text/plain" }), file.name.replace(/\.[^.]+$/, "") + ".base64.txt");
          };

          results.appendChild(li);
        }).catch(function () {
          var li = document.createElement("li");
          li.innerHTML = '<div class="meta"><b></b><span class="note"></span></div>';
          li.querySelector("b").textContent = file.name;
          li.querySelector(".note").textContent = T.failed;
          results.appendChild(li);
        });
      });
    });

    chain.then(function () {
      runBtn.disabled = false;
      runBtn.textContent = T.run;
    });
  });

  clearBtn.addEventListener("click", function () {
    files = [];
    results.innerHTML = "";
    refresh();
  });

  /* 把两个纯函数挂出来给测试用：图片流程依赖 FileReader，
     在 Node 的测试环境里跑不了 —— 能单测的就是这两段算法（尺寸换算与四种形态拼装）。
     挂到 window 上不影响正常使用，也方便在控制台里手验。 */
  window.TP_B64_IMAGE = { compose: compose, b64Size: b64Size };

  refresh();
})();
