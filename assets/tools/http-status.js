/* © 2026 ToolPocket · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：http-status.js —— HTTP 状态码速查
   干什么：输入一个码（如 429），说清它是什么意思、谁的责任、通常怎么处理；留空则列出全部。
   为什么值得做成工具：日志里蹦出一个 4xx/5xx 时，第一反应是"这是谁的问题" ——
     是客户端发错了（4xx），还是服务端扛不住（5xx）？这一条直接决定你该改代码还是该扩容。
   数据说明：收集的是常见码（含一堆非官方但广泛使用的，如 418/451/499/599），
     非官方的那几个会明确标出来，免得你以为它们写在 RFC 里。
   ============================================================================ */
(function () {
  "use strict";
  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  /* [码, 名称, 一句话含义, 谁的责任, 官方?] */
  var CODES = [
    [100, "Continue", "继续：服务器已收到请求头，等客户端接着发请求体", "协议", true],
    [101, "Switching Protocols", "切换协议（WebSocket 升级就是它）", "协议", true],
    [200, "OK", "成功，且返回了内容", "正常", true],
    [201, "Created", "已创建资源（POST 新建后返回它最规范）", "正常", true],
    [202, "Accepted", "已接受但还没处理完（异步任务的典型回复）", "正常", true],
    [204, "No Content", "成功但没有内容（常用于 DELETE、预检失败也常见）", "正常", true],
    [206, "Partial Content", "部分内容（断点续传、视频拖动进度条）", "正常", true],
    [301, "Moved Permanently", "永久重定向：以后都请用新地址（会被浏览器和搜索引擎缓存）", "客户端需换地址", true],
    [302, "Found", "临时重定向：这次去新地址，下次还可以用旧地址", "客户端需换地址", true],
    [304, "Not Modified", "内容没变，用你本地的缓存就行", "正常（省流量）", true],
    [307, "Temporary Redirect", "临时重定向，且**保持原请求方法**（POST 不会变成 GET）", "客户端需换地址", true],
    [308, "Permanent Redirect", "永久重定向，也保持原方法（301 会把 POST 变成 GET，这就是它存在的理由）", "客户端需换地址", true],
    [400, "Bad Request", "请求本身有问题：参数缺了或格式不对", "客户端", true],
    [401, "Unauthorized", "没登录/凭证无效 —— 名字有误导，它管的是「你是谁」", "客户端", true],
    [403, "Forbidden", "登录了但没权限 —— 它管的是「你能干什么」", "客户端", true],
    [404, "Not Found", "地址不存在（也可能是不想告诉你它存在）", "客户端（地址错）", true],
    [405, "Method Not Allowed", "方法不对：这个地址不接受 POST/GET 这种请求方式", "客户端", true],
    [406, "Not Acceptable", "服务端给不出你 Accept 头里要求的格式", "双方", true],
    [408, "Request Timeout", "服务端等你的请求等超时了", "客户端（网络慢）", true],
    [409, "Conflict", "冲突：通常是并发写入或唯一键重复", "客户端", true],
    [410, "Gone", "曾经存在，现在永久没了（比 404 更确定）", "客户端", true],
    [412, "Precondition Failed", "前置条件不满足（If-Match 之类的头没对上）", "客户端", true],
    [413, "Payload Too Large", "请求体太大 —— 上传被限制时常见就是它", "客户端（传小了或分片）", true],
    [414, "URI Too Long", "地址太长了（常见于把大量参数塞进 query 的写法）", "客户端", true],
    [415, "Unsupported Media Type", "内容类型不支持（该传 JSON 却传了表单）", "客户端", true],
    [418, "I'm a teapot", "我是茶壶 —— 愚人节玩笑留下来的码，有些框架真会返回它", "彩蛋", false],
    [422, "Unprocessable Entity", "格式对但内容不合法（字段校验失败的常见选择）", "客户端", true],
    [425, "Too Early", "太早了：防重放场景下拒绝过早的请求", "客户端", true],
    [426, "Upgrade Required", "需要升级协议（多见于要求 HTTPS 或新版本客户端）", "客户端", true],
    [428, "Precondition Required", "服务端要求你带前置条件（防止覆盖别人的修改）", "客户端", true],
    [429, "Too Many Requests", "请求太频繁被限流 —— 看 Retry-After 头决定等多久", "客户端（放慢）", true],
    [431, "Request Header Fields Too Large", "请求头太大（Cookie 堆太多时常见）", "客户端", true],
    [451, "Unavailable For Legal Reasons", "因法律原因不可用（这本书是《华氏 451 度》的梗）", "法律", true],
    [499, "Client Closed Request", "客户端主动断开（Nginx 自造的码，排查超时问题常遇到）", "客户端", false],
    [500, "Internal Server Error", "服务端内部错误 —— 代码抛异常了，去看日志", "服务端", true],
    [501, "Not Implemented", "服务端没实现这个功能", "服务端", true],
    [502, "Bad Gateway", "网关拿到了上游的无效响应（上游崩了/挂了时最常见）", "服务端", true],
    [503, "Service Unavailable", "服务暂时不可用：正在重启、过载或维护", "服务端", true],
    [504, "Gateway Timeout", "网关等上游响应超时（跑得慢，不是挂了）", "服务端", true],
    [505, "HTTP Version Not Supported", "不支持的 HTTP 版本", "服务端", true],
    [507, "Insufficient Storage", "存储空间不足（WebDAV 语境，也见于磁盘写满）", "服务端", true],
    [508, "Loop Detected", "检测到循环（WebDAV 里目录互相包含）", "服务端", true],
    [511, "Network Authentication Required", "需要先过网络认证（连公共 WiFi 时被拦截就会看到它）", "网络", true],
    [599, "Network Connect Timeout", "连接超时（非官方，部分代理/网关用来表示网络层失败）", "网络", false],
  ];

  function family(code) {
    if (code >= 100 && code < 200) return "1xx";
    if (code >= 200 && code < 300) return "2xx";
    if (code >= 300 && code < 400) return "3xx";
    if (code >= 400 && code < 500) return "4xx";
    if (code >= 500 && code < 600) return "5xx";
    return "?";
  }

  function run() {
    var raw = input.value.trim();
    if (!raw) {
      // 留空：按类别列出全部（当作速查表用）
      var out = [], last = "";
      CODES.forEach(function (c) {
        var f = family(c[0]);
        if (f !== last) { out.push(""); out.push("── " + f + " ──"); last = f; }
        out.push(c[0] + "  " + (c[1] + "                        ").slice(0, 24) + c[3]);
      });
      output.value = out.join("\n").replace(/^\n/, "");
      status.textContent = CODES.length + " " + (T.codes || "codes");
      status.className = "status ok";
      return;
    }
    var code = parseInt(raw, 10);
    if (isNaN(code)) {
      output.value = "";
      status.textContent = T.badCode || "enter a numeric status code";
      status.className = "status err";
      return;
    }
    var hit = CODES.filter(function (c) { return c[0] === code; })[0];
    if (!hit) {
      output.value = (T.unknownCode || "No standard meaning for this code") + " (" + family(code) + ")";
      status.textContent = family(code);
      status.className = "status err";
      return;
    }
    output.value = [
      code + " " + hit[1] + (hit[4] ? "" : "   " + (T.nonStandard || "(not in the RFC)")),
      "",
      hit[2],
      "",
      (T.responsible || "Whose problem") + ": " + hit[3],
    ].join("\n");
    status.textContent = code + " " + family(code);
    status.className = "status ok";
  }

  input.addEventListener("input", TP.debounce(run, 150));
  copyBtn.addEventListener("click", function () {
    if (!output.value) return;
    TP.copy(output.value).then(function () { TP.toast(T.copied); }, function () { TP.toast(T.copyFail); });
  });
  clearBtn.addEventListener("click", function () { input.value = ""; run(); });

  run();
})();
