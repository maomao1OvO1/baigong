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
    style: {}, dataset: {}, checked: false,
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
function loadTool(scriptFile, ids, strings, defaults = {}) {
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
    document: doc,
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    isSecureContext: true,
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

console.log(`\n结果：${pass} 项通过，${fail} 项失败`);
process.exit(fail ? 1 : 0);
