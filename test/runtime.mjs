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
    Promise, TextEncoder, TextDecoder, Uint8Array, Math, JSON, String, Number, parseFloat, parseInt, isFinite, Object, Array, Date, RegExp, Error, Set, Map,
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
  if (/Seconds\s+1000000000/.test(els.output.value)) ok("往返自洽：1000000000 秒 → 本地时间 → 回到 1000000000 秒");
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
  els.run.click();
  if (els.output.value !== pw) ok("两次生成结果不同（真随机，不是写死的）"); else bad("两次结果相同，随机性可疑");
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
  for (let i = 0; i < 50 && calls.length === 0; i++) await new Promise((r) => setImmediate(r));
  if (calls.length === 1) ok("点「确认」后发出且仅发出 1 次请求");
  else bad("确认后的请求次数不对：" + calls.length);
  const url = calls[0] || "";
  if (/^https:\/\/api\.pwnedpasswords\.com\/range\/[0-9A-F]{5}$/.test(url))
    ok("请求 URL 合规（只含 SHA-1 前 5 位）：" + url);
  else bad("URL 不合规（可能泄露了更多信息）", url);
  if (url.length > 0 && els.input.value.indexOf(url.slice(-5)) === -1)
    ok("URL 里的 5 位片段不是明文密码的一部分（是哈希，不是密码）");
  for (let i = 0; i < 50 && !els.pwnResult.textContent; i++) await new Promise((r) => setImmediate(r));
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

console.log(`\n结果：${pass} 项通过，${fail} 项失败`);
process.exit(fail ? 1 : 0);
