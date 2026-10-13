/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：robots-gen.js —— robots.txt 生成器（含 AI 爬虫屏蔽段）
   干什么：左边填要屏蔽的路径（一行一条），可选勾上"屏蔽 AI 爬虫"、填上 sitemap 地址，
          右边直接得到一份可以放到网站根目录的 robots.txt。

   为什么值得做成工具：
     ① 【语法坑】robots.txt 看着简单，但写错一处整份就白写 —— 比如组与组之间必须空行、
        正文行不能缩进、Sitemap 必须是绝对地址（写 /sitemap.xml 是无效的）；
     ② 【AI 爬虫】2023 年之后冒出一堆专门喂训练的爬虫，它们的 token 名字又长又像，
        靠记容易写错（GPTBot / OAI-SearchBot / Google-Extended / CCBot / ClaudeBot /
        PerplexityBot / Bytespider …），写错一个字母等于没屏蔽；
     ③ 屏蔽 AI 爬虫这件事本身有争议 —— 挡住了训练，也可能同时挡住 AI 搜索带来的访客，
        所以本工具把它做成**默认不勾**的可选项，让你自己决定，而不是替你决定。

   ⚠️ token 名会变（各家经常改名、合并、退役）。这里收的是截止 2026-10 广为使用的一批，
      上线前建议对照官方文档核一遍；工具末尾也会提醒你这件事。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");
  var aiEl = $("aibots"), sitemapEl = $("sitemapurl");

  /* AI 爬虫 token 清单。
     注意区分两类：
       · 真正的爬虫（GPTBot / CCBot / Bytespider …）—— 拦住它们，内容就不会被拿去训练；
       · "扩展"令牌（Google-Extended / Applebot-Extended）—— 它们本身不是爬虫名，
         而是用来控制「已有的爬虫能不能拿我的内容去训练」，写法和普通 user-agent 一样。
     两类在这份文件里的写法完全相同，所以这里放一起，但注释里标明，免得你以为写错了。 */
  var AI_BOTS = [
    "GPTBot",             // OpenAI 抓取（训练）
    "ChatGPT-User",       // OpenAI 的实时浏览（用户当场要求它看某个页面）
    "OAI-SearchBot",      // OpenAI 搜索索引
    "Google-Extended",    // 扩展令牌：控制 Gemini / Vertex 能否用你的内容训练
    "CCBot",              // Common Crawl（大量模型的公共语料来源）
    "ClaudeBot",          // Anthropic
    "PerplexityBot",      // Perplexity 搜索
    "Bytespider",         // 字节跳动
    "Amazonbot",          // Amazon
    "Applebot-Extended",  // 扩展令牌：Apple Intelligence 训练
    "Meta-ExternalAgent", // Meta
    "cohere-ai"           // Cohere
  ];

  /** 把文案模板里的 {n} 换成实际数字 */
  function fmt(tpl, n) {
    return String(tpl == null ? "" : tpl).replace("{n}", n);
  }

  /** 解析路径行：trim → 丢掉空行与注释行 → 校验。
   *  robots.txt 的路径行允许通配符（* 与 $），所以这里只挡"明显不是路径"的输入：
   *  带空格（多半是粘错）、或者既不以 / 开头也不含通配符（那是别的什么东西）。 */
  function parsePaths(raw) {
    var lines = String(raw || "").split(/\r?\n/);
    var paths = [], bad = 0;
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      if (!s || s.charAt(0) === "#") continue;               // 空行与注释行直接忽略
      if (/\s/.test(s)) { bad++; continue; }                  // 路径里不该有空格
      if (s.charAt(0) !== "/" && s.indexOf("*") < 0 && s.indexOf("$") < 0) { bad++; continue; }
      if (paths.indexOf(s) < 0) paths.push(s);               // 顺手去重，重复行没有意义
    }
    return { paths: paths, bad: bad };
  }

  function build() {
    var parsed = parsePaths(input.value);
    var paths = parsed.paths;
    var wantAi = aiEl && aiEl.checked;
    var sitemap = sitemapEl ? sitemapEl.value.trim() : "";
    var sitemapBad = false;

    // Sitemap 必须是绝对地址：写 /sitemap.xml 或 example.com/sitemap.xml 都是无效的
    if (sitemap && !/^https?:\/\//i.test(sitemap)) { sitemapBad = true; sitemap = ""; }

    var out = [];
    out.push("User-agent: *");
    out.push("Allow: /");
    for (var i = 0; i < paths.length; i++) out.push("Disallow: " + paths[i]);

    /* ⚠️ 组与组之间必须空行。
       少了这个空行，后面的 User-agent 会被并进上一组，屏蔽规则就挂到了错误的爬虫头上 ——
       这不是"格式偏好"，是 robots.txt 的语法要求。 */
    if (wantAi) {
      for (var j = 0; j < AI_BOTS.length; j++) {
        out.push("");
        out.push("User-agent: " + AI_BOTS[j]);
        out.push("Disallow: /");
      }
    }

    if (sitemap) {
      out.push("");
      out.push("Sitemap: " + sitemap);
    }
    out.push("");
    output.value = out.join("\n");

    var msg = fmt(T.statOk, paths.length);
    if (parsed.bad) msg += " · " + fmt(T.statBad, parsed.bad);
    if (wantAi) msg += " · " + fmt(T.statAi, AI_BOTS.length);
    if (sitemapBad) msg += " · " + T.statSitemapBad;
    status.textContent = msg;
  }

  /* ── 事件绑定 ── */
  input.addEventListener("input", TP.debounce(build, 120));
  if (aiEl) aiEl.addEventListener("change", build);
  if (sitemapEl) {
    sitemapEl.addEventListener("input", TP.debounce(build, 200));
    sitemapEl.addEventListener("change", build);
  }

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
