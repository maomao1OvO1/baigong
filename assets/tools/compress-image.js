/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：compress-image.js —— 图片压缩（拖拽批量 → Canvas 本机重绘 → 下载）
   接口约定（和生成器对齐，别的工具也照这个来）：
     #drop 拖拽区 / #picker 文件选择 / #options 控件容器 /
     #run 主按钮 / #clear 清空 / #results 结果列表 / #toast 提示条
     控件 id 来自 src/tools.json 的 options 声明（quality / maxw / format）
   性能考虑：处理完立刻 revokeObjectURL —— 手机端批量几十张时，不解绑会把内存吃满导致标签页崩。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var files = [];

  var picker = $("picker"), drop = $("drop"), results = $("results");
  var runBtn = $("run"), clearBtn = $("clear");
  var quality = $("quality"), maxw = $("maxw"), format = $("format");
  var qualityVal = $("qualityVal");

  function refresh() {
    $("hint").textContent = (T.selected || "").replace("{n}", files.length);
    runBtn.disabled = clearBtn.disabled = files.length === 0;
  }

  function add(list) {
    var imgs = list.filter(function (f) { return f.type.indexOf("image/") === 0; });
    if (imgs.length) { files = files.concat(imgs); refresh(); }
  }

  drop.addEventListener("click", function () { picker.click(); });
  picker.addEventListener("change", function () { add([].slice.call(picker.files)); });
  ["dragenter", "dragover"].forEach(function (e) {
    drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.add("over"); });
  });
  ["dragleave", "drop"].forEach(function (e) {
    drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.remove("over"); });
  });
  drop.addEventListener("drop", function (ev) { add([].slice.call(ev.dataTransfer.files)); });
  clearBtn.addEventListener("click", function () { files = []; results.innerHTML = ""; refresh(); });
  if (quality) quality.addEventListener("input", function () { qualityVal.textContent = quality.value + "%"; });

  function decode(file) {
    return new Promise(function (ok, bad) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { ok({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); bad(new Error("decode")); };
      img.src = url;
    });
  }

  function process(file) {
    return decode(file).then(function (got) {
      var w = got.img.naturalWidth, h = got.img.naturalHeight;
      var limit = parseInt(maxw && maxw.value || "0", 10);
      if (limit > 0 && w > limit) { h = Math.round(h * limit / w); w = limit; }
      var c = document.createElement("canvas");
      c.width = w; c.height = h;
      var ctx = c.getContext("2d");
      // JPEG 无透明通道，先铺白底，否则透明区会变成黑块
      if (format.value === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(got.img, 0, 0, w, h);
      URL.revokeObjectURL(got.url);
      var type = format.value;
      var q = type === "image/png" ? undefined : parseInt(quality.value, 10) / 100;
      return new Promise(function (ok) { c.toBlob(function (b) { ok({ blob: b, w: w, h: h }); }, type, q); });
    });
  }

  runBtn.addEventListener("click", function () {
    runBtn.disabled = true;
    runBtn.textContent = T.working;
    results.innerHTML = "";
    var chain = Promise.resolve();
    files.forEach(function (file) {
      chain = chain.then(function () {
        return process(file).then(function (out) {
          var pct = file.size ? Math.round((1 - out.blob.size / file.size) * 100) : 0;
          var ext = format.value === "image/png" ? "png" : (format.value === "image/webp" ? "webp" : "jpg");
          var name = file.name.replace(/\.[^.]+$/, "") + "-compressed." + ext;
          var li = document.createElement("li");
          li.innerHTML = '<img alt="">' +
            '<div class="meta"><b></b><span class="note"></span></div>' +
            '<button class="dl"></button>';
          li.querySelector("img").src = URL.createObjectURL(out.blob);
          li.querySelector("b").textContent = name;
          li.querySelector(".note").innerHTML = TP.human(file.size) + " → <span class=\"saved\">" +
            TP.human(out.blob.size) + "</span> · " +
            (pct > 0 ? (T.saved || "{p}%").replace("{p}", pct) : (T.bigger || "{p}%").replace("{p}", -pct)) +
            " · " + out.w + "×" + out.h;
          var btn = li.querySelector("button");
          btn.textContent = T.download;
          btn.onclick = function () { TP.download(out.blob, name); };
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
    chain.then(function () { runBtn.disabled = false; runBtn.textContent = T.run; });
  });

  if (qualityVal) qualityVal.textContent = quality.value + "%";
  refresh();
})();
