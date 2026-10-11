/* ============================================================================
   文件：search.js —— 站内工具搜索（纯前端，零请求）
   为什么不用现成的搜索服务：① 全站只有十几到几十个工具，一次内存过滤足够；
     ② 引第三方（Algolia 之类）会带来外部请求、拖慢首屏、还违背「零外部请求」这个信任点；
     ③ 索引直接内嵌在首页 HTML 里（window.TP_INDEX），搜索时一个网络请求都不发。
   匹配策略：把查询按空格拆词，**所有词都命中**才算中（AND），命中位置优先：
     工具名 > 关键词 > 描述。附带简单的高亮。
   作者：小鲸 · 2026-10-11
   ============================================================================ */
(function () {
  "use strict";
  /* ⚠️ 这里曾经先去找一个外层容器（id 为 search），找不到就 return ——
     那是早期版本的写法，后来首页改版把那个容器去掉了，于是脚本一加载就退出：
     **输入任何东西都没有反应**（毛毛 2026-10-12 报的「我输入任何东西都没反应」就是它）。
     教训：脚本依赖的 DOM 必须在「生成出来的真实页面」里核对，不能只在测试沙箱里造一个同名元素
     —— check.mjs 现在也加了这项契约检查（搜索所需的 id 必须在首页里真实存在）。
     注意：本文件里不要写被检查正则匹配的代码原文（包括注释里），否则契约检查会误报。 */
  var input = document.getElementById("searchInput");
  var out = document.getElementById("searchResults");
  if (!input || !out) return;      // 搜索框只存在于首页；工具页与招租页已按需求去掉，安静退出即可
  var index = null;          // 懒加载：用户真的开始搜了才去取索引
  var T = window.T || {};
  var lang = document.documentElement.lang || "en";

  function field(item, key) {
    var v = item[key];
    if (!v) return "";
    return typeof v === "string" ? v : (v[lang] || v.en || "");
  }

  /** 打分：名字命中权重最高，其次关键词，最后描述；全词命中才入围 */
  function score(item, words) {
    var name = field(item, "name").toLowerCase();
    var keys = (item.keys || []).join(" ").toLowerCase();
    var desc = field(item, "desc").toLowerCase();
    var total = 0;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (name.indexOf(w) >= 0) total += 10;
      else if (keys.indexOf(w) >= 0) total += 5;
      else if (desc.indexOf(w) >= 0) total += 2;
      else return -1;                       // 有一个词没命中 ⇒ 整个不匹配
    }
    return total;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function render(items, query) {
    if (!query) { out.innerHTML = ""; out.hidden = true; return; }
    out.hidden = false;
    if (!items.length) {
      out.innerHTML = '<li class="empty">' + escapeHtml(T.noResults || "No tool matches that") + "</li>";
      return;
    }
    out.innerHTML = items.slice(0, 8).map(function (it) {
      return '<li><a href="' + it.url + '">' +
        '<span class="s-ico">' + (it.icon || "•") + "</span>" +
        '<span class="s-meta"><b>' + escapeHtml(field(it, "name")) + "</b>" +
        '<span>' + escapeHtml(field(it, "desc")).slice(0, 78) + "</span></span>" +
        "</a></li>";
    }).join("");
  }

  /** 首次输入时才加载索引 —— 首页因此不用背这 6KB，体积与速度都不受影响 */
  function loadIndex() {
    if (index !== null) return Promise.resolve(index);
    /* ⚠️ 索引路径必须由页面注入绝对路径（首页写的是 /assets/search.json）。
       原来这里写死相对路径 "assets/search.json"：在 /index.html 下没问题，
       但在 /zh/index.html 与 /ja/index.html 下会被解析成 /zh/assets/search.json ⇒ 404，
       于是中英日三个首页里只有英文那一个搜得出来 —— 毛毛 2026-10-12 报的「搜索框用不了」就是它。 */
    var url = window.TP_INDEX_URL || "assets/search.json";
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (j) { index = j; return index; })
      .catch(function () { index = []; return index; });   // 失败就安静地当空索引，不炸页面
  }

  function run() {
    var q = input.value.trim().toLowerCase();
    if (!q) { render([], ""); return; }
    if (index === null) {
      return loadIndex().then(function () { if (input.value.trim().toLowerCase() === q) run(); });
    }
    var words = q.split(/\s+/).filter(Boolean);
    var hits = index.map(function (it) { return { it: it, s: score(it, words) }; })
      .filter(function (x) { return x.s >= 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .map(function (x) { return x.it; });
    render(hits, q);
  }

  input.addEventListener("input", run);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { input.value = ""; run(); }
    // 回车 ⇒ 打开第一个结果（搜索框最常见的期待行为）
    if (e.key === "Enter") {
      var first = out.querySelector("a");
      if (first) { e.preventDefault(); location.href = first.getAttribute("href"); }
    }
  });

  // 从别的页面带 #search 过来时，自动聚焦
  if (location.hash === "#search") { input.focus(); }
})();
