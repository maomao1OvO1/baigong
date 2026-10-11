/* ============================================================================
   文件：compress.js —— 图片压缩工具的前端逻辑（三种语言共用一份）
   为什么共用一份：语言只影响「文字」，逻辑与语言无关。把文案通过 window.T 注入，
                    逻辑代码里一个中文字符都不用出现（面向海外的站，代码也该干净）。
   干什么：选/拖图片 → Canvas 缩放重绘 → 编码 → 生成下载链接，全程本机，零上传。
   注意：处理完立刻 revokeObjectURL，否则手机端批量几十张会把内存吃满。
   作者：小鲸 · 2026-10-11
   ============================================================================ */
(function () {
  "use strict";
  var T = window.T || {};

  var picker = document.getElementById("picker");
  var drop = document.getElementById("drop");
  var quality = document.getElementById("quality");
  var qualityVal = document.getElementById("qualityVal");
  var maxw = document.getElementById("maxw");
  var format = document.getElementById("format");
  var runBtn = document.getElementById("run");
  var clearBtn = document.getElementById("clear");
  var hint = document.getElementById("hint");
  var results = document.getElementById("results");

  var files = [];

  /** 把字节数变成人能读的大小（512 B / 2.0 KB / 1.25 MB） */
  function human(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(2) + " MB";
  }

  /** 模板占位替换：{n} {p} 这类 */
  function fmt(text, map) {
    return String(text || "").replace(/\{(\w+)\}/g, function (m, k) {
      return map[k] !== undefined ? map[k] : m;
    });
  }

  function refresh() {
    hint.textContent = fmt(T.selected, { n: files.length });
    runBtn.disabled = files.length === 0;
    clearBtn.disabled = files.length === 0;
  }

  function addFiles(list) {
    var imgs = list.filter(function (f) { return f.type.indexOf("image/") === 0; });
    if (!imgs.length) return;
    files = files.concat(imgs);
    refresh();
  }

  quality.addEventListener("input", function () { qualityVal.textContent = quality.value + "%"; });
  drop.addEventListener("click", function () { picker.click(); });
  picker.addEventListener("change", function () { addFiles([].slice.call(picker.files)); });
  ["dragenter", "dragover"].forEach(function (e) {
    drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.add("over"); });
  });
  ["dragleave", "drop"].forEach(function (e) {
    drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.remove("over"); });
  });
  drop.addEventListener("drop", function (ev) { addFiles([].slice.call(ev.dataTransfer.files)); });
  clearBtn.addEventListener("click", function () { files = []; results.innerHTML = ""; refresh(); });

  /** 解码成 <img>（用 object URL，不联网） */
  function decode(file) {
    return new Promise(function (ok, bad) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { ok({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); bad(new Error("decode failed")); };
      img.src = url;
    });
  }

  /** 压一张：按最大宽度等比缩放 → Canvas 重绘 → 编码成 Blob */
  function compressOne(file) {
    return decode(file).then(function (got) {
      var w = got.img.naturalWidth, h = got.img.naturalHeight;
      var limit = parseInt(maxw.value || "0", 10);
      if (limit > 0 && w > limit) { h = Math.round(h * limit / w); w = limit; }
      var canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext("2d");
      // JPEG 没有透明通道：先铺白底，否则透明区会渲染成黑块
      if (format.value === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(got.img, 0, 0, w, h);
      URL.revokeObjectURL(got.url);
      var type = format.value;
      var q = type === "image/png" ? undefined : parseInt(quality.value, 10) / 100;
      return new Promise(function (ok) {
        canvas.toBlob(function (blob) { ok({ blob: blob, w: w, h: h }); }, type, q);
      });
    });
  }

  runBtn.addEventListener("click", function () {
    runBtn.disabled = true;
    runBtn.textContent = T.working;
    results.innerHTML = "";
    var chain = Promise.resolve();
    files.forEach(function (file) {
      chain = chain.then(function () {
        return compressOne(file).then(function (out) {
          var pct = file.size ? Math.round((1 - out.blob.size / file.size) * 100) : 0;
          var ext = format.value === "image/png" ? "png" : (format.value === "image/webp" ? "webp" : "jpg");
          var name = file.name.replace(/\.[^.]+$/, "") + "-compressed." + ext;
          var li = document.createElement("li");
          li.innerHTML =
            '<img alt="" src="' + URL.createObjectURL(out.blob) + '">' +
            '<div class="meta"><b></b><span class="note"></span></div>' +
            '<a class="dl" download="' + name + '"></a>';
          li.querySelector("b").textContent = name;
          li.querySelector(".note").innerHTML =
            human(file.size) + " → <span class=\"saved\">" + human(out.blob.size) + "</span> · " +
            (pct > 0 ? fmt(T.saved, { p: pct }) : fmt(T.bigger, { p: Math.abs(pct) })) +
            " · " + out.w + "×" + out.h;
          var a = li.querySelector("a");
          a.textContent = T.download;
          a.href = URL.createObjectURL(out.blob);
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

  // 初始化：滑块初始值同步到标签，按钮态刷新
  qualityVal.textContent = quality.value + "%";
  refresh();
})();
