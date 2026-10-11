/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：_shared.js —— 工具页共用的小函数（全站唯一一份，浏览器会缓存）
   为什么单独一个文件：与其把「复制到剪贴板」「提示条」这些函数在每个工具里各抄一遍
                     （那就是屎山的起点），不如放这儿一份，改一处全站生效。
   体积：< 1KB，多一个请求的成本远小于维护成本。
   ============================================================================ */
window.TP = (function () {
  "use strict";

  /** 页面上显示一条临时提示（2.2 秒后自动消失） */
  function toast(text) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  /** 复制文本到剪贴板；返回 Promise（失败时退回旧接口，手机上老浏览器也能用） */
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, bad) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        ok();
      } catch (e) { bad(e); }
    });
  }

  /** 把字节数变成人能读的大小 */
  function human(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(2) + " MB";
  }

  /** 触发一次下载（用 object URL，不联网） */
  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  /** 按 id 取元素（简写，工具脚本里读起来干净些） */
  function $(id) { return document.getElementById(id); }

  /** 输入防抖：输入框连续敲字时不要每次都跑一遍处理逻辑 */
  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 150);
    };
  }

  /* ── 自制确认弹窗（2026-10-12 毛毛：「弹窗，别走系统的太丑了」）────────────────
     为什么不用系统的 confirm()：它是浏览器画的黑框，跟这个站的样式完全两回事 ——
     字体、圆角、按钮、留白全不归我们管，而且会冻住整个页面。
     这里自己画一个：细边框 + 遮罩表达层次（站内规则：阴影只留给 toast 一处，所以弹窗不加阴影），
     按钮沿用站内的两档样式。返回 Promise<boolean>，用法：TP.confirm(msg).then(ok => ...)
     可访问性：Esc = 取消、Enter = 确认、打开时把焦点移到确认按钮、关闭后焦点还给原来的元素。 */
  function confirmBox(message, opts) {
    opts = opts || {};
    var T = window.T || {};
    return new Promise(function (resolve) {
      var mask = document.createElement("div");
      mask.className = "modal-mask";
      mask.setAttribute("role", "dialog");
      mask.setAttribute("aria-modal", "true");
      var box = document.createElement("div");
      box.className = "modal";
      var msg = document.createElement("p");
      msg.className = "modal-msg";
      msg.textContent = message;
      var row = document.createElement("div");
      row.className = "modal-row";
      var cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "ghost";
      cancel.textContent = opts.cancelText || T.cancel || "Cancel";
      var okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.textContent = opts.okText || T.confirmOk || "OK";
      row.appendChild(cancel);
      row.appendChild(okBtn);
      box.appendChild(msg);
      box.appendChild(row);
      mask.appendChild(box);
      document.body.appendChild(mask);

      var lastFocus = document.activeElement;
      requestAnimationFrame(function () { mask.classList.add("show"); okBtn.focus(); });

      function done(val) {
        document.removeEventListener("keydown", onKey, true);
        mask.classList.remove("show");
        setTimeout(function () { mask.remove(); }, 160);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
        resolve(val);
      }
      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); done(false); }
        else if (e.key === "Enter") { e.preventDefault(); done(true); }
        else if (e.key === "Tab") {                       // 焦点锁在弹窗里，别跑到背后的页面
          e.preventDefault();
          (document.activeElement === okBtn ? cancel : okBtn).focus();
        }
      }
      okBtn.addEventListener("click", function () { done(true); });
      cancel.addEventListener("click", function () { done(false); });
      mask.addEventListener("click", function (e) { if (e.target === mask) done(false); });
      document.addEventListener("keydown", onKey, true);
    });
  }

  /* 清空按钮的统一确认（毛毛要的是「弹窗好看」，同时顺手防一手误清）：
     用捕获阶段拦在所有工具自己的监听之前 —— 输入为空就直接放行（空的时候还问一句最烦人），
     非空才问。取消时 stopImmediatePropagation，工具自己的清空逻辑就不会执行。
     这样 35 个工具一处改动全覆盖，不用逐个改。 */
  function guardClear() {
    var btn = document.getElementById("clear");
    var input = document.getElementById("input");
    if (!btn || !input || btn.dataset.guarded) return;
    btn.dataset.guarded = "1";
    btn.addEventListener("click", function (e) {
      if (!input.value) return;                            // 空的，直接清
      e.stopImmediatePropagation();
      e.preventDefault();
      var T = window.T || {};
      confirmBox(T.clearAsk || "Clear what you entered?", {
        okText: T.clearOk || "Clear", cancelText: T.cancel || "Cancel",
      }).then(function (ok) {
        if (!ok) return;
        btn.dataset.guarded = "";                           // 放行这次真正的清空
        input.value = "";
        btn.click();
        btn.dataset.guarded = "1";
      });
    }, true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", guardClear);
  else guardClear();

  return { toast: toast, copy: copy, human: human, download: download, $: $, debounce: debounce,
           confirm: confirmBox };
})();
