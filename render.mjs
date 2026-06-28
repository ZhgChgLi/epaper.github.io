// 在 GitHub Actions 裡算出「照片 + iOS 鎖屏風日期/星期」的 PNG，輸出 frame.png。
// 由 GitHub Pages 提供，Kobo 直接抓。Node 18+（有內建 fetch）。

import { readFile, writeFile } from "node:fs/promises";
import satori from "satori";
import { html as toVDom } from "satori-html";
import { Resvg } from "@resvg/resvg-js";

const TZ = process.env.TZ || "Asia/Taipei";
const WIDTH = parseInt(process.env.WIDTH || "1072", 10);
const HEIGHT = parseInt(process.env.HEIGHT || "1448", 10);
const OUT = process.env.OUT || "frame.png";
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

const WEEKDAY_FULL = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
// 讓 Google Fonts 回 truetype（satori 不吃 woff2）
const TTF_UA = "Mozilla/5.0 (Linux; Android 4.4; Nexus 5) AppleWebKit/537.36";

function dateParts(now) {
  const fNum = (opt) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...opt }).format(now);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);
  const wdIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return {
    month: fNum({ month: "numeric" }),
    day: fNum({ day: "numeric" }),
    weekday: WEEKDAY_FULL[wdIdx] ?? "",
  };
}

async function fetchFontTtf(family, weight, text) {
  const url =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}` +
    `&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url, { headers: { "User-Agent": TTF_UA } })).text();
  const m =
    css.match(/url\((https:\/\/[^)]+)\)\s*format\(['"]truetype['"]\)/i) ||
    css.match(/src:\s*url\((https:\/\/[^)]+)\)/i);
  if (!m) throw new Error(`no ttf url for ${family}:${weight}`);
  const buf = await (await fetch(m[1], { headers: { "User-Agent": TTF_UA } })).arrayBuffer();
  return Buffer.from(buf);
}

async function pickPhoto() {
  const list = JSON.parse(await readFile(new URL("./photos.json", import.meta.url), "utf8"));
  if (!Array.isArray(list) || !list.length) throw new Error("photos.json is empty");
  const idx = Math.floor(Date.now() / TWELVE_HOURS_MS) % list.length;
  const url = list[idx];
  const res = await fetch(url, { headers: { "User-Agent": "kobo-photoframe/1.0" } });
  if (!res.ok) throw new Error(`photo fetch ${res.status} ${url}`);
  const mime = res.headers.get("content-type") || "image/jpeg";
  const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  console.log(`photo ${idx + 1}/${list.length}: ${url}`);
  return `data:${mime};base64,${b64}`;
}

function buildHtml(dataUrl, p) {
  const ff = "Noto Sans TC";
  const shadow = "text-shadow:0 3px 14px rgba(0,0,0,0.85),0 1px 3px rgba(0,0,0,0.9)";
  return `
  <div style="display:flex;position:relative;width:${WIDTH}px;height:${HEIGHT}px;background:#000;font-family:'${ff}';">
    <img src="${dataUrl}" width="${WIDTH}" height="${HEIGHT}" style="width:${WIDTH}px;height:${HEIGHT}px;object-fit:cover;" />
    <div style="display:flex;position:absolute;top:0;left:0;width:${WIDTH}px;height:420px;background:linear-gradient(180deg,rgba(0,0,0,0.6) 0%,rgba(0,0,0,0.25) 55%,rgba(0,0,0,0) 100%);"></div>
    <div style="display:flex;flex-direction:column;align-items:center;position:absolute;top:84px;left:0;width:${WIDTH}px;">
      <div style="display:flex;font-size:54px;font-weight:400;color:#fff;${shadow};">${p.weekday}</div>
      <div style="display:flex;font-size:132px;font-weight:700;color:#fff;line-height:1.05;margin-top:6px;${shadow};">${p.month}月${p.day}日</div>
    </div>
  </div>`
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .replace(/<div style="/g, '<div style="display:flex;')
    .trim();
}

async function main() {
  const p = dateParts(new Date());
  const dataUrl = await pickPhoto();
  const html = buildHtml(dataUrl, p);

  const text = p.weekday + p.month + p.day + "月日0123456789";
  const [r400, r700] = await Promise.all([
    fetchFontTtf("Noto Sans TC", 400, text),
    fetchFontTtf("Noto Sans TC", 700, text),
  ]);

  const svg = await satori(toVDom(html), {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: "Noto Sans TC", data: r400, weight: 400, style: "normal" },
      { name: "Noto Sans TC", data: r700, weight: 700, style: "normal" },
    ],
  });

  const png = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render().asPng();
  await writeFile(OUT, png);
  console.log(`wrote ${OUT} (${png.length} bytes, ${WIDTH}x${HEIGHT})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
