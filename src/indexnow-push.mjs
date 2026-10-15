#!/usr/bin/env node
/* ============================================================================
   文件：src/indexnow-push.mjs —— 把站点 URL 推送给 IndexNow（小鲸 · 2026-10-15）
   干什么：
     读 sitemap.xml → 提取全部 URL → 一次性提交给 IndexNow，
     让 Bing / Yandex / Seznam 等引擎**当天就知道**有新页面、或哪些页面更新了。
   为什么需要它：
     IndexNow 是"主动敲门"的接口 —— 不推的话，引擎只能按自己的节奏来抓（几天到几周）。
     以前是手工 curl 提交（2026-10-14 做过两次），现在做成脚本，发版后跑一条命令即可。
   ⚠️ 重要边界（别搞错，也别对毛毛承诺错）：
     **Google 不参与 IndexNow** —— 主流引擎里只有它没接这个接口。
     Google 的新页面收录只有两条路：
       ① sitemap 被定期重抓（几天 ~ 几周，慢）
       ② 在 Google Search Console 手动「请求编入索引」（1 ~ 3 天，快，但要人工点）
   用法：
     node src/indexnow-push.mjs            # 正常提交
     node src/indexnow-push.mjs --dry      # 只打印将提交的 URL，不发请求
     node src/indexnow-push.mjs --limit 5  # 只提交前 5 条（调试用）
   返回码：0 = 被接受（HTTP 200/202）；非 0 = 失败（便于接进 shell 流水线）。
   ============================================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));   // 仓库根目录
const SITEMAP = path.join(ROOT, "sitemap.xml");
const ENDPOINT = "https://api.indexnow.org/indexnow";

/* ── 命令行参数：只认这三件事，别的忽略 ── */
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  if (i === -1) return 0;
  const n = parseInt(args[i + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
})();

/* ── 1. 找 IndexNow 的 key 文件 ──
   key 文件名形如「32 位十六进制.txt」，内容就是 key 本身。
   它必须**能被公网访问到**（engine 会去校验），所以这个文件是站点的一部分、不能删。
   为什么用"扫目录"而不是写死文件名：换 key 时只改文件、脚本不用动。 */
const keyFile = fs.readdirSync(ROOT).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
if (!keyFile) {
  console.error("✗ 没找到 IndexNow 的 key 文件（形如 32 位十六进制.txt）。");
  console.error("  它应当在仓库根目录，且能被线上直接访问：https://站点/<key>.txt");
  process.exit(2);
}
const KEY = fs.readFileSync(path.join(ROOT, keyFile), "utf8").trim();
const HOST = (() => {
  // 优先从 CNAME 读站点域名（仓库里那个 CNAME 文件就是自定义域名的权威来源）
  const cname = path.join(ROOT, "CNAME");
  if (fs.existsSync(cname)) return fs.readFileSync(cname, "utf8").trim();
  return "tools.maomaowang.top";
})();

/* ── 2. 从 sitemap.xml 取 URL ── */
if (!fs.existsSync(SITEMAP)) {
  console.error("✗ 没找到 sitemap.xml —— 先跑 `node src/build.mjs` 生成它。");
  process.exit(2);
}
let urls = [...fs.readFileSync(SITEMAP, "utf8").matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
  .map((m) => m[1]);
if (LIMIT) urls = urls.slice(0, LIMIT);

console.log("站点：%s", HOST);
console.log("key：%s（来自 %s）", KEY.slice(0, 8) + "…", keyFile);
console.log("待提交 URL：%d 条", urls.length);

if (DRY) {
  console.log("\n--dry：只打印，不发请求 ——");
  urls.forEach((u, i) => console.log("  %s %s", String(i + 1).padStart(3), u));
  process.exit(0);
}

/* ── 3. 提交 ──
   IndexNow 要求 urlList 里的 URL 必须与 host 一致（踩过：2026-10-14 首次提交主站时
   sitemap 里是 github.io 域名、host 写的是自定义域，返回 422）—— 这里先自检一遍。 */
const offHost = urls.filter((u) => {
  try {
    return new URL(u).host !== HOST;
  } catch {
    return true;
  }
});
if (offHost.length) {
  console.error("✗ 有 %d 条 URL 与本站域名（%s）不一致，IndexNow 会拒绝整批提交：", offHost.length, HOST);
  offHost.slice(0, 5).forEach((u) => console.error("    %s", u));
  process.exit(3);
}

const payload = {
  host: HOST,
  key: KEY,
  keyLocation: `https://${HOST}/${keyFile}`,
  urlList: urls,
};

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload),
});

/* 200 = 已接受；202 = 已接受但 key 还在校验中；其余都是失败 */
if (res.status === 200 || res.status === 202) {
  console.log("✓ IndexNow 已接受（HTTP %d）· %d 条 URL 已通知 Bing / Yandex 等引擎", res.status, urls.length);
  console.log("  提醒：Google 不参与 IndexNow —— 它那边要在 Search Console 手动「请求编入索引」。");
  process.exit(0);
} else {
  const text = await res.text().catch(() => "");
  console.error("✗ IndexNow 提交失败：HTTP %d", res.status);
  console.error("  %s", text.slice(0, 400));
  process.exit(1);
}
