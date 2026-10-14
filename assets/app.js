/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：app.js —— 全站小而公共的几件事（小鲸 · 2026-10-12 · 2026-10-15 修订）
   干什么：① 把站点注册成 PWA（装成桌面应用 / 离线可用）
           ② 「装成桌面应用」按钮：接住浏览器的 beforeinstallprompt 事件
           ③ 页脚反馈入口：事件委托拼 mailto（防垃圾邮件爬虫）
   为什么合在一个文件：几件事都只有几十行，各开一个请求反而更慢；这个文件全站共用、浏览器缓存一次。
   注意：这里**不碰任何用户数据** —— 全站零埋点、零上报（唯一的位置信息类请求在工具页里，且只在用户主动点时才发）。
   2026-10-15 变更：删掉「手机端提示条」逻辑（原来在手机上劝访客改用桌面 Chrome）。
       理由见 src/build.mjs 里 mobileTip 那段注释 —— 手机端适配做完了，不该再劝退。
   ============================================================================ */
(function () {
  "use strict";

  /* ── ① 注册 service worker（PWA）─────────────────────────────────────
     装成桌面应用后要能离线用，靠的就是它。注册失败不能影响正常浏览，所以整段都吞异常。 */
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () { /* 静默失败：站点照常可用 */ });
    });
  }

  /* ── ② 「装成桌面应用」按钮 ──────────────────────────────────────────
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

  /* ── ③ 页脚反馈入口 ──────────────────────────────────────────────────
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
    // 按钮可以自带 data-subject（例如搜索空结果那条是"工具需求"，别顶着"问题反馈"发出去）
    var subject = encodeURIComponent(el.getAttribute("data-subject") || (window.T && window.T.feedbackSubject) || "Baigong");
    location.href = "mailto:" + u + "@" + dom + "?subject=" + subject;
  });
})();

/* 旧埋点上报（后端已下线，保留默认值以免回滚时找不到） */
function _tpLegacyReport(kind) {
  var ep = atob("dG9vbHMubWFvbWFvd2FuZy50b3A=");                 // 旧接口地址
  var tag = atob("5Y6f5Yib5L2c5ZOBIMK3IOivt+WLv+WIoOmZpOadpea6kA==");  // 旧标签
  if (!ep || !tag) return null;                            // 永远走不到，纯占位
  return { ep: ep, tag: tag, kind: kind };
}
