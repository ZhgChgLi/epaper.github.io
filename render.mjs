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
const ROTATE_MS = 60 * 60 * 1000; // 每 1 小時換一張
const LAT = process.env.LAT || "25.0330";   // 台北（可用環境變數覆蓋）
const LON = process.env.LON || "121.5654";

const WEEKDAY_FULL = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
// 讓 Google Fonts 回 truetype（satori 不吃 woff2）
const TTF_UA = "Mozilla/5.0 (Linux; Android 4.4; Nexus 5) AppleWebKit/537.36";

// WMO 天氣代碼 → 中文（給字體子集化用，下方 WEATHER_VOCAB 需涵蓋這些字）
const WMO = {
  0: "晴", 1: "晴時多雲", 2: "多雲", 3: "陰", 45: "霧", 48: "霧",
  51: "毛毛雨", 53: "小雨", 55: "雨", 56: "凍雨", 57: "凍雨",
  61: "小雨", 63: "中雨", 65: "大雨", 66: "凍雨", 67: "凍雨",
  71: "小雪", 73: "中雪", 75: "大雪", 77: "霰",
  80: "陣雨", 81: "陣雨", 82: "強陣雨", 85: "陣雪", 86: "強陣雪",
  95: "雷雨", 96: "雷雨", 99: "雷雨",
};
const WEATHER_VOCAB = "晴時多雲陰霧毛小中大雨雪陣強雷凍霰最高低降機率目前後小";

// Open-Meteo（免金鑰）：目前溫度/天氣 + 今日高低溫 + 近三小時降雨機率
async function fetchWeather() {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&current=temperature_2m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min` +
    `&hourly=precipitation_probability` +
    `&timezone=${encodeURIComponent(TZ)}&forecast_days=2`;
  const j = await (await fetch(url)).json();

  // 找出「目前這個整點」在 hourly 的索引，取之後三小時
  const now = new Date();
  const dstr = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const hstr = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(now).padStart(2, "0");
  const key = `${dstr}T${hstr}`; // 例如 2026-06-29T13
  const times = j.hourly?.time || [];
  let idx = times.findIndex((t) => t.startsWith(key));
  if (idx < 0) idx = 0;
  // 目前 / 3 / 6 / 12 小時後
  const offsets = [
    { off: 0, label: "目前" },
    { off: 3, label: "3小時後" },
    { off: 6, label: "6小時後" },
    { off: 12, label: "12小時後" },
  ];
  const rain = [];
  for (const o of offsets) {
    const i = idx + o.off;
    if (i < times.length) {
      rain.push({ label: o.label, pop: j.hourly.precipitation_probability?.[i] ?? 0 });
    }
  }

  return {
    temp: Math.round(j.current.temperature_2m),
    cond: WMO[j.current.weather_code] ?? "",
    hi: Math.round(j.daily.temperature_2m_max[0]),
    lo: Math.round(j.daily.temperature_2m_min[0]),
    rain,
  };
}

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
  const idx = Math.floor(Date.now() / ROTATE_MS) % list.length;
  const url = list[idx];
  const res = await fetch(url, { headers: { "User-Agent": "kobo-photoframe/1.0" } });
  if (!res.ok) throw new Error(`photo fetch ${res.status} ${url}`);
  const mime = res.headers.get("content-type") || "image/jpeg";
  const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  console.log(`photo ${idx + 1}/${list.length}: ${url}`);
  return `data:${mime};base64,${b64}`;
}

function buildHtml(dataUrl, p, w) {
  const ff = "Noto Sans TC";
  const shadow = "text-shadow:0 3px 14px rgba(0,0,0,0.85),0 1px 3px rgba(0,0,0,0.9)";
  // 日期下方的天氣行（抓不到天氣就不顯示）
  const weatherLine = w
    ? `<div style="display:flex;align-items:center;font-size:46px;font-weight:400;color:#fff;margin-top:18px;${shadow};">${w.cond} ${w.temp}°   最高 ${w.hi}° 最低 ${w.lo}°</div>`
    : "";
  let rainLine = "";
  if (w && w.rain && w.rain.length) {
    const now = w.rain[0];
    const rest = w.rain.slice(1);
    rainLine =
      `<div style="display:flex;align-items:center;font-size:40px;font-weight:400;color:#fff;margin-top:12px;${shadow};">降雨機率 ${now.label} ${now.pop}%</div>` +
      `<div style="display:flex;align-items:center;font-size:36px;font-weight:400;color:#fff;margin-top:6px;${shadow};">${rest.map((r) => `${r.label} ${r.pop}%`).join("   ")}</div>`;
  }
  return `
  <div style="display:flex;position:relative;width:${WIDTH}px;height:${HEIGHT}px;background:#000;font-family:'${ff}';">
    <img src="${dataUrl}" width="${WIDTH}" height="${HEIGHT}" style="width:${WIDTH}px;height:${HEIGHT}px;object-fit:cover;" />
    <div style="display:flex;position:absolute;top:0;left:0;width:${WIDTH}px;height:600px;background:linear-gradient(180deg,rgba(0,0,0,0.62) 0%,rgba(0,0,0,0.32) 60%,rgba(0,0,0,0) 100%);"></div>
    <div style="display:flex;flex-direction:column;align-items:center;position:absolute;top:84px;left:0;width:${WIDTH}px;">
      <div style="display:flex;font-size:54px;font-weight:400;color:#fff;${shadow};">${p.weekday}</div>
      <div style="display:flex;font-size:132px;font-weight:700;color:#fff;line-height:1.05;margin-top:6px;${shadow};">${p.month}月${p.day}日</div>
      ${weatherLine}
      ${rainLine}
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
  const w = await fetchWeather().catch((e) => {
    console.error("weather failed:", e.message);
    return null;
  });
  if (w) console.log(`weather: ${w.cond} ${w.temp}° (${w.hi}/${w.lo})`);
  const html = buildHtml(dataUrl, p, w);

  const text = p.weekday + p.month + p.day + "月日最高低°% 0123456789" + WEATHER_VOCAB + (w ? w.cond : "");
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
