/* ============================================================================
   文件：convert-image.js —— 图片格式转换（PNG ⇄ JPG ⇄ WebP，本机完成，零上传）
   和图片压缩的区别：这里的目标是「换成另一种格式」，质量默认拉满；
   压缩那边目标是「变小」。两者共用同一套 Canvas 思路，但 UI 与默认值不同，
   所以各自一个脚本，而不是塞进一个带一堆 if 的巨型脚本（那才是屎山）。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var files = [];

  var picker = $("picker"), drop = $("drop"), results = $("results");
  var runBtn = $("run"), clearBtn = $("clear");
  var format = $("format"), quality = $("quality"), qualityVal = $("qualityVal");

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
  if (quality && qualityVal) quality.addEventListener("input", function () { qualityVal.textContent = quality.value + "%"; });

  function convert(file) {
    return new Promise(function (ok, bad) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        var ctx = c.getContext("2d");
        if (format.value === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        var type = format.value;
        var q = type === "image/png" ? undefined : parseInt(quality.value, 10) / 100;
        c.toBlob(function (b) { ok(b); }, type, q);
      };
      img.onerror = function () { URL.revokeObjectURL(url); bad(new Error("decode")); };
      img.src = url;
    });
  }

  runBtn.addEventListener("click", function () {
    runBtn.disabled = true;
    runBtn.textContent = T.working;
    results.innerHTML = "";
    var chain = Promise.resolve();
    files.forEach(function (file) {
      chain = chain.then(function () {
        return convert(file).then(function (blob) {
          var ext = format.value === "image/png" ? "png" : (format.value === "image/webp" ? "webp" : "jpg");
          var name = file.name.replace(/\.[^.]+$/, "") + "." + ext;
          var li = document.createElement("li");
          li.innerHTML = '<img alt="">' +
            '<div class="meta"><b></b><span class="note"></span></div>' +
            '<button class="dl"></button>';
          li.querySelector("img").src = URL.createObjectURL(blob);
          li.querySelector("b").textContent = name;
          li.querySelector(".note").innerHTML = file.name.split(".").pop().toUpperCase() + " → " +
            ext.toUpperCase() + " · " + TP.human(file.size) + " → " + TP.human(blob.size);
          var btn = li.querySelector("button");
          btn.textContent = T.download;
          btn.onclick = function () { TP.download(blob, name); };
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
