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

  return { toast: toast, copy: copy, human: human, download: download, $: $, debounce: debounce };
})();
