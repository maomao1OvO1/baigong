/* © 2026 Baigong · tools.maomaowang.top · 保留所有权利（All rights reserved）
   本文件为原创代码，未经许可不得复制、镜像或二次发布；删除本声明不改变侵权性质。 */
/* ============================================================================
   文件：morse.js —— 摩斯电码（Morse code）编码 / 解码
   干什么：文本 → 摩斯电码，或者反过来（贴一段 `.` `-` `/` 上去，自动认出是解码）。

   为什么值得做成工具：
     ① 它的规则简单到「看一眼就会」，但唯独**词间距**是新手最容易漏的：
        字母之间用空格、单词之间用 **`/`**；漏了 `/` 之后整句连成一个长单词，
        解出来是一串字母，看着像对的其实是错的；
     ② 摩斯电码**只覆盖拉丁字母、数字和少量标点** —— 中文、日文、emoji 都没有对应码，
        很多人第一次用会以为工具坏了。这里会明确告诉你哪些字符被跳过了；
     ③ 解码方向没有唯一写法：`/`、`|`、连续三个空格都有人用，两种都要认。

   一个常被提到的现实（页面上也写）：**摩斯电码不是加密**。
     它只是一种编码 —— 任何知道表的人都能立刻读出来，所以别拿它当"藏密码"的手段。
   ============================================================================ */
(function () {
  "use strict";

  var $ = TP.$;
  var T = window.T || {};
  var input = $("input"), output = $("output"), status = $("status");
  var copyBtn = $("copy"), clearBtn = $("clear");

  /* 标准表（ITU-R M.1677-1）。数字与字母是硬标准，标点各家略有出入，这里用最常见的写法。 */
  var TABLE = {
    A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....",
    I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.",
    Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
    Y: "-.--", Z: "--..",
    "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
    "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
    ".": ".-.-.-", ",": "--..--", "?": "..--..", "'": ".----.", "!": "-.-.--",
    "/": "-..-.", "(": "-.--.", ")": "-.--.-", "&": ".-...", ":": "---...",
    ";": "-.-.-.", "=": "-...-", "+": ".-.-.", "-": "-....-", "_": "..--.-",
    "\"": ".-..-.", "$": "...-..-", "@": ".--.-."
  };

  /* 反向表：解码时按码查字母。同码多字母的情况在标准表里不存在，可以直接反查。 */
  var REVERSE = {};
  Object.keys(TABLE).forEach(function (ch) { REVERSE[TABLE[ch]] = ch; });

  function fmt(tpl, vars) {
    return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  }

  /** 这段输入像不像摩斯电码：只由 . - / | 和空白组成，且至少有一个信号字符 */
  function looksLikeMorse(s) {
    return /^[.\-\/|\s]+$/.test(s) && /[.\-]/.test(s);
  }

  /** 编码：字母之间一个空格，单词之间 ` / `；不支持的字符收集起来如实报告 */
  function encode(text) {
    var unknown = [];
    var words = String(text).toUpperCase().split(/\s+/).filter(Boolean);

    var out = words.map(function (word) {
      return word.split("").map(function (ch) {
        if (TABLE[ch]) return TABLE[ch];
        if (unknown.indexOf(ch) < 0) unknown.push(ch);
        return null;   // 不支持的字符：不占位，也不瞎编一个码
      }).filter(Boolean).join(" ");
    }).filter(Boolean);

    return { text: out.join(" / "), unknown: unknown };
  }

  /** 解码：`/`、`|` 与「连续 3 个以上空格」都当单词分隔符（三种写法现实中都有人用） */
  function decode(code) {
    var words = String(code).trim()
      .replace(/\s*[\/|]\s*/g, " / ")
      .replace(/\s{3,}/g, " / ")
      .split(" / ");

    var unknown = [];
    var out = words.map(function (word) {
      return word.trim().split(/\s+/).filter(Boolean).map(function (sym) {
        if (REVERSE[sym]) return REVERSE[sym];
        if (unknown.indexOf(sym) < 0) unknown.push(sym);
        return "?";
      }).join("");
    }).filter(Boolean);

    return { text: out.join(" "), unknown: unknown };
  }

  function build() {
    var raw = input.value;

    if (!raw.trim()) {
      output.value = "";
      status.className = "status";
      status.textContent = T.statEmpty || "";
      return;
    }

    var isMorse = looksLikeMorse(raw.trim());
    var r = isMorse ? decode(raw) : encode(raw);

    output.value = r.text;

    var msg = isMorse
      ? fmt(T.statDecoded, { n: r.text.length })
      : fmt(T.statEncoded, { n: r.text.length });

    if (r.unknown.length) msg += " · " + fmt(T.statUnknown, { s: r.unknown.slice(0, 12).join(" ") });

    status.className = r.unknown.length ? "status err" : "status";
    status.textContent = msg;
  }

  input.addEventListener("input", TP.debounce(build, 150));

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
