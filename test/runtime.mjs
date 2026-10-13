/* ============================================================================
   文件：test/runtime.mjs —— 在 node 里"真跑一遍"工具脚本（小鲸 · 2026-10-11）
   为什么需要它：check.mjs 只能验证「id 齐不齐、文案全不全」，但脚本**运行时**会不会炸、
   算出来的对不对，只有真的执行才知道。毛毛的原话是「你确定你写的这些功能都能用吗？」
   —— 所以这里搭一个最小可用的浏览器环境（document/element/事件/剪贴板），
   把 assets/tools/*.js 原样加载进来，模拟用户输入、点按钮，然后断言输出。
   覆盖范围：5 个文本类工具（base64 / json-format / color-converter / text-tools / unit-converter）。
             图片类工具依赖 Canvas 与 Image 解码，node 里没有，故不在本文件覆盖（靠人工点一次）。
   跑法：cd toolbox && node test/runtime.mjs
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  ✅ " + n); };
const bad = (n, d) => { fail++; console.log("  ❌ " + n + (d ? "\n       → " + d : "")); };

/** 极简元素：带事件系统（能真的触发 input/change/click）
    注意 classList 要真的改 className —— 否则断言 className 永远拿不到值（第一版就踩了这个）。 */
function makeEl(id) {
  const listeners = {};
  const el = {
    id, value: "", textContent: "", innerHTML: "", className: "", disabled: false,
    style: {}, dataset: {}, checked: false, hidden: false,
    classList: {
      add(c) { el.className = (el.className ? el.className + " " : "") + c; },
      remove(c) { el.className = el.className.split(" ").filter((x) => x && x !== c).join(" "); },
      toggle(c, on) { (on === undefined ? !el.className.includes(c) : on) ? this.add(c) : this.remove(c); },
      contains(c) { return el.className.split(" ").includes(c); },
    },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    fire(type, ev) { (listeners[type] || []).forEach((fn) => fn(ev || { preventDefault() {} })); },
    click() { el.fire("click"); },
    appendChild() {}, removeChild() {}, focus() {}, select() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
  };
  return el;
}

/** 用一组 id 造一个假页面 + 假 window，然后加载 _shared.js 与指定工具脚本
    defaults：模拟浏览器给 <select> 自动选中的第一项（真浏览器就是这样，不设会拿到空串）。 */
function loadTool(scriptFile, ids, strings, defaults = {}, extra = {}) {
  const els = {};
  for (const id of ids) els[id] = makeEl(id);
  for (const [id, v] of Object.entries(defaults)) if (els[id]) els[id].value = v;
  const toasts = [];

  const doc = {
    getElementById: (id) => els[id] || null,
    createElement: () => makeEl("tmp"),
    body: { appendChild() {}, removeChild() {} },
    title: "",
  };

  const sandbox = {
    console,
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {},
    Promise, TextEncoder, TextDecoder, Uint8Array, Uint32Array, Int32Array, ArrayBuffer, DataView, BigInt,
    URL, URLSearchParams,
    Math, JSON, String, Number, parseFloat, parseInt, isFinite, Object, Array, Date, RegExp, Error, Set, Map,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    ...extra,
    document: doc,
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    isSecureContext: true,
    crypto: globalThis.crypto,
  };
  sandbox.window = sandbox;
  sandbox.window.T = strings;
  sandbox.window.isSecureContext = true;
  sandbox.TP = undefined;

  const ctx = vm.createContext(sandbox);
  // 共享函数（先加载，脚本依赖 TP.*）
  vm.runInContext(fs.readFileSync(path.join(ROOT, "assets/tools/_shared.js"), "utf8"), ctx, { filename: "_shared.js" });
  // 把 toast 的实际调用记下来，便于断言
  const origToast = sandbox.window.TP.toast;
  sandbox.window.TP.toast = (t) => { toasts.push(t); return origToast(t); };
  // 工具脚本本体
  vm.runInContext(fs.readFileSync(path.join(ROOT, "assets/tools", scriptFile), "utf8"), ctx, { filename: scriptFile });

  return { els, toasts, sandbox };
}

const readI18n = (name, lang) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/tools", name + ".json"), "utf8"))[lang].ui;
const readUi = (lang) => {
  const all = JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/ui.json"), "utf8"));
  return Object.fromEntries(Object.entries(all)
    .filter(([, v]) => v && typeof v === "object").map(([k, v]) => [k, v[lang]]));
};

console.log("\n① Base64（中/日/emoji 三类都要往返正确）");
{
  const ui = Object.assign(readUi("en"), readI18n("base64", "en"));
  const { els } = loadTool("base64.js", ["mode", "input", "output", "copy", "swap", "clear", "toast"], ui, { mode: "encode" });
  const cases = ["hello", "中文测试", "日本語のテスト", "emoji 🐋"];
  for (const text of cases) {
    els.input.value = text; els.mode.value = "encode"; els.input.fire("input");
    const enc = els.output.value;
    els.input.value = enc; els.mode.value = "decode"; els.input.fire("input");   // 把编码结果放回去再解
    const dec = els.output.value;
    if (dec === text && enc.length > 0) ok(`往返正确：${text}`);
    else bad(`往返失败：${text} → ${enc} → ${dec}`);
  }
  // 互换按钮
  els.input.value = "swap me";
  els.mode.value = "encode";
  els.input.fire("input");
  const encoded = els.output.value;
  els.swap.click();   // 互换：输入框应变成刚才的结果，方向翻成 decode
  if (els.mode.value === "decode" && els.input.value === encoded) ok("「互换」按钮可用（方向与内容一起换）");
  else bad("「互换」按钮没反应", "mode=" + els.mode.value + " input=" + els.input.value);
}

console.log("\n② JSON 格式化（合法/非法都要有正确反馈）");
{
  const ui = Object.assign(readUi("en"), readI18n("json-format", "en"));
  const { els } = loadTool("json-format.js", ["mode", "input", "output", "status", "copy", "clear", "toast"], ui, { mode: "pretty" });
  els.input.value = '{"a":1,"b":[1,2]}';
  els.mode.value = "pretty";
  els.input.fire("input");
  if (els.output.value.includes("\n") && els.status.classList.contains("ok")) ok("合法 JSON → 美化输出 + 绿色状态");
  else bad("合法 JSON 处理异常", els.output.value.slice(0, 60) + " | status=" + els.status.className);
  els.mode.value = "minify";
  els.mode.fire("change");
  if (els.output.value === '{"a":1,"b":[1,2]}') ok("压成一行正确");
  else bad("压缩输出不对：" + els.output.value);
  els.input.value = '{"a":1,}';
  els.input.fire("input");
  if (els.output.value === "" && els.status.classList.contains("bad")) ok("非法 JSON → 清空输出 + 红色报错");
  else bad("非法 JSON 没有正确报错", els.status.textContent);
}

console.log("\n③ 颜色转换（hex / rgb / hsl 三种输入都要认）");
{
  const ui = Object.assign(readUi("en"), readI18n("color-converter", "en"));
  const { els } = loadTool("color-converter.js", ["picker", "input", "output", "swatch", "copy", "clear", "toast"], ui);
  const cases = [
    ["#2f6df6", "rgb(47, 109, 246)"],
    ["rgb(255, 0, 0)", "rgb(255, 0, 0)"],
    ["hsl(120, 100%, 50%)", "rgb(0, 255, 0)"],
  ];
  for (const [input, expectRgb] of cases) {
    els.input.value = input;
    els.input.fire("input");
    if (els.output.value.includes(expectRgb) && els.output.value.includes("HEX")) ok(`${input} → ${expectRgb}`);
    else bad(`${input} 转换不对`, els.output.value.replace(/\n/g, " | "));
  }
  els.input.value = "not-a-color";
  els.input.fire("input");
  if (els.output.value === "") ok("乱输入 → 清空输出（不显示垃圾结果）");
  else bad("乱输入没有清空：" + els.output.value);
}

console.log("\n④ 文本工具（去重 / 排序 / 计数 / 大小写）");
{
  const ui = Object.assign(readUi("en"), readI18n("text-tools", "en"));
  const { els } = loadTool("text-tools.js", ["action", "input", "output", "status", "copy", "clear", "toast"], ui, { action: "upper" });
  const run = (action, text) => { els.action.value = action; els.input.value = text; els.input.fire("input"); return els.output.value; };
  if (run("upper", "abc") === "ABC") ok("转大写"); else bad("转大写");
  if (run("lower", "ABC") === "abc") ok("转小写"); else bad("转小写");
  if (run("reverse", "abc") === "cba") ok("反序"); else bad("反序");
  if (run("dedup", "b\na\nb\nc") === "b\na\nc") ok("去重：b/a/b/c → b/a/c"); else bad("去重", run("dedup", "b\na\nb\nc"));
  if (run("sort", "c\na\nb") === "a\nb\nc") ok("排序：c/a/b → a/b/c"); else bad("排序");
  if (run("trim", "  a  \n  b  ") === "a\nb") ok("去首尾空格"); else bad("去首尾空格");
  const counted = run("count", "hello world\nsecond line");
  if (/Words: 4/.test(counted) && /Lines: 2/.test(counted) && /Characters: 23/.test(counted)) ok("计数：4 词 / 2 行 / 23 字符");
  else bad("计数结果不对", counted.replace(/\n/g, " | "));
}

console.log("\n⑤ 单位换算（四类都要出数，不能有 NaN / —）");
{
  const ui = Object.assign(readUi("en"), readI18n("unit-converter", "en"));
  const { els } = loadTool("unit-converter.js", ["category", "value", "output", "unitLabel", "copy", "clear", "toast"], ui, { category: "length" });
  const run = (cat, v) => { els.category.value = cat; els.category.fire("change"); els.value.value = String(v); els.value.fire("input"); return els.output.value; };

  // 解析成 { 单位: 数值 } 再按数值比较 —— 不要拿字符串硬匹配（显示精度是 8 位有效数字，
  // 写成 /39\.3700787/ 这种长小数会误报失败，第一版就误报过）
  const parseOut = (text) => Object.fromEntries(text.split("\n").filter(Boolean).map((l) => {
    const [unit, num] = l.trim().split(/\s+/);
    return [unit, Number(num)];
  }));
  const near2 = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

  const len = parseOut(run("length", 1));
  if (near2(len.cm, 100) && near2(len.in, 39.3700787) && near2(len.km, 0.001)) ok("长度：1 m = 100 cm = 39.3700787 in = 0.001 km");
  else bad("长度换算", JSON.stringify(len));

  const wt = parseOut(run("weight", 100));
  if (near2(wt.lb, 220.46226218) && near2(wt.t, 0.1) && near2(wt.oz, 3527.3961949)) ok("重量：100 kg = 220.46226218 lb = 0.1 t");
  else bad("重量换算（这就是之前 NaN 的那一类）", JSON.stringify(wt));

  const dt = parseOut(run("data", 1));
  if (near2(dt.KB, 1000) && near2(dt.GB, 0.001) && near2(dt.B, 1000000)) ok("数据：1 MB = 1000 KB = 1000000 B");
  else bad("数据换算（之前也是 NaN）", JSON.stringify(dt));

  const tp = parseOut(run("temp", 100));
  if (near2(tp.F, 212) && near2(tp.K, 373.15)) ok("温度：100°C = 212°F = 373.15 K");
  else bad("温度换算（刚修：温度不在换算表里，必须先单独处理）", JSON.stringify(tp));

  // 任何一类都不允许出现 NaN 或 —
  let nan = null;
  for (const cat of ["length", "weight", "data", "temp"]) {
    const out = run(cat, 42);
    if (/NaN|—/.test(out) || out.trim() === "") nan = cat + " → " + out.replace(/\n/g, " | ");
  }
  if (!nan) ok("四类都不含 NaN / 空输出"); else bad("有类别算不出来", nan);

  // 输入单位徽标要跟着类别变
  run("weight", 1);
  if (els.unitLabel.textContent === "kg") ok("输入单位提示会随类别切换（kg）"); else bad("单位提示不对：", els.unitLabel.textContent);
}


console.log("\n⑥ URL 编解码（两种范围的区别必须正确）");
{
  const ui = Object.assign(readUi("en"), readI18n("url-codec", "en"));
  const { els } = loadTool("url-codec.js", ["mode", "scope", "input", "output", "status", "copy", "swap", "clear", "toast"], ui, { mode: "encode", scope: "component" });
  // 单个值：斜杠也要被编码
  els.input.value = "a/b c"; els.input.fire("input");
  if (els.output.value === "a%2Fb%20c") ok("单个值：a/b c → a%2Fb%20c（斜杠被编码）");
  else bad("单个值编码不对", els.output.value);
  // 整条网址：结构字符保留
  els.scope.value = "whole"; els.scope.fire("change");
  if (els.output.value === "a/b%20c") ok("整条网址：a/b c → a/b%20c（斜杠保留）");
  else bad("整条网址编码不对", els.output.value);
  // 往返
  els.scope.value = "component"; els.scope.fire("change");
  els.input.value = "中文 参数&x=1"; els.input.fire("input");
  const enc = els.output.value;
  els.mode.value = "decode"; els.input.value = enc; els.input.fire("input");
  if (els.output.value === "中文 参数&x=1") ok("往返：中文与 & 都还原正确");
  else bad("往返失败", enc + " → " + els.output.value);
  // 非法输入要有反馈
  els.input.value = "%E4%B8"; els.input.fire("input");
  if (els.output.value === "" && els.status.classList.contains("bad")) ok("残缺的百分号编码 → 清空 + 报错");
  else bad("非法 URI 没报错", els.output.value);
}

console.log("\n⑦ 时间戳转换（秒/毫秒自动识别 + 双向）");
{
  const ui = Object.assign(readUi("en"), readI18n("timestamp", "en"));
  const { els } = loadTool("timestamp.js", ["mode", "input", "output", "now", "copy", "clear", "toast"], ui, { mode: "toDate" });
  els.input.value = "1000000000"; els.input.fire("input");
  if (/2001-09-09/.test(els.output.value) && /UTC/.test(els.output.value)) ok("10 位秒：1000000000 → 2001-09-09");
  else bad("秒转日期不对", els.output.value.replace(/\n/g, " | "));
  els.input.value = "1000000000000"; els.input.fire("input");
  if (/2001-09-09/.test(els.output.value)) ok("13 位毫秒：1000000000000 → 同样日期（自动识别）");
  else bad("毫秒识别失败", els.output.value.replace(/\n/g, " | "));
  // 日期→时间戳：不要写死某个 UTC 数字（脚本按本地时区解析，写死会在别的时区误报）。
  // 这里测「自洽性」：秒 → 本地时间文本 → 再转回秒，必须回到原值。
  const localText = els.output.value.split("\n").find((l) => l.startsWith("Local"))?.replace(/^Local\s+/, "");
  els.mode.value = "toSec"; els.mode.fire("change");
  els.input.value = localText; els.input.fire("input");
  const back = (els.output.value.match(/Seconds\s+(\d+)/) || [])[1];
  if (back && Math.abs(Number(back) - 1000000000) <= 1) ok("往返自洽：1000000000 秒 → 本地时间 → 回到 " + back + " 秒（允许跨秒 ±1）");
  else bad("日期转时间戳往返不自洽", "本地时间文本=" + localText + " | " + els.output.value.replace(/\n/g, " | "));
  els.input.value = "完全不是日期"; els.input.fire("input");
  if (els.output.value === "") ok("乱输入 → 清空（不显示 Invalid Date）");
  else bad("乱输入没清空", els.output.value);
}

console.log("\n⑧ 密码生成器（长度/字符集/随机性/强度）");
{
  const ui = Object.assign(readUi("en"), readI18n("password-gen", "en"));
  const { els } = loadTool("password-gen.js",
    ["length", "lengthVal", "output", "upper", "lower", "digits", "symbols", "run", "copy", "clear", "meter", "toast"],
    ui, { length: "16" });
  els.upper.checked = true; els.lower.checked = true; els.digits.checked = true; els.symbols.checked = true;
  els.run.click();
  const pw = els.output.value;
  if (pw.length === 16) ok("长度正确（16 位）"); else bad("长度不对：" + pw.length);
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw))
    ok("四类字符都至少出现一个（勾了就必须有）");
  else bad("字符集不满足：" + pw);
  let differ = false;
  for (let i = 0; i < 5 && !differ; i++) { els.run.click(); if (els.output.value !== pw) differ = true; }
  if (differ) ok("连续生成结果不同（真随机，不是写死的）"); else bad("连续 5 次结果都相同，随机性可疑");
  // 只留数字
  els.upper.checked = false; els.lower.checked = false; els.digits.checked = true; els.symbols.checked = false;
  els.run.click();
  if (/^[0-9]+$/.test(els.output.value)) ok("只勾数字 → 结果全是数字");
  else bad("字符集过滤失效：" + els.output.value);
  els.length.value = "32"; els.length.fire("input");
  if (els.output.value.length === 32 && els.lengthVal.textContent === "32") ok("滑块改长度即时生效，数值同步显示");
  else bad("长度滑块失效", els.output.value.length + " / badge=" + els.lengthVal.textContent);
  if (els.meter.textContent && els.meter.textContent.length > 0) ok("强度提示已显示：" + els.meter.textContent.slice(0, 40));
  else bad("强度提示为空");
}


console.log("\n⑨ 密码强度检测（含「默认不联网」的硬性验证 —— 毛毛的明确要求）");
{
  const ui = Object.assign(readUi("en"), readI18n("password-strength", "en"));
  // mock fetch：记录每一次调用，并返回一段可控的 HIBP 响应
  const calls = [];
  const fakeFetch = (url) => {
    calls.push(url);
    return Promise.resolve({ text: () => Promise.resolve("0000000000000000000000000000000000:3\nDEADBEEF000000000000000000000000000:42") });
  };
  const { els } = loadTool("password-strength.js",
    ["input", "output", "meter", "status", "pwn", "pwnBox", "pwnConfirm", "pwnCancel", "pwnResult", "copy", "clear", "toast"],
    ui, {}, { fetch: fakeFetch, TP_TEST: true });

  // ⭐ 断言 1：页面加载后，一个网络请求都不能发
  if (calls.length === 0) ok("加载后零网络请求（默认完全离线）");
  else bad("加载后竟然发了请求：" + calls.join(", "));

  // ⭐ 断言 2：输入密码做强度分析，依然零请求
  els.input.value = "correct horse battery staple x9!";
  els.input.fire("input");
  if (calls.length === 0) ok("输入并分析密码后仍是零请求");
  else bad("分析密码时发了请求：" + calls.join(", "));
  if (els.output.value.includes("bits")) ok("强度报告已生成（含 bits）");
  else bad("强度报告为空", els.output.value.slice(0, 80));

  // ⭐ 断言 3：点「查询泄露库」只展开说明，还是不发请求
  els.pwn.click();
  if (calls.length === 0 && els.pwnBox.hidden === false) ok("点「查询」只展开同意说明，仍零请求");
  else bad("点查询就发了请求，或说明没展开", "calls=" + calls.length + " hidden=" + els.pwnBox.hidden);

  // ⭐ 断言 4：只有点了「确认」才真的联网，且 URL 里只有 SHA-1 前 5 位
  els.pwnConfirm.click();
  // fetch 在 Promise 链里（sha1Hex → fetch → text），必须等微任务跑完再断言，
  // 否则同步读到 calls.length === 0（第一版就是这么误报的）
  for (let i = 0; i < 400 && calls.length === 0; i++) await new Promise((r) => setImmediate(r));
  if (calls.length === 1) ok("点「确认」后发出且仅发出 1 次请求");
  else bad("确认后的请求次数不对：" + calls.length);
  const url = calls[0] || "";
  if (/^https:\/\/api\.pwnedpasswords\.com\/range\/[0-9A-F]{5}$/.test(url))
    ok("请求 URL 合规（只含 SHA-1 前 5 位）：" + url);
  else bad("URL 不合规（可能泄露了更多信息）", url);
  if (url.length > 0 && els.input.value.indexOf(url.slice(-5)) === -1)
    ok("URL 里的 5 位片段不是明文密码的一部分（是哈希，不是密码）");
  for (let i = 0; i < 400 && !els.pwnResult.textContent; i++) await new Promise((r) => setImmediate(r));
  if (els.pwnResult.textContent) ok("查询结果已回填：" + els.pwnResult.textContent.slice(0, 46));
  else bad("查询完成后没有结果文案");
}

console.log("\n⑩ 弱密码识别（这些必须被当场抓出来）");
{
  const ui = Object.assign(readUi("en"), readI18n("password-strength", "en"));
  const { els } = loadTool("password-strength.js",
    ["input", "output", "meter", "status", "pwn", "pwnBox", "pwnConfirm", "pwnCancel", "pwnResult", "copy", "clear", "toast"],
    ui, {}, { fetch: () => Promise.reject(new Error("should not be called")), TP_TEST: true });
  const check = (pw) => { els.input.value = pw; els.input.fire("input"); return els.output.value; };

  const weak = [
    ["123456", "issueCommon"], ["password", "issueCommon"], ["qwerty123", "issueKeyboard"],
    ["aaaaaaaa", "issueRepeat"], ["abcd1234", "issueSequence"], ["19900101", "issueDate"],
    ["13800138000", "issueDigits"], ["abcdefgh", "issueLowerOnly"],
  ];
  for (const [pw, key] of weak) {
    const out = check(pw);
    if (out.includes(ui[key])) ok(`「${pw}」被识别为「${ui[key]}」`);
    else bad(`「${pw}」没有被识别出 ${key}`, out.split("\n").slice(0, 3).join(" | "));
  }
  // 强密码不该被误报
  const strong = check("Tr0ub4dor&3-kX9!mQ");
  if (/Very strong|Strong/.test(strong)) ok("强密码评为强（没误报）");
  else bad("强密码被误判", strong.split("\n")[0]);

  // 长短对比：同一模式，更长的时间必须更久
  const t1 = check("aB3!aB3!"), t2 = check("aB3!aB3!aB3!aB3!aB3!aB3!");
  const secOf = (txt) => (txt.split("\n").find((l) => l.includes("Single GPU")) || "");
  if (secOf(t2) !== secOf(t1) && secOf(t1) && secOf(t2)) ok("更长 ⇒ 破解时间显著变长（" + secOf(t1).split(": ")[1] + " → " + secOf(t2).split(": ")[1] + "）");
  else bad("长度没有影响破解时间估算", secOf(t1) + " / " + secOf(t2));
}

console.log("\n⑪ 哈希（手写 MD5 + WebCrypto 的 SHA 系列）");
{
  const ui = Object.assign(readUi("en"), readI18n("hash", "en"));
  const { els } = loadTool("hash.js",
    ["input", "output", "algo", "upper", "status", "copy", "clear", "toast"], ui, { algo: "md5" });
  // 算完是异步的（SHA 走 Promise），所以等输出非空再断言
  /* ⚠️ 等待条件必须同时看「输出非空」和「状态行有内容」：
     只盯输出非空的话，在 SHA-512 这种较慢的算法上会偶发抢跑（2026-10-12 真抓到过一次 flaky，
     同一份代码时过时不过 —— 那种"全绿"是没有意义的）。hash.js 算完会写 status，用它当完成信号更靠谱。 */
  const run = async (text, algorithm, upper) => {
    els.input.value = text; els.algo.value = algorithm; els.upper.checked = !!upper;
    els.output.value = ""; els.status.textContent = "";
    els.input.fire("input");
    for (let i = 0; i < 2000; i++) {
      await new Promise((r) => setImmediate(r));
      if (els.output.value && els.status.textContent) break;
    }
    return els.output.value;
  };
  const md5abc = await run("abc", "md5");
  if (md5abc.startsWith("900150983cd24fb0d6963f7d28e17f72")) ok("MD5(\"abc\") = 900150983cd24fb0d6963f7d28e17f72");
  else bad("MD5(\"abc\") 算错", md5abc.split("\n")[0]);
  if (md5abc.includes("kAFQmDzST7DWlj99KOF/cg==")) ok("MD5(\"abc\") 的 base64 也对");
  else bad("MD5 base64 不对", md5abc);

  const sha1 = await run("abc", "sha-1");
  if (sha1.startsWith("a9993e364706816aba3e25717850c26c9cd0d89d")) ok("SHA-1(\"abc\") 正确");
  else bad("SHA-1(\"abc\") 算错", sha1.split("\n")[0]);

  const sha256 = await run("abc", "sha-256");
  if (sha256.startsWith("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")) ok("SHA-256(\"abc\") 正确");
  else bad("SHA-256(\"abc\") 算错", sha256.split("\n")[0]);

  const sha512 = await run("abc", "sha-512");
  if (sha512.startsWith("ddaf35a193617abacc417349ae204131")) ok("SHA-512(\"abc\") 正确（前 32 位）");
  else bad("SHA-512(\"abc\") 算错", sha512.split("\n")[0]);

  // 中文 + emoji：验证走的是 UTF-8 字节而不是 UTF-16 码元
  const cn = await run("中文🐋", "sha-256");
  if (/^[0-9a-f]{64}$/.test(cn.split("\n")[0])) ok("中文 + emoji 也能算出 32 字节摘要");
  else bad("中文输入摘要异常", cn.split("\n")[0]);

  const up = await run("abc", "md5", true);
  if (up.startsWith("900150983CD24FB0D6963F7D28E17F72")) ok("「十六进制大写」开关生效");
  else bad("大写开关没生效", up.split("\n")[0]);

  const empty = await run("", "md5");
  if (empty === "") ok("空输入清空输出（不留上次的残值）");
  else bad("空输入没有清空输出", empty);
}

console.log("\n⑫ 正则测试器（匹配 / 捕获组 / 替换 / 坏正则不能崩）");
{
  const ui = Object.assign(readUi("en"), readI18n("regex", "en"));
  const { els } = loadTool("regex.js",
    ["pattern", "replace", "cbG", "cbI", "cbM", "cbS", "cbU", "input", "output", "status", "copy", "clear", "toast"], ui, {});
  els.cbG.checked = true;
  els.pattern.value = "a(\\d+)b";
  els.input.value = "a1b xx a22b";
  els.input.fire("input");
  if (els.output.value.includes("#2") && els.output.value.includes('"22"')) ok("全局匹配列出两处，并给出捕获组");
  else bad("匹配列表不对", els.output.value.slice(0, 120));
  if (els.output.value.includes('$1 = "1"') && els.output.value.includes('$1 = "22"')) ok("捕获组 $1 的值正确");
  else bad("捕获组值不对", els.output.value.slice(0, 160));

  els.cbG.checked = false;
  els.input.fire("input");
  if (els.output.value.includes(": 1") && !els.output.value.includes("#2")) ok("关掉 g 后只返回第一处匹配");
  else bad("非全局模式行为不对", els.output.value.slice(0, 80));

  els.cbG.checked = true;
  els.replace.value = "X$1";
  els.input.fire("input");
  if (els.output.value.includes("X1 xx X22")) ok("替换预览支持 $1 引用捕获组");
  else bad("替换预览不对", els.output.value.slice(-120));

  els.pattern.value = "(";
  els.input.fire("input");
  if (els.status.className.includes("err") && els.output.value === "") ok("坏正则给出错误提示且不输出垃圾");
  else bad("坏正则处理不对", els.status.textContent);

  els.pattern.value = "x";
  els.replace.value = "";
  els.input.value = "no hits here";
  els.input.fire("input");
  if (els.status.textContent === ui.noMatch && !els.output.value.includes("#1")) ok("无匹配时明确说明（不假装匹配到东西）");
  else bad("无匹配提示不对", els.status.textContent);
}

console.log("\n⑬ UUID / ULID / NanoID（格式、唯一性、开关）");
{
  const ui = Object.assign(readUi("en"), readI18n("uuid", "en"));
  const { els } = loadTool("uuid.js",
    ["type", "count", "upper", "nodash", "gen", "output", "status", "copy", "clear", "toast"], ui,
    { type: "uuid4", count: "5" });
  els.gen.click();
  const v4 = els.output.value.split("\n");
  const V4RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (v4.length === 5 && v4.every((v) => V4RE.test(v))) ok("UUID v4 × 5 个，格式与版本位都正确");
  else bad("UUID v4 格式不对", v4.join(" | "));
  if (new Set(v4).size === 5) ok("5 个 UUID 互不重复");
  else bad("出现重复 UUID");

  els.type.value = "uuid7"; els.gen.click();
  const v7 = els.output.value.split("\n")[0];
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v7)) ok("UUID v7 版本位正确（时间有序）");
  else bad("UUID v7 格式不对", v7);

  els.type.value = "ulid"; els.gen.click();
  const ulid = els.output.value.split("\n")[0];
  if (/^[0-9A-HJKMNP-TV-Z]{26}$/.test(ulid)) ok("ULID 26 位 Crockford Base32 正确");
  else bad("ULID 格式不对", ulid);

  els.type.value = "nanoid"; els.gen.click();
  if (els.output.value.split("\n")[0].length === 21) ok("NanoID 默认 21 位");
  else bad("NanoID 长度不对", els.output.value.split("\n")[0]);

  els.type.value = "uuid4"; els.nodash.checked = true; els.upper.checked = true; els.gen.click();
  const raw = els.output.value.split("\n")[0];
  if (/^[0-9A-F]{32}$/.test(raw)) ok("「去连字符 + 大写」两个开关同时生效");
  else bad("去连字符 / 大写开关失效", raw);
}

console.log("\n⑭ 文本对比（=== 分隔、增删标记、缺分隔符要提示）");
{
  const ui = Object.assign(readUi("en"), readI18n("diff", "en"));
  const { els } = loadTool("diff.js", ["input", "output", "status", "copy", "clear", "toast"], ui, {});
  els.input.value = "a\nb\nc\n===\na\nx\nc";
  els.input.fire("input");
  const out = els.output.value;
  if (out.includes("- b") && out.includes("+ x") && out.includes("  a")) ok("删行 / 增行 / 未变行标记都正确");
  else bad("差异输出不对", out.replace(/\n/g, " | "));
  if (els.status.textContent.includes("+1") && els.status.textContent.includes("-1")) ok("统计行给出 +1 / -1");
  else bad("统计不对", els.status.textContent);

  els.input.value = "a\nb";
  els.input.fire("input");
  if (els.output.value === "" && els.status.className.includes("err")) ok("缺 === 分隔符时明确提示（不给出误导结果）");
  else bad("缺分隔符处理不对", els.status.textContent + " / " + els.output.value);

  els.input.value = "same\n===\nsame";
  els.input.fire("input");
  if (els.status.textContent.includes("+0") && els.status.textContent.includes("-0")) ok("完全相同的两段 ⇒ 0 增 0 删");
  else bad("相同文本的统计不对", els.status.textContent);
}

console.log("\n⑮ 命名风格转换（缩略词不能拆碎）");
{
  const ui = Object.assign(readUi("en"), readI18n("case-converter", "en"));
  const { els } = loadTool("case-converter.js", ["input", "output", "style", "status", "copy", "clear", "toast"], ui, { style: "all" });
  els.input.value = "helloWorld";
  els.input.fire("input");
  const out = els.output.value;
  const need = ["helloWorld", "HelloWorld", "hello_world", "hello-world", "HELLO_WORLD", "hello.world", "Hello World"];
  const miss = need.filter((n) => !out.includes(n));
  if (!miss.length) ok("helloWorld 的 7 种风格全部正确");
  else bad("缺少风格：" + miss.join(", "), out);
  els.input.value = "HTTPServer";
  els.input.fire("input");
  if (els.output.value.includes("http_server") && !els.output.value.includes("h_t_t_p")) ok("HTTPServer → http_server（缩略词没被拆碎）");
  else bad("缩略词拆分不对", els.output.value);
  els.style.value = "snake";
  els.input.value = "helloWorld";
  els.input.fire("input");
  if (els.output.value === "hello_world") ok("单选某种风格时只输出该结果");
  else bad("单风格输出不对", els.output.value);
}

console.log("\n⑯ 进制转换（BigInt 大数不能丢精度）");
{
  const ui = Object.assign(readUi("en"), readI18n("radix", "en"));
  const { els } = loadTool("radix.js", ["input", "output", "base", "group", "status", "copy", "clear", "toast"], ui, { base: "auto", group: "4" });
  els.input.value = "255";
  els.input.fire("input");
  const o = els.output.value;
  if (o.includes("0xff") && o.includes("0b11111111") && o.includes("255") && o.includes("1111 1111")) ok("255 → 0xff / 0b11111111 / 分组视图");
  else bad("255 的转换不对", o.replace(/\n/g, " | "));
  els.input.value = "0x1f";
  els.input.fire("input");
  if (els.output.value.includes("DEC   31")) ok("自动识别 0x 前缀（0x1f → 31）");
  else bad("0x 前缀识别不对", els.output.value);
  const big = "123456789012345678901234567890";
  els.input.value = big;
  els.input.fire("input");
  if (els.output.value.includes(big)) ok("30 位大数经 BigInt 保持原值（用 Number 会丢精度）");
  else bad("大数丢失精度", els.output.value.split("\n")[0]);
  els.base.value = "16";
  els.input.value = "ff";
  els.input.fire("input");
  if (els.output.value.includes("DEC   255")) ok("按 16 进制解析 ff = 255");
  else bad("指定进制解析失败", els.output.value);
  els.base.value = "10";
  els.input.value = "12z";
  els.input.fire("input");
  if (els.status.className.includes("err") && els.output.value === "") ok("非法字符被拒绝（不静默给出错值）");
  else bad("非法输入处理不对", els.status.textContent);
}

console.log("\n⑰ JWT 解析（三段式、过期判断、坏输入）");
{
  const ui = Object.assign(readUi("en"), readI18n("jwt", "en"));
  const { els } = loadTool("jwt.js", ["input", "output", "status", "copy", "clear", "toast"], ui, {});
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const future = Math.floor(Date.now() / 1000) + 3600;
  const past = Math.floor(Date.now() / 1000) - 3600;
  els.input.value = b64u({ alg: "HS256", typ: "JWT" }) + "." + b64u({ sub: "user-42", exp: future }) + ".AAAA";
  els.input.fire("input");
  if (els.output.value.includes("HS256") && els.output.value.includes("user-42")) ok("header 与 payload 都能解出来");
  else bad("JWT 解码失败", els.output.value.slice(0, 120));
  if (!els.status.className.includes("err")) ok("未过期的 token 判定为有效");
  else bad("有效期判断错了", els.status.textContent);
  els.input.value = b64u({ alg: "HS256" }) + "." + b64u({ sub: "user-42", exp: past }) + ".AAAA";
  els.input.fire("input");
  if (els.status.className.includes("err")) ok("已过期的 token 明确标出");
  else bad("过期判断失败", els.status.textContent);
  els.input.value = "not-a-token";
  els.input.fire("input");
  if (els.status.className.includes("err") && els.output.value === "") ok("段数不对时给出提示");
  else bad("坏 token 处理不对", els.status.textContent);
}

console.log("\n⑱ CSV ⇄ JSON（引号、字段内逗号、字段内换行）");
{
  const ui = Object.assign(readUi("en"), readI18n("csv-json", "en"));
  const { els } = loadTool("csv-json.js",
    ["mode", "delim", "header", "input", "output", "status", "copy", "swap", "clear", "toast"], ui,
    { mode: "csv2json", delim: "comma" });
  els.header.checked = true;
  els.input.value = 'name,note\nzhang,"beijing, chaoyang"\nli,"line1\nline2"';
  els.input.fire("input");
  let parsed = null;
  try { parsed = JSON.parse(els.output.value); } catch (e) { /* 下面统一报错 */ }
  if (parsed && parsed[0].note === "beijing, chaoyang") ok("字段内的逗号被正确包在引号里");
  else bad("字段内逗号解析失败", els.output.value.slice(0, 120));
  if (parsed && parsed[1].note === "line1\nline2") ok("单元格内的换行被正确处理");
  else bad("字段内换行解析失败", els.output.value.slice(0, 160));
  if (parsed && parsed[0].name === "zhang") ok("表头作为字段名");
  else bad("表头处理不对", els.output.value.slice(0, 80));

  els.swap.click();     // 互换：把 JSON 放回输入框并翻成 JSON → CSV
  if (els.mode.value === "json2csv") ok("「互换」把方向翻成 JSON → CSV");
  else bad("互换没翻方向", els.mode.value);
  const csv = els.output.value;
  if (csv.startsWith("name,note") && csv.includes('"beijing, chaoyang"')) ok("JSON → CSV 会按需加引号");
  else bad("JSON → CSV 输出不对", csv.slice(0, 120));

  els.input.value = "{ not json }";
  els.input.fire("input");
  if (els.status.className.includes("err")) ok("坏 JSON 给出错误提示");
  else bad("坏 JSON 没报错", els.status.textContent);
}

console.log("\n⑲ HTML 实体（编码顺序不能反、emoji 不能被拆半）");
{
  const ui = Object.assign(readUi("en"), readI18n("html-entities", "en"));
  const { els } = loadTool("html-entities.js",
    ["mode", "all", "input", "output", "status", "copy", "swap", "clear", "toast"], ui,
    { mode: "encode" });
  els.input.value = 'a < b & "c"';
  els.input.fire("input");
  if (els.output.value === "a &lt; b &amp; &quot;c&quot;") ok("五个特殊字符都转义正确（& 没有被二次转义）");
  else bad("编码结果不对", els.output.value);
  els.mode.value = "decode";
  els.mode.fire("change");
  if (els.output.value === 'a < b & "c"') ok("解码能还原回原文（往返一致）");
  else bad("解码结果不对", els.output.value);

  els.mode.value = "encode"; els.mode.fire("change");
  els.input.value = "中文 🐋";
  els.input.fire("input");
  if (els.output.value === "中文 🐋") ok("默认不转义非 ASCII（开关关闭）");
  else bad("默认行为不对", els.output.value);
  els.all.checked = true;
  els.input.fire("input");
  if (els.output.value === "&#x4E2D;&#x6587; &#x1F40B;") ok("打开开关后中文与 emoji 都按码点转义（emoji 没被拆成两半）");
  else bad("非 ASCII 转义不对", els.output.value);

  els.mode.value = "decode"; els.mode.fire("change");
  if (els.output.value === "中文 🐋") ok("十六进制实体能解回 emoji（码点 > 0xFFFF 也正确）");
  else bad("emoji 解码失败", els.output.value);

  els.input.value = "&unknown; &amp;";
  els.input.fire("input");
  if (els.output.value === "&unknown; &") ok("认不出的实体原样保留（不擅自删掉）");
  else bad("未知实体处理不对", els.output.value);
}

console.log("\n⑳ 日期计算（相差天数 / 加减 / 非法日期要拒绝）");
{
  const ui = Object.assign(readUi("en"), readI18n("date-calc", "en"));
  const { els } = loadTool("date-calc.js", ["input", "output", "days", "status", "copy", "clear", "toast"], ui,
    { days: "30" });
  els.input.value = "2026-01-01";
  els.input.fire("input");
  if (els.output.value.includes("2026-01-01") && els.output.value.includes("2026-01-31")) ok("偏移 +30 天 = 2026-01-31");
  else bad("日期偏移算错", els.output.value.replace(/\n/g, " | "));
  if (/day of year\s+1 \/ 365/.test(els.output.value)) ok("2026-01-01 是年内第 1 天 / 共 365 天");
  else bad("年内序算错", els.output.value.split("\n")[2]);

  els.input.value = "2024-02-29";
  els.input.fire("input");
  if (!els.status.className.includes("err")) ok("闰年 2 月 29 日被接受");
  else bad("闰年日期被拒", els.status.textContent);
  if (els.output.value.includes("yes")) ok("2024 识别为闰年");
  else bad("闰年判断错了", els.output.value);

  els.input.value = "2026-02-29";
  els.input.fire("input");
  if (els.status.className.includes("err") && els.output.value === "") ok("非闰年的 2 月 29 日被明确拒绝（不会偷偷进位到 3 月）");
  else bad("非法日期处理不对", els.status.textContent + " / " + els.output.value.split("\n")[0]);

  els.input.value = "2026/03/05";
  els.input.fire("input");
  if (!els.status.className.includes("err")) ok("斜杠写法 2026/03/05 也能识别");
  else bad("斜杠日期没识别", els.status.textContent);
}

console.log("\n㉑ URL 拆解（主机/路径/查询参数逐条）");
{
  const ui = Object.assign(readUi("en"), readI18n("url-parser", "en"));
  const { els } = loadTool("url-parser.js", ["input", "output", "decode", "status", "copy", "clear", "toast"], ui, {});
  els.decode.checked = false;
  els.input.value = "https://shop.example.com:8443/a/b?q=hello%20world&lang=zh#top";
  els.input.fire("input");
  const out = els.output.value;
  if (out.includes("https") && out.includes("shop.example.com") && out.includes("8443")) ok("协议 / 主机 / 端口都拆出来了");
  else bad("基础字段不对", out.replace(/\n/g, " | ").slice(0, 160));
  if (out.includes("1. q  =  hello%20world")) ok("查询参数逐条列出（带序号，未解码时显示原文）");
  else bad("查询参数没列出来", out.replace(/\n/g, " | ").slice(0, 200));
  els.decode.checked = true;
  els.input.fire("input");
  if (els.output.value.includes("hello world")) ok("打开解码后 %20 显示为空格");
  else bad("解码开关失效", els.output.value.slice(-160));
  els.input.value = "notaurl";
  els.input.fire("input");
  if (els.status.className.includes("err") && els.output.value === "") ok("非法 URL 给出提示");
  else bad("非法 URL 处理不对", els.status.textContent);
}

console.log("\n㉒ 配色板（互补色与明度阶梯）");
{
  const ui = Object.assign(readUi("en"), readI18n("color-palette", "en"));
  const { els } = loadTool("color-palette.js", ["input", "output", "color", "status", "copy", "clear", "toast"], ui, {});
  els.input.value = "#ff0000";
  els.input.fire("input");
  const out = els.output.value;
  if ((out.match(/#[0-9a-f]{6}/g) || []).length >= 13) ok("一次生成 6 组配色 + 7 档明度（共 13 个以上 hex）");
  else bad("配色数量不足", out.replace(/\n/g, " | ").slice(0, 200));
  if (out.includes("#00ffff")) ok("#ff0000 的互补色 = #00ffff（按 HSL 转 180°）");
  else bad("互补色算错", out.split("\n")[1]);
  els.input.value = "#2f6df6";
  els.input.fire("input");
  if (!els.status.className.includes("err")) ok("三位/六位 hex 都能用（本轮测 6 位）");
  else bad("六位 hex 被拒", els.status.textContent);
  els.input.value = "xyz";
  els.input.fire("input");
  if (els.status.className.includes("err")) ok("非法颜色被拒绝");
  else bad("非法颜色没报错", els.status.textContent);
}

console.log("\n㉓ IP / CIDR（掩码运算不能出负数）");
{
  const ui = Object.assign(readUi("en"), readI18n("ip-cidr", "en"));
  const { els } = loadTool("ip-cidr.js", ["input", "output", "status", "copy", "clear", "toast"], ui, {});
  els.input.value = "192.168.1.10/24";
  els.input.fire("input");
  const out = els.output.value;
  if (out.includes("192.168.1.0/24") && out.includes("192.168.1.255")) ok("/24 的网络地址与广播地址正确");
  else bad("网络/广播算错", out.replace(/\n/g, " | ").slice(0, 200));
  if (out.includes("192.168.1.1 – 192.168.1.254")) ok("可用主机范围 = .1 – .254");
  else bad("主机范围不对", out.replace(/\n/g, " | ").slice(0, 200));
  if (out.includes("256") && out.includes("254")) ok("地址总数 256 / 可用 254");
  else bad("地址计数不对", out.split("\n")[6]);
  if (!/-\d/.test(out.split("\n")[4] + out.split("\n")[5])) ok("掩码与通配符没有出现负数（32 位有符号的坑已挡住）");
  else bad("掩码出现负数", out.split("\n")[4] + " / " + out.split("\n")[5]);
  if (out.includes("private")) ok("识别为私有地址");
  else bad("地址类型判断错了", out.split("\n")[7]);

  els.input.value = "10.0.0.5/32";
  els.input.fire("input");
  if (/usable\s+1\b/.test(els.output.value)) ok("/32 的可用地址按 1 报（不是 −1）");
  else bad("/32 特例处理不对", els.output.value.split("\n")[6]);
  els.input.value = "999.1.1.1/24";
  els.input.fire("input");
  if (els.status.className.includes("err")) ok("非法 IP 被拒绝");
  else bad("非法 IP 没报错", els.status.textContent);
}

console.log("\n㉔ Cron 解析（未来运行时间与「日/周是或关系」）");
{
  const ui = Object.assign(readUi("en"), readI18n("cron", "en"));
  const { els } = loadTool("cron.js", ["input", "output", "status", "copy", "clear", "toast"], ui, {});
  els.input.value = "*/15 9-18 * * 1-5";
  els.input.fire("input");
  const lines = els.output.value.split("\n").filter((l) => /^\s+\d{4}-\d{2}-\d{2} /.test(l));
  if (lines.length === 5) ok("列出未来 5 次运行时间");
  else bad("运行时间数量不对", lines.length + " 行");
  const okAll = lines.length === 5 && lines.every((l) => {
    const m = /(\d{2}):(\d{2})/.exec(l);
    return +m[1] >= 9 && +m[1] <= 18 && [0, 15, 30, 45].includes(+m[2]);
  });
  if (okAll) ok("5 次时间都落在 9–18 点、整 15 分上");
  else bad("时间不符合表达式", lines.join(" | "));
  const weekdaysOnly = lines.length === 5 && lines.every((l) => !/Saturday|Sunday/.test(l));
  if (weekdaysOnly) ok("周一至周五限定生效（没有周末）");
  else bad("星期限定没生效", lines.join(" | "));

  els.input.value = "* * * *";
  els.input.fire("input");
  if (els.status.className.includes("err")) ok("段数不对（4 段）时给出明确提示");
  else bad("段数校验失效", els.status.textContent);

  els.input.value = "0 0 1 * 1";
  els.input.fire("input");
  if (els.output.value.includes("OR")) ok("日与周同时限定时说明是「或」关系（Vixie cron 语义）");
  else bad("日/周语义说明缺失", els.output.value.split("\n")[2]);
}

console.log("\n㉕ 站内搜索（索引路径 / 打分 / 结果渲染）");
{
  /* search.js 不走 TP.$（它直接用 document.getElementById + fetch），所以这里单独造沙箱。
     为什么要测：毛毛 2026-10-12 报「主页的搜索框用不了」—— 根因是索引路径写死成相对路径，
     在 /zh/ 与 /ja/ 页面会 404。这条用例把「路径来自页面注入」钉死，防止以后再退化。 */
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/search.json"), "utf8"));
  // ⚠️ 这里以前多造了一个 "search" 元素 —— 而**真实首页里没有这个 id**，
  //    于是脚本在真机上第一行就 return，测试却全绿。现在按真实 DOM 结构造：只有这两个。
  const els = { searchInput: makeEl("searchInput"), searchResults: makeEl("searchResults") };
  let fetchedUrl = null;
  const sb = {
    console, Promise, JSON, String, Array, Object, RegExp, Error, Math, Number, Boolean,
    setTimeout: (fn) => { fn(); return 0; }, clearTimeout: () => {},
    document: {
      getElementById: (id) => els[id] || null,
      documentElement: { lang: "zh" },
      createElement: () => makeEl("tmp"),
      body: { appendChild() {}, removeChild() {} },
      // 页脚那个反馈按钮：空结果里的按钮会从它身上读邮箱（页面里只存一份 data-u / data-d）
      querySelector: (sel) => (sel === ".fb-btn"
        ? { getAttribute: (k) => (k === "data-u" ? "hi" : k === "data-d" ? "maomaowang.top" : null) }
        : null),
    },
    location: { hash: "", href: "" },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    fetch: (url) => { fetchedUrl = url; return Promise.resolve({ json: () => Promise.resolve(index) }); },
  };
  sb.window = sb;
  // 用**真实的中文文案**注入 —— 毛毛截图报的场景就是「中文页面蹦出英文」，
  // 所以这里必须验证「注入的文案真的被用上了」，而不是随便塞一个字符串自证。
  const uiJson = JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/ui.json"), "utf8"));
  sb.window.T = {
    noResults: uiJson.noResults.zh,
    noResultsBtn: uiJson.noResultsBtn.zh,
    noResultsSubject: uiJson.noResultsSubject.zh,
  };
  sb.window.TP_INDEX_URL = "/assets/search.json";          // 首页注入的绝对路径
  const ctx = vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "assets/search.js"), "utf8"), ctx, { filename: "search.js" });

  els.searchInput.value = "hash";
  els.searchInput.fire("input");
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  if (fetchedUrl === "/assets/search.json") ok("索引路径来自页面注入（修掉 /zh/ /ja/ 页面 404 的根因）");
  else bad("索引路径不对", String(fetchedUrl));
  if (els.searchResults.innerHTML.indexOf("hash") >= 0) ok("搜「hash」命中哈希工具");
  else bad("搜索没出结果", els.searchResults.innerHTML.slice(0, 100));

  els.searchInput.value = "压缩";
  els.searchInput.fire("input");
  await new Promise((r) => setImmediate(r));
  if (els.searchResults.innerHTML.indexOf("compress-image") >= 0 || els.searchResults.innerHTML.indexOf("压缩") >= 0) ok("中文关键词「压缩」走 keywords 命中了图片压缩");
  else bad("中文关键词没命中", els.searchResults.innerHTML.slice(0, 120));

  els.searchInput.value = "zzzznotfound";
  els.searchInput.fire("input");
  await new Promise((r) => setImmediate(r));
  if (els.searchResults.innerHTML.indexOf("没找到") >= 0) ok("中文页面查不到时提示是中文（不再是英文兜底）");
  else bad("空状态文案没走注入的文案", els.searchResults.innerHTML.slice(0, 120));
  // 毛毛的要求：搜不出来的时候，这里要能直接联系作者
  if (els.searchResults.innerHTML.indexOf("fb-btn") >= 0 &&
      els.searchResults.innerHTML.indexOf('data-u="hi"') >= 0) ok("空结果里有反馈按钮（邮箱从页脚按钮读，页面里不留第二份明文）");
  else bad("空结果里没有反馈按钮", els.searchResults.innerHTML.slice(0, 160));
  // 搜不到东西是"站里还没有"，按钮该说"提个需求"，不是"反馈 bug"（毛毛 2026-10-12 指出）
  if (els.searchResults.innerHTML.indexOf(uiJson.noResultsBtn.zh) >= 0 &&
      els.searchResults.innerHTML.indexOf("反馈 bug") < 0) ok("空结果按钮是「" + uiJson.noResultsBtn.zh + "」而不是「反馈 bug」");
  else bad("空结果按钮口吻不对", els.searchResults.innerHTML.slice(0, 160));
  if (els.searchResults.innerHTML.indexOf('data-subject="' + uiJson.noResultsSubject.zh + '"') >= 0) ok("按钮自带邮件主题（需求邮件不会顶着「问题反馈」发出去）");
  else bad("按钮没带 data-subject", els.searchResults.innerHTML.slice(0, 160));

  els.searchInput.value = "";
  els.searchInput.fire("input");
  if (els.searchResults.hidden === true) ok("清空输入后结果区收起来");
  else bad("清空后没收起", String(els.searchResults.hidden));
}

console.log("\n㉖ 本轮新增工具的关键算法");
{
  const ui = (name) => { const j = JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/tools", name + ".json"), "utf8")); return j.en.ui; };
  const U = (n, extra) => Object.assign(readUi("en"), ui(n), extra || {});

  // ① Base32 / Base58：往返必须一致，且 Base32 输出只含 A-Z2-7
  {
    const { els } = loadTool("base32.js", ["input", "output", "mode", "status", "copy", "swap", "clear", "toast"], U("base32"), { mode: "b32-enc" });
    els.input.value = "hello 世界";
    els.input.fire("input");
    const enc = els.output.value;
    if (/^[A-Z2-7=]+$/.test(enc)) ok("Base32 输出只含 A-Z 与 2-7（字符集正确）");
    else bad("Base32 字符集不对", enc);
    els.mode.value = "b32-dec"; els.input.value = enc; els.input.fire("input");
    if (els.output.value === "hello 世界") ok("Base32 往返一致（含中文）");
    else bad("Base32 往返失败", els.output.value);
    els.mode.value = "b58-enc"; els.input.value = "hello"; els.input.fire("input");
    const b58 = els.output.value;
    if (!/[0OIl]/.test(b58)) ok("Base58 输出不含易混字符 0 O I l");
    else bad("Base58 里出现了易混字符", b58);
    els.mode.value = "b58-dec"; els.input.value = b58; els.input.fire("input");
    if (els.output.value === "hello") ok("Base58 往返一致");
    else bad("Base58 往返失败", els.output.value);
  }

  // ② IPv6：展开 / 压缩 / 分类
  {
    const { els } = loadTool("ipv6.js", ["input", "output", "status", "copy", "clear", "toast"], U("ipv6"), {});
    els.input.value = "2001:db8::1"; els.input.fire("input");
    if (els.output.value.includes("2001:0db8:0000:0000:0000:0000:0000:0001")) ok("IPv6 展开正确（:: 补齐到八组）");
    else bad("IPv6 展开不对", els.output.value.split("\n")[0]);
    els.input.value = "fe80::1"; els.input.fire("input");
    if (els.output.value.includes("link-local")) ok("IPv6 识别链路本地（fe80::）");
    else bad("IPv6 分类不对", els.status.textContent);
    els.input.value = "2001:db8::1::2"; els.input.fire("input");
    if (els.status.className.includes("err")) ok("两个 :: 被拒绝（这是最常见的笔误）");
    else bad("两个 :: 没被拦住", els.status.textContent);
    els.input.value = "::1"; els.input.fire("input");
    if (els.output.value.includes("loopback")) ok("::1 识别为回环");
    else bad("回环识别失败", els.output.value);
  }

  // ③ 银行卡 / 身份证校验位
  {
    const { els } = loadTool("number-check.js", ["input", "output", "status", "copy", "clear", "toast"], U("number-check"), {});
    els.input.value = "4111111111111111"; els.input.fire("input");     // 测试卡号，Luhn 合法
    if (els.output.value.includes("✅") && els.output.value.includes("Visa")) ok("银行卡 Luhn 通过 + 识别 Visa");
    else bad("Luhn 校验不对", els.output.value.split("\n")[0]);
    els.input.value = "4111111111111112"; els.input.fire("input");     // 改一位
    if (els.output.value.includes("❌")) ok("改一位数字就被抓出来（校验位的意义）");
    else bad("错误卡号没报错", els.output.value.split("\n")[0]);
    els.input.value = "11010519491231002X"; els.input.fire("input");   // 公开示例号码
    if (els.output.value.includes("1949-12-31") && els.output.value.includes("✅")) ok("身份证校验位通过 + 解析出生日期");
    else bad("身份证校验不对", els.output.value.split("\n")[0]);
  }

  // ④ 字符串转义：六个方向都要能往返
  {
    const { els } = loadTool("string-escape.js", ["input", "output", "mode", "status", "copy", "swap", "clear", "toast"], U("string-escape"), { mode: "json-enc" });
    const raw = 'he said "hi"\nnext line';
    els.input.value = raw; els.mode.value = "json-enc"; els.input.fire("input");
    if (els.output.value.includes('\\"hi\\"') && els.output.value.includes("\\n")) ok("JSON 转义：引号与换行都处理了");
    else bad("JSON 转义不对", els.output.value);
    els.mode.value = "json-dec"; els.input.value = els.output.value; els.input.fire("input");
    if (els.output.value === raw) ok("JSON 转义往返一致");
    else bad("JSON 往返失败", els.output.value);
    els.mode.value = "sql-enc"; els.input.value = "it's"; els.input.fire("input");
    if (els.output.value === "it''s") ok("SQL 转义用两个单引号（不是反斜杠）");
    else bad("SQL 转义不对", els.output.value);
    els.mode.value = "regex-enc"; els.input.value = "a.b*c"; els.input.fire("input");
    if (els.output.value === "a\\.b\\*c") ok("正则转义：点和星号都加了反斜杠");
    else bad("正则转义不对", els.output.value);
  }

  // ⑤ JSON 路径取值
  {
    const { els } = loadTool("json-path.js", ["input", "output", "path", "pretty", "status", "copy", "clear", "toast"], U("json-path"), { pretty: false });
    els.pretty.checked = false;
    els.input.value = '{"data":{"items":[{"title":"first"},{"title":"second"}]}}';
    els.path.value = "data.items[1].title"; els.input.fire("input");
    if (els.output.value === '"second"') ok("按路径取到数组第 2 项（a[1].title）");
    else bad("路径取值不对", els.output.value);
    els.path.value = "data.items[*].title"; els.input.fire("input");
    if (els.output.value === '["first","second"]') ok("通配符 a[*].b 汇总成数组");
    else bad("通配符取值不对", els.output.value);
    els.path.value = "data.nope"; els.input.fire("input");
    if (els.status.className.includes("err")) ok("路径不存在时明确报错（不返回 undefined 糊弄）");
    else bad("错误路径没有报错", els.status.textContent);
  }
}

  // ⑥ sitemap.xml 生成器（XML 转义 · 去重 · 坏行跳过 · lastmod/changefreq 开关）
  {
    const { els } = loadTool("sitemap-gen.js",
      ["input", "output", "status", "copy", "clear", "lastmod", "freq"], {});
    els.lastmod.checked = false;
    els.input.value = "https://a.com/?x=1&y=2\nhttps://a.com/\nhttps://a.com\nnot-a-url";
    els.input.fire("input");
    const out = els.output.value;
    const locs = (out.match(/<loc>/g) || []).length;

    if (out.includes("&amp;") && !/&(?!amp;|lt;|gt;|quot;|apos;)/.test(out))
      ok("sitemap：URL 里的 & 被转义成 &amp;（否则写出的是非法 XML）");
    else bad("sitemap：XML 转义不对", (out.split("\n").find((l) => l.includes("loc")) || out).slice(0, 160));

    if (locs === 2) ok("sitemap：https://a.com 与 https://a.com/ 视为同一条（去重生效）");
    else bad("sitemap：去重不对，<loc> 出现 " + locs + " 次", out.slice(0, 200));

    if (!/not-a-url/.test(out)) ok("sitemap：非 URL 行被跳过");
    else bad("sitemap：坏行混进了输出", out.slice(0, 200));

    if (!out.includes("<lastmod>")) ok("sitemap：未勾选时不写 <lastmod>");
    else bad("sitemap：lastmod 开关无效", out.slice(0, 160));

    els.lastmod.checked = true; els.freq.value = "weekly"; els.lastmod.fire("change");
    const out2 = els.output.value;
    if (out2.includes("<lastmod>") && out2.includes("<changefreq>weekly</changefreq>"))
      ok("sitemap：勾选后同时写入 lastmod 与 changefreq");
    else bad("sitemap：lastmod / changefreq 没写进去", out2.slice(0, 220));
  }

  // ⑦ robots.txt 生成器（组间空行 · Sitemap 必须绝对 URL · 坏行跳过）
  {
    const { els } = loadTool("robots-gen.js",
      ["input", "output", "status", "copy", "clear", "aibots", "sitemapurl"], {});
    els.input.value = "/admin/\n/tmp\nbad line here";
    els.input.fire("input");
    const out = els.output.value;
    if (out.startsWith("User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /tmp\n"))
      ok("robots：基本结构正确（* 组 + Allow + 两条 Disallow）");
    else bad("robots：基本结构不对", out.slice(0, 160));
    if (!out.includes("bad line"))
      ok("robots：含空格的行被跳过（那多半是粘错了）");
    else bad("robots：坏行没被跳过", out.slice(0, 160));

    els.aibots.checked = true; els.aibots.fire("change");
    const out2 = els.output.value;
    if (/\n\nUser-agent: GPTBot\nDisallow: \/\n/.test(out2) && /\n\nUser-agent: CCBot\n/.test(out2))
      ok("robots：AI 段独立成组，且与上一组之间有空行（少了空行规则会挂错组）");
    else bad("robots：AI 段格式不对", out2.slice(0, 320));

    els.sitemapurl.value = "/sitemap.xml"; els.sitemapurl.fire("input");
    if (!els.output.value.includes("Sitemap:"))
      ok("robots：相对路径的 sitemap 被拒绝（不输出 Sitemap 行）");
    else bad("robots：相对路径竟然被接受了", els.output.value.slice(-140));

    els.sitemapurl.value = "https://a.com/sitemap.xml"; els.sitemapurl.fire("input");
    if (els.output.value.includes("Sitemap: https://a.com/sitemap.xml"))
      ok("robots：绝对 URL 的 sitemap 正常写入");
    else bad("robots：绝对 URL 没写进去", els.output.value.slice(-140));
  }

console.log("\n㉗ 第三批新工具的关键算法（WCAG 对比度 · JSON→TypeScript · Markdown 目录）");
{
  const ui = (name) => { const j = JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/tools", name + ".json"), "utf8")); return j.en.ui; };
  const U = (n, extra) => Object.assign(readUi("en"), ui(n), extra || {});

  // ① 颜色对比度（WCAG 公式端点 · 卡线判定 · 颜色写法识别）
  {
    const { els } = loadTool("contrast.js",
      ["input", "output", "status", "copy", "clear"], U("contrast"), {});

    // 黑白是公式的已知端点：算错一点点这里就露馅
    els.input.value = "#000000\n#ffffff"; els.input.fire("input");
    if (els.output.value.includes("21.00"))
      ok("contrast：黑白 = 21.00 : 1（WCAG 公式端点，权重或伽马写错必崩）");
    else bad("contrast：黑白比值不对", els.output.value.slice(0, 140));

    // #777777 对白 = 4.478，卡在 4.5 线下 —— 正是「看着挺清楚、其实不达标」的典型
    els.input.value = "#777777\n#ffffff"; els.input.fire("input");
    const out777 = els.output.value;
    if (out777.includes("4.48") && out777.includes("FAIL"))
      ok("contrast：#777777 对白 = 4.48 : 1，AA 判不通过（卡线不放水）");
    else bad("contrast：卡线判定不对", out777.slice(0, 220));

    // #767676 对白 = 4.542，刚好过 AA；但 AAA 要 7，仍然不过 ⇒ 两档门槛必须分开判
    els.input.value = "#767676\n#ffffff"; els.input.fire("input");
    const out767 = els.output.value;
    if (out767.includes("4.54") && out767.includes("PASS") && out767.includes("FAIL"))
      ok("contrast：#767676 对白 = 4.54 : 1，AA 过而 AAA 不过（两档门槛分开判）");
    else bad("contrast：#767676 的两档判定不对", out767.slice(0, 240));

    // 三位缩写与 rgb() 写法都要认，结果必须一致
    els.input.value = "#000\n#fff"; els.input.fire("input");
    const shortOut = els.output.value;
    els.input.value = "rgb(0,0,0)\nrgb(255,255,255)"; els.input.fire("input");
    if (shortOut.includes("21.00") && els.output.value.includes("21.00"))
      ok("contrast：#000 缩写与 rgb(0,0,0) 都认，且结果同为 21.00");
    else bad("contrast：颜色写法识别不全", shortOut.slice(0, 120) + " || " + els.output.value.slice(0, 120));

    // 认不出的颜色必须报错，绝不悄悄按黑色算出一个看着正常的数
    els.input.value = "not-a-colour\n#fff"; els.input.fire("input");
    if (els.output.value === "" && els.status.className.includes("err"))
      ok("contrast：认不出的颜色明确报错，不硬算一个结果糊弄");
    else bad("contrast：坏颜色没有报错", els.status.textContent);

    // 只写一行时背景默认白 —— 页面首屏（默认黑白）就靠这条
    els.input.value = "#000000"; els.input.fire("input");
    if (els.output.value.includes("#ffffff") && els.output.value.includes("21.00"))
      ok("contrast：只写一行前景色时，背景自动按白色算");
    else bad("contrast：单行输入的默认背景不对", els.output.value.slice(0, 160));
  }

  // ② JSON → TypeScript（类型推断 · 可选字段 · 联合类型 · 老实说 unknown）
  {
    const { els } = loadTool("json-to-ts.js",
      ["input", "output", "status", "copy", "clear", "rootname", "optional"], U("json-to-ts"), {});

    // 同 md-toc：复选框的默认勾选状态来自 tools.json 的 checked，测试环境不读它 ⇒ 显式打开
    els.optional.checked = true; els.optional.fire("change");

    els.input.value = JSON.stringify({ id: 1, name: "Ada", tags: ["admin"], meta: { active: true } });
    els.input.fire("input");
    const out = els.output.value;
    if (/interface Root \{/.test(out) && /id: number;/.test(out) && /name: string;/.test(out) && /tags: string\[\];/.test(out))
      ok("json-to-ts：基本类型与数组推对了（number / string / string[]）");
    else bad("json-to-ts：基本类型推断不对", out.slice(0, 280));

    // 嵌套对象的名字带父名前缀（RootMeta 而不是裸 Meta）—— 免得两个父对象里同名字段撞名
    if (/meta: RootMeta;/.test(out) && /interface RootMeta \{/.test(out))
      ok("json-to-ts：嵌套对象单独出 interface，名字带父名前缀（RootMeta）");
    else bad("json-to-ts：嵌套对象没生成 interface", out.slice(0, 280));

    // 数组里每个对象的字段不完全一样 ⇒ 只在部分元素里出现的键要标可选
    els.input.value = JSON.stringify([{ a: 1, b: 2 }, { a: 3 }]);
    els.input.fire("input");
    const out2 = els.output.value;
    if (/a: number;/.test(out2) && /b\?: number;/.test(out2))
      ok("json-to-ts：部分元素缺的键标成 b?，都有的保持必选（这才是接口真实形态）");
    else bad("json-to-ts：可选字段标记不对", out2.slice(0, 280));

    // 同字段不同类型 ⇒ 必须给联合，不许塌成 any
    els.input.value = JSON.stringify([{ v: "x" }, { v: 1 }]);
    els.input.fire("input");
    const out3 = els.output.value;
    if (/v: string \| number;/.test(out3) && !/\bany\b/.test(out3))
      ok("json-to-ts：同字段多类型输出 string | number（不塌成 any 把错误往后推）");
    else bad("json-to-ts：联合类型不对", out3.slice(0, 280));

    els.input.value = JSON.stringify({ list: [] }); els.input.fire("input");
    if (/list: unknown\[\];/.test(els.output.value))
      ok("json-to-ts：空数组诚实输出 unknown[]（不编一个 any[]）");
    else bad("json-to-ts：空数组类型不对", els.output.value.slice(0, 220));

    // 含连字符的键不加引号的话，生成的 .ts 根本编译不过
    els.input.value = JSON.stringify({ "weird-key": 1 }); els.input.fire("input");
    if (/"weird-key": number;/.test(els.output.value))
      ok("json-to-ts：非法标识符的键名自动加引号（否则生成的 TS 编译不过）");
    else bad("json-to-ts：非法键名没加引号", els.output.value.slice(0, 220));

    els.input.value = "{ not json"; els.input.fire("input");
    if (els.output.value === "" && els.status.className.includes("err"))
      ok("json-to-ts：非法 JSON 明确报错，不吐半成品");
    else bad("json-to-ts：非法 JSON 没报错", els.status.textContent);

    // 关掉开关 ⇒ 全部按必选输出
    els.input.value = JSON.stringify([{ a: 1, b: 2 }, { a: 3 }]);
    els.optional.checked = false; els.optional.fire("change");
    if (!/b\?:/.test(els.output.value))
      ok("json-to-ts：关掉可选开关后不再输出问号");
    else bad("json-to-ts：可选开关无效", els.output.value.slice(0, 220));
  }

  // ③ Markdown 目录（层级 · 代码块跳过 · GitHub 锚点规则 · 深度截断）
  {
    const { els } = loadTool("md-toc.js",
      ["input", "output", "status", "copy", "clear", "liststyle", "links", "maxdepth"], U("md-toc"), {});

    // ⚠️ 测试环境里的复选框**默认不是勾选的**（页面上的默认勾选来自 tools.json 的 checked，
    //    测试不读它）⇒ 依赖默认勾选的用例必须先显式打开，否则会误报「功能没生效」。
    els.links.checked = true; els.links.fire("change");

    els.input.value = "# Title\n\n## Section\n\n### Sub\n"; els.input.fire("input");
    const out = els.output.value;
    if (/^- \[Title\]\(#title\)$/m.test(out) && /^ {2}- \[Section\]\(#section\)$/m.test(out) && /^ {4}- \[Sub\]\(#sub\)$/m.test(out))
      ok("md-toc：缩进（每层 2 格）与锚点链接都对");
    else bad("md-toc：目录格式不对", out.slice(0, 220));

    // 围栏里的 # 是注释 —— 按行首匹配就会多出一堆假条目
    els.input.value = "# Real\n\n```sh\n# just a comment\n```\n\n## Also real\n"; els.input.fire("input");
    const out2 = els.output.value;
    if (out2.includes("Real") && out2.includes("Also real") && !out2.includes("just a comment"))
      ok("md-toc：围栏代码块里的 # 注释不算标题");
    else bad("md-toc：代码块没跳过", out2.slice(0, 240));

    // 中文锚点原样保留、大写转小写、空格转连字符（GitHub 规则）
    els.input.value = "# 中文标题\n\n## Hello World\n"; els.input.fire("input");
    const out3 = els.output.value;
    if (out3.includes("(#中文标题)") && out3.includes("(#hello-world)"))
      ok("md-toc：中文锚点原样保留，空格转连字符并转小写（GitHub 规则）");
    else bad("md-toc：锚点规则不对", out3.slice(0, 240));

    els.input.value = "# Name\n\n# Name\n"; els.input.fire("input");
    if (els.output.value.includes("(#name-1)"))
      ok("md-toc：重名标题第二个加 -1（不加的话链接点不动）");
    else bad("md-toc：重名标题没加后缀", els.output.value.slice(0, 180));

    // 锚点是按「渲染后的文字」算的 ⇒ ** 与 ` 这些标记不能算进去
    els.input.value = "# **Bold** and `code`\n"; els.input.fire("input");
    if (els.output.value.includes("#bold-and-code"))
      ok("md-toc：行内标记（粗体 / 反引号）从锚点里剔除");
    else bad("md-toc：行内标记没清理", els.output.value.slice(0, 180));

    els.input.value = "# A\n\n## B\n\n### C\n";
    els.maxdepth.value = "2"; els.maxdepth.fire("input");
    if (els.output.value.includes("[B]") && !els.output.value.includes("[C]"))
      ok("md-toc：深度滑块真的截断（第 3 级被排除）");
    else bad("md-toc：深度限制无效", els.output.value.slice(0, 180));

    els.maxdepth.value = "6"; els.liststyle.value = "number"; els.liststyle.fire("change");
    if (/^1\. \[A\]/m.test(els.output.value))
      ok("md-toc：有序列表样式生效");
    else bad("md-toc：有序列没生效", els.output.value.slice(0, 180));

    // 文档从 ## 开始时按最浅标题对齐 —— 否则整份目录会白缩进一层
    // （先把列表样式切回无序：上面那条用例改成过 number，不停在这会串味）
    els.liststyle.value = "dash"; els.liststyle.fire("change");
    els.input.value = "## Only\n\n### Deep\n"; els.input.fire("input");
    if (/^- \[Only\]/m.test(els.output.value))
      ok("md-toc：从 ## 开始的文档按最浅标题对齐，不整体多缩一层");
    else bad("md-toc：层级归一化不对", els.output.value.slice(0, 180));
  }
}

console.log("\n㉘ 第四批新工具的关键算法（cURL 转代码 · MIME 速查 · UA 解析）");
{
  const ui = (name) => { const j = JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/tools", name + ".json"), "utf8")); return j.en.ui; };
  const U = (n, extra) => Object.assign(readUi("en"), ui(n), extra || {});

  // ① curl → 代码（分词 · 续行 · 多 -d · 三种目标 · 拒绝转不了的写法）
  {
    const { els } = loadTool("curl-to-code.js",
      ["input", "output", "status", "copy", "clear", "target"], U("curl-to-code"), {});

    els.input.value = "curl 'https://api.example.com/v1/items' -H 'Content-Type: application/json' -d '{\"name\":\"Ada\"}'";
    els.input.fire("input");
    const out = els.output.value;
    if (out.includes('method: "POST"') && out.includes("api.example.com/v1/items") &&
        out.includes("JSON.stringify") && out.includes('"Content-Type": "application/json"'))
      ok("curl→code：方法（有 body 自动 POST）· URL · 请求头 · JSON body 全部带过去");
    else bad("curl→code：fetch 输出不对", out.slice(0, 300));

    // Copy as cURL 出来的就是多行带反斜杠的，不合并整条都解析不了
    els.input.value = "curl 'https://a.com/api' \\\n  -H 'X-Token: abc' \\\n  -d 'a=1'";
    els.input.fire("input");
    if (els.output.value.includes('"X-Token": "abc"') && els.output.value.includes('"a=1"'))
      ok("curl→code：行尾反斜杠续行能合并（Copy as cURL 的真实写法）");
    else bad("curl→code：续行没处理", els.output.value.slice(0, 240));

    els.input.value = "curl https://a.com -d 'a=1' -d 'b=2'"; els.input.fire("input");
    if (els.output.value.includes("a=1&b=2"))
      ok("curl→code：多个 -d 用 & 拼接（curl 的真实行为，不是后者覆盖前者）");
    else bad("curl→code：多个 -d 处理不对", els.output.value.slice(0, 200));

    els.input.value = "curl https://a.com -d @data.json"; els.input.fire("input");
    if (els.output.value === "" && els.status.className.includes("err"))
      ok("curl→code：-d @文件 直接报错（body 在文件里，转出来的必然是错的）");
    else bad("curl→code：-d @file 没拦住", els.status.textContent);

    els.input.value = "curl -X POST -H 'A: b'"; els.input.fire("input");
    if (els.output.value === "" && els.status.className.includes("err"))
      ok("curl→code：找不到 URL 时明确报错");
    else bad("curl→code：缺 URL 没报错", els.status.textContent);

    els.input.value = "curl -u user:pass https://a.com/api";
    els.target.value = "python"; els.target.fire("change");
    const py = els.output.value;
    if (py.includes("import requests") && py.includes("requests.get") && py.includes('auth=("user", "pass")'))
      ok("curl→code：Python 目标生成 requests 代码，-u 转成 auth 元组");
    else bad("curl→code：Python 输出不对", py.slice(0, 300));

    els.target.value = "fetch"; els.target.fire("change");
    if (els.output.value.includes('method: "GET"'))
      ok("curl→code：没有 body 时默认 GET（不是一律 POST）");
    else bad("curl→code：默认方法不对", els.output.value.slice(0, 200));
  }

  // ② MIME 速查（双向 · 粘贴写法容错 · 查不到就说查不到）
  {
    const { els } = loadTool("mime-lookup.js",
      ["input", "output", "status", "copy", "clear"], U("mime-lookup"), {});

    els.input.value = "png"; els.input.fire("input");
    if (els.output.value.includes("image/png")) ok("MIME：png → image/png");
    else bad("MIME：png 查询失败", els.output.value.slice(0, 200));

    els.input.value = "*.png"; els.input.fire("input");
    if (els.output.value.includes("image/png"))
      ok("MIME：`*.png` / `.png` 这类粘贴写法也能认（去掉星号和点）");
    else bad("MIME：带星号或点没清理", els.output.value.slice(0, 200));

    els.input.value = "image/jpeg"; els.input.fire("input");
    const j = els.output.value;
    if (j.includes(".jpg") && j.includes(".jpeg"))
      ok("MIME：一个类型反查出多个扩展名（反向查最容易漏的一步）");
    else bad("MIME：反查扩展名不全", j.slice(0, 240));

    els.input.value = "js"; els.input.fire("input");
    if (els.output.value.includes("text/javascript"))
      ok("MIME：js → text/javascript（正式类型不是 application/javascript）");
    else bad("MIME：js 类型不对", els.output.value.slice(0, 200));

    els.input.value = "nope-xyz"; els.input.fire("input");
    if (els.output.value === "" && els.status.className.includes("err"))
      ok("MIME：表里没有的类型明确说查不到（不瞎猜一个糊弄）");
    else bad("MIME：未知扩展名没报错", els.status.textContent);
  }

  // ③ UA 解析（匹配顺序 · 平板判定 · Safari 版本来源 · 爬虫）
  {
    const { els } = loadTool("ua-parse.js",
      ["input", "output", "status", "copy", "clear"], U("ua-parse"), {});

    // ⚠️ Edge 的 UA 里带着 Chrome/ —— 先测 Chrome 就会判错。这是本工具最该防的回归
    els.input.value = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91";
    els.input.fire("input");
    const edge = els.output.value;
    if (edge.includes("Edge 120.0.2210.91") && edge.includes("Windows"))
      ok("UA：Edge（串里同时带 Chrome/ 和 Safari/）被判成 Edge —— 匹配顺序的回归测试");
    else bad("UA：Edge 被误判", edge.slice(0, 240));

    els.input.value = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
    els.input.fire("input");
    if (els.output.value.includes("Android 14") && els.output.value.includes("phone"))
      ok("UA：Android 手机（带 Mobile）判成手机，系统版本也取到了");
    else bad("UA：Android 手机判定不对", els.output.value.slice(0, 240));

    // Android 平板**不带** Mobile —— 判定写反会把所有平板认成手机
    els.input.value = "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";
    els.input.fire("input");
    if (els.output.value.includes("tablet"))
      ok("UA：Android 平板（不带 Mobile）判成平板，不是手机");
    else bad("UA：Android 平板误判", els.output.value.slice(0, 240));

    // Safari 的版本号只在 Version/ 里，Chrome 系的版本在 Chrome/ 里 —— 别取错字段
    els.input.value = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";
    els.input.fire("input");
    const ios = els.output.value;
    if (ios.includes("Safari 17.2") && ios.includes("iOS 17.2"))
      ok("UA：iPhone Safari 的浏览器版本与系统版本都对（版本取自 Version/，系统取自 OS）");
    else bad("UA：iPhone 解析不对", ios.slice(0, 240));

    els.input.value = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0";
    els.input.fire("input");
    if (els.output.value.includes("Opera"))
      ok("UA：Opera（同样带 Chrome/）判成 Opera");
    else bad("UA：Opera 被误判", els.output.value.slice(0, 240));

    els.input.value = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
    els.input.fire("input");
    if (els.output.value.includes("yes") && els.status.textContent.includes("Googlebot"))
      ok("UA：Googlebot 被标成自动化客户端（并给出名字）");
    else bad("UA：爬虫没识别", els.output.value.slice(0, 200) + " || " + els.status.textContent);
  }
}

console.log("\n㉙ 第五批新工具的关键算法（SQL 格式化 · HTTP 头解读 · Cookie 解析）");
{
  const ui = (name) => { const j = JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/tools", name + ".json"), "utf8")); return j.en.ui; };
  const U = (n, extra) => Object.assign(readUi("en"), ui(n), extra || {});

  // ① SQL 格式化（词法优先 · 字符串保护 · 多词短语 · 缩进）
  {
    const { els } = loadTool("sql-format.js",
      ["input", "output", "status", "copy", "clear", "upper", "commas"], U("sql-format"), {});
    els.upper.checked = true; els.upper.fire("change");

    els.input.value = "select a, b from t where x = 1 and y = 2"; els.input.fire("input");
    const out = els.output.value;
    if (/^SELECT a, b$/m.test(out) && /^FROM t$/m.test(out) && /^WHERE x = 1$/m.test(out) && /^ {2}AND y = 2$/m.test(out))
      ok("SQL：子句各起一行、AND 缩进两级、关键字大写");
    else bad("SQL：基本排版不对", out.slice(0, 260));

    // ⚠️ 最重要的回归：字符串字面量里的是**数据**，动它就是改用户存的值
    els.input.value = "select * from t where name = 'select * from users'"; els.input.fire("input");
    const s = els.output.value;
    if (s.includes("'select * from users'") && !s.includes("'SELECT * FROM USERS'"))
      ok("SQL：字符串字面量里的关键字原样保留（先扫描再排版，不做文本替换）");
    else bad("SQL：字符串里的内容被改写了", s.slice(0, 240));

    els.input.value = "select a /* 这里的 from 是注释 */ from t -- 行尾也是注释"; els.input.fire("input");
    const c = els.output.value;
    if (c.includes("/* 这里的 from 是注释 */") && c.includes("-- 行尾也是注释"))
      ok("SQL：块注释与行注释都原样保留");
    else bad("SQL：注释被改动了", c.slice(0, 240));

    els.input.value = "select a from t group by a order by a desc"; els.input.fire("input");
    const g = els.output.value;
    if (/^GROUP BY a$/m.test(g) && /^ORDER BY a DESC$/m.test(g))
      ok("SQL：多词关键字（GROUP BY / ORDER BY）整体识别，不会被拆成两个词");
    else bad("SQL：多词关键字排版不对", g.slice(0, 240));

    els.upper.checked = false; els.upper.fire("change");
    if (!/SELECT/.test(els.output.value))
      ok("SQL：关掉大写选项后，关键字保持原样大小写");
    else bad("SQL：大写选项关不掉", els.output.value.slice(0, 200));
  }

  // ② HTTP 头解读（状态行 · 解读 · 安全体检 · 不认识的头照实说）
  {
    const { els } = loadTool("http-headers.js",
      ["input", "output", "status", "copy", "clear"], U("http-headers"), {});

    els.input.value = "HTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8\nCache-Control: max-age=3600\nServer: nginx";
    els.input.fire("input");
    const out = els.output.value;
    if (out.includes("HTTP/1.1 200 OK") && out.includes("Content-Type: text/html; charset=utf-8"))
      ok("HTTP 头：状态行与头字段原样保留");
    else bad("HTTP 头：解析丢了内容", out.slice(0, 240));

    if (/Content-Type[\s\S]{0,80}→/.test(out) && /Cache-Control[\s\S]{0,120}max-age/.test(out))
      ok("HTTP 头：每个头后面跟着解读（不是只把原文抄一遍）");
    else bad("HTTP 头：没给出解读", out.slice(0, 260));

    if (out.includes("missing strict-transport-security") && out.includes("heads up"))
      ok("HTTP 头：缺安全头被列出，Server 的信息泄露也被点出来");
    else bad("HTTP 头：安全检查没生效", out.slice(-320));

    els.input.value = "Strict-Transport-Security: max-age=31536000\nContent-Security-Policy: default-src 'self'\nX-Content-Type-Options: nosniff\nX-Frame-Options: DENY\nReferrer-Policy: no-referrer\nPermissions-Policy: geolocation=()";
    els.input.fire("input");
    if (els.output.value.includes("the key security headers are all present"))
      ok("HTTP 头：安全头齐全时给正面结论（不是永远报缺失）");
    else bad("HTTP 头：齐全时误报", els.output.value.slice(-260));

    els.input.value = "X-Custom-Weird: 1"; els.input.fire("input");
    if (els.output.value.includes("no explanation in the table"))
      ok("HTTP 头：不认识的头照实说没有解释（不编一个像样的说法）");
    else bad("HTTP 头：不认识的头给了假解释", els.output.value.slice(0, 200));

    els.input.value = "Set-Cookie: sid=abc; Path=/"; els.input.fire("input");
    const ck = els.output.value;
    if (ck.includes("without Secure") && ck.includes("without HttpOnly") && ck.includes("no SameSite"))
      ok("HTTP 头：Set-Cookie 缺 Secure / HttpOnly / SameSite 三条都被点出来");
    else bad("HTTP 头：Set-Cookie 属性检查不全", ck.slice(-300));
  }

  // ③ Cookie 解析（两种输入 · 属性体检 · SameSite=None 的坑）
  {
    const { els } = loadTool("cookie-parse.js",
      ["input", "output", "status", "copy", "clear"], U("cookie-parse"), {});

    els.input.value = "session=abc123; theme=dark; lang=zh-CN"; els.input.fire("input");
    const out = els.output.value;
    if (els.status.textContent.includes("3 cookies") && out.includes("session=abc123; theme=dark; lang=zh-CN"))
      ok("Cookie：Cookie 头被拆成清单，并能还原成可粘贴的请求头写法");
    else bad("Cookie：Cookie 头解析不对", out.slice(0, 260));

    els.input.value = "Set-Cookie: sid=xyz; Path=/; Max-Age=3600"; els.input.fire("input");
    const sc = els.output.value;
    if (sc.includes("has no Secure") && sc.includes("has no HttpOnly") && sc.includes("has no SameSite"))
      ok("Cookie：Set-Cookie 缺三个关键属性都被指出");
    else bad("Cookie：Set-Cookie 体检不全", sc.slice(-300));

    // SameSite=None 却没 Secure ⇒ 浏览器直接丢弃，这是「本地好使跨站就丢」的经典原因
    els.input.value = "Set-Cookie: sid=xyz; SameSite=None; HttpOnly"; els.input.fire("input");
    if (els.output.value.includes("SameSite=None without Secure"))
      ok("Cookie：SameSite=None 缺 Secure 的致命组合被单独指出");
    else bad("Cookie：None+无 Secure 没识别", els.output.value.slice(-260));

    els.input.value = "Set-Cookie: sid=xyz; Path=/; Secure; HttpOnly; SameSite=Lax"; els.input.fire("input");
    if (els.output.value.includes("no problems found"))
      ok("Cookie：属性齐全时给正面结论");
    else bad("Cookie：齐全时误报", els.output.value.slice(-260));

    els.input.value = "no-equals-sign"; els.input.fire("input");
    if (els.output.value.includes("no-equals-sign"))
      ok("Cookie：没有等号的片段不崩（照原样列出）");
    else bad("Cookie：异常输入处理不对", els.output.value.slice(0, 200));
  }
}

console.log("\n㉚ 第六批新工具的关键算法（Markdown 表格 · .env 解析 · URL 构造）");
{
  const ui = (name) => { const j = JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/tools", name + ".json"), "utf8")); return j.en.ui; };
  const U = (n, extra) => Object.assign(readUi("en"), ui(n), extra || {});

  // ① Markdown 表格（显示宽度 · 转义竖线 · CSV 输入 · 列数补齐）
  {
    const { els } = loadTool("md-table.js",
      ["input", "output", "status", "copy", "clear", "align"], U("md-table"), {});

    els.input.value = "| a | 中文 |\n|---|---|\n| b | x |"; els.input.fire("input");
    const out = els.output.value;
    /* ⚠️ 这条断言就是在测「显示宽度」：中文占 2 格，所以第二列宽 4。
       按字符数算的实现在这里会输出 `| b | x   |`（少一格），一测就露。 */
    if (/^\| a   \| 中文 \|$/m.test(out) && /^\| b   \| x    \|$/m.test(out))
      ok("md-table：列宽按显示宽度算（中文占 2 格），中英混排也能对齐");
    else bad("md-table：显示宽度对齐不对", out);

    // 格子里转义的竖线是内容：必须**原样带着 `\|` 出去**，还原成裸 | 会把表格撑坏
    els.input.value = "| a | b \\| c |\n|---|---|\n| 1 | 2 |"; els.input.fire("input");
    const esc = els.output.value;
    if (esc.split("\n")[0] === "| a   | b \\| c |")
      ok("md-table：格子里转义的竖线原样保留（还原成裸 | 会让表格多出一列）");
    else bad("md-table：转义竖线处理不对", esc);

    els.input.value = "name,note\ntool,\"has, comma\"\nother,plain"; els.input.fire("input");
    const csv = els.output.value;
    if (/^\| name\s+\| note\s+\|$/m.test(csv) && csv.includes("has, comma"))
      ok("md-table：CSV 输入识别引号包裹（引号里的逗号不算分隔）");
    else bad("md-table：CSV 解析不对", csv);

    els.input.value = "| a | b |\n|---|---|\n| 1 |"; els.input.fire("input");
    if (/^\| 1   \|     \|$/m.test(els.output.value))
      ok("md-table：短行自动补空列，生成的表格不会缺列");
    else bad("md-table：列数补齐不对", els.output.value);
  }

  // ② .env 解析（引号规则 · 跨行值 · 注释 · 四种输出）
  {
    const { els } = loadTool("env-parse.js",
      ["input", "output", "status", "copy", "clear", "format"], U("env-parse"), {});

    els.input.value = "# note\nA=1\nexport B=\"two\"\nC='three'\nD=multi   # tail comment";
    els.input.fire("input");
    const json = els.output.value;
    if (json.includes('"A": "1"') && json.includes('"B": "two"') && json.includes('"C": "three"') && json.includes('"D": "multi"'))
      ok(".env：export 前缀、单双引号、无引号值的行尾注释都解析正确");
    else bad(".env：基本解析不对", json.slice(0, 260));

    // 双引号里的转义与跨行：不处理跨行的话，多行证书会被截成半截
    els.input.value = "PEM=\"line1\nline2\"\nX=\"a\\tb\""; els.input.fire("input");
    const multi = JSON.parse(els.output.value);
    if (multi.PEM === "line1\nline2" && multi.X === "a\tb")
      ok(".env：双引号跨行值拼回一行、\\t 转义也认");
    else bad(".env：跨行或转义处理不对", els.output.value.slice(0, 200));

    // 单引号按 shell 规则：里面一切原样
    els.input.value = "R='a\\nb'"; els.input.fire("input");
    if (JSON.parse(els.output.value).R === "a\\nb")
      ok(".env：单引号内不做转义（shell 规则是原样）");
    else bad(".env：单引号被错误处理", els.output.value);

    els.format.value = "shell"; els.format.fire("change");
    els.input.value = "E=it's\nF=a b"; els.input.fire("input");
    const sh = els.output.value;
    if (sh.includes("export E='it'\\''s'") && sh.includes("export F='a b'"))
      ok(".env：shell 输出把单引号转义成 '\\'' （唯一可靠的写法）");
    else bad(".env：shell 引号转义不对", sh);

    els.format.value = "json"; els.format.fire("change");
    els.input.value = "not a valid line\nA=1"; els.input.fire("input");
    if (els.status.textContent.includes("1 lines skipped") || els.status.textContent.includes("skipped"))
      ok(".env：不是 KEY=VALUE 的行被跳过并如实报数（不是静默丢掉）");
    else bad(".env：坏行没有报数", els.status.textContent);
  }

  // ③ URL 构造（编码 · 已有参数原样 · 空格风格 · 锚点位置）
  {
    const { els } = loadTool("url-builder.js",
      ["input", "output", "status", "copy", "clear", "plus"], U("url-builder"), {});

    els.input.value = "https://example.com/s\nq=中文\npage=2"; els.input.fire("input");
    const first = els.output.value.split("\n")[0];
    if (first === "https://example.com/s?q=%E4%B8%AD%E6%96%87&page=2")
      ok("URL 构造：新参数被正确百分号编码（中文 → %E4%B8%AD%E6%96%87）");
    else bad("URL 构造：编码不对", first);

    // 值里的 & 不编码就会被拆成两个参数 —— 手拼 URL 最常翻的车
    els.input.value = "https://a.com/?x=1\ntags=a&b"; els.input.fire("input");
    const q = els.output.value.split("\n")[0];
    if (q === "https://a.com/?x=1&tags=a%26b")
      ok("URL 构造：值里的 & 被编码成 %26（否则它会被当成新参数的开始）");
    else bad("URL 构造：& 没编码", q);

    if (q.includes("x=1") && !q.includes("%3D1"))
      ok("URL 构造：原 URL 里已有的参数原样带过（重新编码会破坏签名与 + 的含义）");
    else bad("URL 构造：已有参数被改动了", q);

    els.plus.checked = true; els.plus.fire("change");
    els.input.value = "https://a.com/\nq=a b"; els.input.fire("input");
    if (els.output.value.split("\n")[0] === "https://a.com/?q=a+b")
      ok("URL 构造：空格编成 + 的表单风格开关生效");
    else bad("URL 构造：+ 风格没生效", els.output.value.split("\n")[0]);

    els.plus.checked = false; els.plus.fire("change");
    els.input.value = "https://a.com/page#sec\nq=1"; els.input.fire("input");
    if (els.output.value.split("\n")[0] === "https://a.com/page?q=1#sec")
      ok("URL 构造：锚点留在最后（查询串必须在 # 之前，顺序错了锚点会把参数吞掉）");
    else bad("URL 构造：锚点位置不对", els.output.value.split("\n")[0]);
  }
}

console.log("\n㉛ 第七批新工具的关键算法（CRC 校验和 · chmod 换算 · 字符级 diff）");
{
  const ui = (name) => { const j = JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/tools", name + ".json"), "utf8")); return j.en.ui; };
  const U = (n, extra) => Object.assign(readUi("en"), ui(n), extra || {});

  // ① CRC / Adler：打的是**公开的标准测试向量**，实现错了这里必崩
  {
    const { els } = loadTool("crc32.js",
      ["input", "output", "status", "copy", "clear", "hexmode"], U("crc32"), {});

    // "123456789" 是 CRC 界的标准测试串：CRC-32 = 0xCBF43926、CRC-32C = 0xE3069283
    els.input.value = "123456789"; els.input.fire("input");
    const out = els.output.value;
    if (out.includes("0xCBF43926"))
      ok("CRC：\"123456789\" 的 CRC-32 = 0xCBF43926（IEEE 标准测试向量）");
    else bad("CRC：CRC-32 结果不对", out.slice(0, 200));

    if (out.includes("0xE3069283"))
      ok("CRC：同串的 CRC-32C = 0xE3069283（Castagnoli 标准测试向量）");
    else bad("CRC：CRC-32C 结果不对", out.slice(0, 200));

    // Adler-32 的公认例子是 "Wikipedia" = 0x11E60398
    els.input.value = "Wikipedia"; els.input.fire("input");
    if (els.output.value.includes("0x11E60398"))
      ok("CRC：Adler-32(\"Wikipedia\") = 0x11E60398（zlib 的公认例子）");
    else bad("CRC：Adler-32 结果不对", els.output.value.slice(0, 200));

    // 中文按 UTF-8 编码：一个汉字 3 字节 —— 用 UTF-16 长度算就会少
    els.input.value = "中"; els.input.fire("input");
    if (/3 bytes/.test(els.output.value))
      ok("CRC：中文按 UTF-8 编码计算（一个汉字 3 字节，不是 UTF-16 的 2）");
    else bad("CRC：字节数不对", els.output.value.slice(0, 200));

    els.hexmode.checked = true; els.hexmode.fire("change");
    els.input.value = "de ad be ef"; els.input.fire("input");
    if (/4 bytes/.test(els.output.value) && /0x[0-9A-F]{8}/.test(els.output.value))
      ok("CRC：十六进制模式按字节解析（空格、大小写都能吃）");
    else bad("CRC：hex 模式不对", els.output.value.slice(0, 200));

    els.input.value = "dea"; els.input.fire("input");   // 奇数个十六进制字符
    if (els.output.value === "" && els.status.className.includes("err"))
      ok("CRC：奇数个十六进制字符直接报错（补一个猜测的半字节比拒绝更糟）");
    else bad("CRC：非法 hex 没拦住", els.status.textContent);
  }

  // ② chmod 换算（八进制 ⇄ 符号 · 特殊位大小写 · 反向 · 告警）
  {
    const { els } = loadTool("chmod-calc.js",
      ["input", "output", "status", "copy", "clear"], U("chmod-calc"), {});

    els.input.value = "755"; els.input.fire("input");
    if (els.output.value.includes("0755") && els.output.value.includes("rwxr-xr-x"))
      ok("chmod：755 → 0755 与 rwxr-xr-x");
    else bad("chmod：755 换算不对", els.output.value.slice(0, 200));

    // setuid 且有执行位 ⇒ 小写 s（真的生效）；无执行位 ⇒ 大写 S（记了但不生效）
    els.input.value = "4755"; els.input.fire("input");
    const suid = els.output.value;
    if (suid.includes("rwsr-xr-x") && suid.includes("setuid"))
      ok("chmod：4755 → rwsr-xr-x，并说明 setuid 的含义");
    else bad("chmod：setuid 处理不对", suid.slice(0, 260));

    els.input.value = "4644"; els.input.fire("input");
    if (els.output.value.includes("rwSr--r--"))
      ok("chmod：4644 → rwSr--r--（没有执行位时是大写 S，说明它其实不生效）");
    else bad("chmod：setuid 大写 S 规则不对", els.output.value.slice(0, 200));

    els.input.value = "1777"; els.input.fire("input");
    if (els.output.value.includes("rwxrwxrwt") && els.output.value.includes("sticky"))
      ok("chmod：1777 → rwxrwxrwt，sticky 位识别正确（/tmp 就是它）");
    else bad("chmod：sticky 处理不对", els.output.value.slice(0, 240));

    els.input.value = "rwxr-xr-x"; els.input.fire("input");
    if (els.output.value.includes("0755"))
      ok("chmod：符号 → 八进制的反算正确");
    else bad("chmod：反算不对", els.output.value.slice(0, 200));

    els.input.value = "-rwxr-xr-x"; els.input.fire("input");
    if (els.output.value.includes("0755"))
      ok("chmod：ls -l 的 10 位输出（带文件类型前缀）能直接贴");
    else bad("chmod：ls -l 前缀没处理", els.output.value.slice(0, 200));

    els.input.value = "777"; els.input.fire("input");
    if (els.output.value.includes("0777") && /⚠️/.test(els.output.value))
      ok("chmod：777 会给出风险提示（Web 目录 777 是典型的部署事故）");
    else bad("chmod：777 没有告警", els.output.value.slice(-220));

    els.input.value = "rwx"; els.input.fire("input");   // 只有 3 位，不是合法写法
    if (els.output.value === "" && els.status.className.includes("err"))
      ok("chmod：认不出的写法明确报错");
    else bad("chmod：非法输入没拦住", els.status.textContent);
  }

  // ③ 字符级 diff（LCS 回溯 · 前后缀裁剪 · 长度上限）
  {
    const { els } = loadTool("text-diff-char.js",
      ["input", "output", "status", "copy", "clear"], U("text-diff-char"), {});

    els.input.value = "abc\n===\naxc"; els.input.fire("input");
    const out = els.output.value;
    if (out.includes("a[-b-]{+x+}c"))
      ok("字符 diff：只标出真正改动的字符（a[-b-]{+x+}c），不是整段替换");
    else bad("字符 diff：标记不对", out.slice(0, 200));

    els.input.value = "同样的两段\n===\n同样的两段"; els.input.fire("input");
    if (els.status.textContent.includes("identical"))
      ok("字符 diff：两段完全相同时给正面结论");
    else bad("字符 diff：相同内容误报", els.status.textContent);

    els.input.value = "只有一段"; els.input.fire("input");
    if (els.output.value === "" && els.status.className.includes("err"))
      ok("字符 diff：缺 === 分隔时明确报错并说明怎么用");
    else bad("字符 diff：缺分隔符没报错", els.status.textContent);

    // LCS 是 O(n×m)：超长必须拒绝，不能让页面卡死
    const big = "a".repeat(4100);
    els.input.value = big + "X\n===\n" + big + "Y"; els.input.fire("input");
    if (els.output.value === "" && els.status.className.includes("err"))
      ok("字符 diff：超长输入明确拒绝（LCS 是 O(n×m)，不拒绝就会把页面卡住）");
    else bad("字符 diff：超长没拦住", els.status.textContent);

    // 前后缀裁剪：只在中间不同时也要算对
    els.input.value = "prefix-aaa-suffix\n===\nprefix-bbb-suffix"; els.input.fire("input");
    const trimmed = els.output.value;
    if (trimmed.includes("prefix-") && trimmed.includes("suffix") && /\[-aaa-\]\{\+bbb\+\}/.test(trimmed))
      ok("字符 diff：前后缀裁剪后仍然标得准确（长文里只有中段不同是常态）");
    else bad("字符 diff：裁剪逻辑有误", trimmed.slice(0, 240));
  }
}

console.log("\n㉜ 第八批新工具的关键算法（图片转 Base64 · 摩斯电码 · INI 解析）");
{
  const ui = (name) => { const j = JSON.parse(fs.readFileSync(path.join(ROOT, "src/i18n/tools", name + ".json"), "utf8")); return j.en.ui; };
  const U = (n, extra) => Object.assign(readUi("en"), ui(n), extra || {});

  // ① 图片 → Base64：只测两段纯算法（图片流程依赖 FileReader，Node 里没有）
  {
    const { sandbox } = loadTool("base64-image.js",
      ["picker", "drop", "results", "run", "clear", "mode"], U("base64-image"), {});
    const api = sandbox.window.TP_B64_IMAGE;

    if (api && api.b64Size(3) === 4 && api.b64Size(1) === 4 && api.b64Size(6) === 8)
      ok("图片 Base64：尺寸换算按「每 3 字节 → 4 字符」向上取整（+33% 的那个公式）");
    else bad("图片 Base64：尺寸换算不对", JSON.stringify(api && api.b64Size(3)));

    const uri = api.compose("image/png", "AAAA", "datauri");
    if (uri === "data:image/png;base64,AAAA")
      ok("图片 Base64：默认形态是完整 data URI");
    else bad("图片 Base64：data URI 拼装不对", uri);

    if (api.compose("image/png", "AAAA", "base64") === "AAAA" &&
        api.compose("image/png", "AAAA", "css") === 'background-image: url("data:image/png;base64,AAAA");' &&
        api.compose("image/png", "AAAA", "html") === '<img src="data:image/png;base64,AAAA" alt="">')
      ok("图片 Base64：纯 Base64 / CSS / img 标签三种形态都对");
    else bad("图片 Base64：其他形态拼装不对", api.compose("image/png", "AAAA", "css"));

    // MIME 缺失时不能拼出 "data:undefined;base64" 这种坏 URI
    if (api.compose("", "AAAA", "datauri") === "data:application/octet-stream;base64,AAAA")
      ok("图片 Base64：MIME 缺失时回落到 application/octet-stream");
    else bad("图片 Base64：MIME 兜底不对", api.compose("", "AAAA", "datauri"));
  }

  // ② 摩斯电码（编码 · 解码 · 词间距三种写法 · 非拉丁字符如实报告）
  {
    const { els } = loadTool("morse.js",
      ["input", "output", "status", "copy", "clear"], U("morse"), {});

    els.input.value = "SOS"; els.input.fire("input");
    if (els.output.value === "... --- ...")
      ok("摩斯：SOS 编成 ... --- ...（标准表）");
    else bad("摩斯：编码不对", els.output.value);

    // 词间距：字母之间空格、词之间 / —— 少了它整句会连成一个长单词
    els.input.value = "HI THERE"; els.input.fire("input");
    if (els.output.value === ".... .. / - .... . .-. .")
      ok("摩斯：词之间用 / 分隔（少了它就解成一个长单词，且看着还挺像对的）");
    else bad("摩斯：词间距不对", els.output.value);

    els.input.value = "... --- ..."; els.input.fire("input");
    if (els.output.value === "SOS")
      ok("摩斯：点划输入自动识别成解码方向");
    else bad("摩斯：解码不对", els.output.value);

    // 竖线与连续三空格也是现实中有人用的词分隔写法，两种都要认
    els.input.value = ".... .. | - .... . .-. ."; els.input.fire("input");
    const pipe = els.output.value;
    els.input.value = ".... ..   - .... . .-. ."; els.input.fire("input");
    if (pipe === "HI THERE" && els.output.value === "HI THERE")
      ok("摩斯：竖线与连续三个空格都当词分隔符");
    else bad("摩斯：分隔符兼容不全", pipe + " / " + els.output.value);

    // 中文在标准里没有对应码 —— 必须跳过并在状态里说出来，不能装作编出来了
    els.input.value = "你好"; els.input.fire("input");
    if (els.output.value === "" && els.status.className.includes("err") && els.status.textContent.includes("no code"))
      ok("摩斯：非拉丁字符如实报告「没有对应码」，不瞎编");
    else bad("摩斯：非拉丁字符处理不对", els.status.textContent + " | " + els.output.value);
  }

  // ③ INI 解析（段 · 行尾注释边界 · 重复键合并 · 类型开关）
  {
    const { els } = loadTool("ini-parse.js",
      ["input", "output", "status", "copy", "clear", "typed"], U("ini-parse"), {});

    els.input.value = "[server]\nhost = 127.0.0.1\nport = 8080\n\n[user]\nname = Ada"; els.input.fire("input");
    const d = JSON.parse(els.output.value);
    if (d.server.host === "127.0.0.1" && d.server.port === "8080" && d.user.name === "Ada")
      ok("INI：段与键值解析成嵌套 JSON");
    else bad("INI：基本解析不对", els.output.value.slice(0, 200));

    // ⚠️ 行尾注释要求前面有空白 —— 否则 #fff 这种颜色值会被吃掉尾巴
    els.input.value = "color = #fff   ; a comment\nother = value#1"; els.input.fire("input");
    const c = JSON.parse(els.output.value);
    if (c.color === "#fff" && c.other === "value#1")
      ok("INI：行尾注释要前面有空白才算 —— 颜色值 #fff 与 value#1 都保住了");
    else bad("INI：行尾注释边界不对", els.output.value.slice(0, 200));

    els.input.value = "mount = /a\nmount = /b"; els.input.fire("input");
    const m = JSON.parse(els.output.value);
    if (Array.isArray(m.mount) && m.mount.length === 2)
      ok("INI：重复键合并成数组（静默覆盖会丢数据）");
    else bad("INI：重复键处理不对", els.output.value.slice(0, 200));

    els.input.value = "count = 5\nratio = 1.5\non = true"; els.input.fire("input");
    const before = JSON.parse(els.output.value);
    els.typed.checked = true; els.typed.fire("change");
    const after = JSON.parse(els.output.value);
    if (before.count === "5" && after.count === 5 && after.on === true)
      ok("INI：类型开关默认关（保住 0755 这类前导零），打开后才转数字与布尔");
    else bad("INI：类型开关无效", JSON.stringify({ before: before.count, after: after.count }));

    els.input.value = "this line has no separator at all"; els.input.fire("input");
    if (els.output.value === "" && els.status.className.includes("err"))
      ok("INI：没有 = / : 的行被跳过，整份无效时明确报错");
    else bad("INI：坏输入处理不对", els.status.textContent);
  }
}

console.log(`\n结果：${pass} 项通过，${fail} 项失败`);
process.exit(fail ? 1 : 0);
