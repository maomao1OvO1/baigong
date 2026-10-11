/* ============================================================================
   文件：app.js —— 全站小而公共的三件事（小鲸 · 2026-10-12）
   干什么：① 手机端提示条（推荐用桌面 Chrome，可关闭并记住选择）
           ② 把站点注册成 PWA（装成桌面应用 / 离线可用）
           ③ 「装成桌面应用」按钮：接住浏览器的 beforeinstallprompt 事件
   为什么合在一个文件：三件事都只有几十行，各开一个请求反而更慢；这个文件全站共用、浏览器缓存一次。
   注意：这里**不碰任何用户数据** —— 只用 localStorage 记住"提示条已关闭"这一件事。
   ============================================================================ */
(function () {
  "use strict";

  /* ── ① 手机提示条 ────────────────────────────────────────────────────
     为什么只提示、不拦：工具在手机上确实能用（都是纯前端），只是大图压缩这类活会慢。
     拦人就成流氓了；给一句实话 + 一个「知道了」，关掉之后不再出现。 */
  var tip = document.getElementById("mobileTip");
  if (tip) {
    var KEY = "tp_mobile_tip_closed";
    var closed = false;
    try { closed = localStorage.getItem(KEY) === "1"; } catch (e) { /* 隐私模式下取不到，就当没关过 */ }
    if (closed) {
      tip.hidden = true;
    } else if (window.matchMedia && window.matchMedia("(max-width: 720px)").matches) {
      tip.hidden = false;                       // 只在小屏（手机）上冒出来
    }
    var btn = document.getElementById("tipClose");
    if (btn) btn.addEventListener("click", function () {
      tip.hidden = true;
      try { localStorage.setItem(KEY, "1"); } catch (e) { /* 存不了就算了，下次再提示一次 */ }
    });
  }

  /* ── ② 注册 service worker（PWA）─────────────────────────────────────
     装成桌面应用后要能离线用，靠的就是它。注册失败不能影响正常浏览，所以整段都吞异常。 */
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () { /* 静默失败：站点照常可用 */ });
    });
  }

  /* ── ③ 「装成桌面应用」按钮 ──────────────────────────────────────────
     beforeinstallprompt 只在「可以安装」时由 Chrome/Edge 触发：
     桌面端打开、且还没装过。所以按钮默认是隐藏的 —— 能装才出现，不能装就别给假承诺。 */
  var installBtn = document.getElementById("installApp");
  var installNote = document.getElementById("installNote");
  var deferred = null;
  function showButton() {
    if (installBtn) { installBtn.hidden = false; }
    if (installNote) { installNote.hidden = true; }      // 能一键装，就不用再教手动步骤了
  }
  if (installBtn) {
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();                                  // 先拦住 Chrome 自带的小气泡，换成我们自己的按钮
      deferred = e;
      showButton();
    });
    installBtn.addEventListener("click", function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function (choice) {
        if (choice && choice.outcome === "accepted" && window.TP && window.TP.toast) {
          window.TP.toast((window.T && window.T.installed) || "Installed");
        }
        deferred = null;
        installBtn.hidden = true;
      });
    });
    // 已经装过了（独立窗口里运行）也把按钮收起来，避免给用户一个没用的按钮
    if (window.matchMedia("(display-mode: standalone)").matches) installBtn.hidden = true;
  }

  /* ── ④ 页脚反馈入口 ──────────────────────────────────────────────────
     报 bug、想要新工具都可以从这儿写信。做成 mailto 而不是表单：静态站没有后端，
     表单要么收不到、要么得引第三方服务（那就违背全站「零外部请求」这条了）。
     邮箱拆成 data-u / data-d，点了才拼 —— 明文写在 href 里会被垃圾邮件爬虫秒收。 */
  /* 用事件委托而不是逐个绑定：搜索结果里的反馈按钮是**动态插入**的，
     普通 addEventListener 绑不到它（这个坑在"搜不到时给反馈入口"这个需求上必然会踩）。 */
  document.addEventListener("click", function (e) {
    var el = e.target;
    while (el && el !== document && !(el.className && String(el.className).indexOf("fb-btn") >= 0)) el = el.parentNode;
    if (!el || el === document) return;
    var u = el.getAttribute("data-u"), dom = el.getAttribute("data-d");
    if (!u || !dom) return;
    e.preventDefault();
    var subject = encodeURIComponent((window.T && window.T.feedbackSubject) || "ToolPocket");
    location.href = "mailto:" + u + "@" + dom + "?subject=" + subject;
  });
})();
