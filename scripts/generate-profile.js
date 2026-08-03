#!/usr/bin/env node
// Generates assets/profile.svg — one seamless panel: the animated wordmark
// (scripts/wordmark.js) with a systemctl-style status readout under it,
// per-unit numbers pulled live from the GitHub GraphQL API. Unit list,
// blurbs, and the modules line live in services.json.
//
//   GITHUB_TOKEN=... node scripts/generate-profile.js

const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const wordmark = require("./wordmark");

const OWNER = "mbeato";
const WAKATIME_JSON_URL = "https://wakatime.com/share/@mbeato/b524563d-2ec4-4714-af31-e2f5794b903d.json";
const config = JSON.parse(readFileSync(join(__dirname, "..", "services.json"), "utf8"));

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN is required");
  process.exit(1);
}

const apiUnits = config.units.filter((u) => u.repo);

async function fetchData() {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const repoFields = apiUnits
    .map(
      (u, i) => `r${i}: repository(owner: "${OWNER}", name: "${u.repo}") {
        stargazerCount
        createdAt
        pushedAt
        primaryLanguage { name }
        defaultBranchRef { target { ... on Commit { history(since: "${since}") { totalCount } } } }
      }`
    )
    .join("\n");
  const query = `query {
    user(login: "${OWNER}") {
      repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC) {
        totalCount
        nodes { stargazerCount }
      }
    }
    ${repoFields}
  }`;

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// Public share JSON, no auth. A failed fetch skips the section rather than
// breaking the daily panel regen.
async function fetchWakatime() {
  const res = await fetch(WAKATIME_JSON_URL);
  if (!res.ok) throw new Error(`wakatime ${res.status}`);
  return (await res.json()).data;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ym = (iso) => iso.slice(0, 7);

const C = {
  bg: "#08080b",
  fg: "#c9d1d9",
  dim: "#4b5563",
  mid: "#8b949e",
  faint: "#6b7280",
  green: "#3fb950",
};

async function main() {
  const data = await fetchData();
  const stats = {};
  apiUnits.forEach((u, i) => {
    const r = data[`r${i}`];
    stats[u.unit] = {
      stars: r.stargazerCount,
      created: ym(r.createdAt),
      lang: r.primaryLanguage ? r.primaryLanguage.name : null,
      commits30d: r.defaultBranchRef ? r.defaultBranchRef.target.history.totalCount : 0,
    };
  });
  const totalRepos = data.user.repositories.totalCount;
  const commits30d = Object.values(stats).reduce((n, s) => n + s.commits30d, 0);

  const wm = wordmark.render();
  const OFF = 272; // services section starts below the wordmark block

  const X = 42;
  const LH = 18;
  let y = 76 + OFF;
  const lines = [];
  const line = (segs, dy) => {
    y += dy;
    lines.push({ y, segs });
  };

  for (const u of config.units.filter((v) => v.status === "active")) {
    const s = stats[u.unit];
    const name = `${u.unit}.service`.padEnd(30);
    const right = u.repo ? `since ${s.created}` : (u.meta || "");
    line(
      [
        { t: "● ", f: C.green },
        { t: name, f: C.fg },
        { t: "active (running)".padEnd(20), f: C.green },
        { t: right, f: C.dim },
      ],
      LH
    );
    const parts = [u.blurb];
    if (u.repo) {
      if (s.lang) parts.push(s.lang);
      parts.push(`${s.commits30d} commits/30d`);
      if (s.stars >= 10) parts.push(`★ ${s.stars}`);
    }
    line(
      [
        { t: "     └─ ", f: C.dim },
        { t: parts.join(" · "), f: C.mid },
      ],
      LH
    );
    y += 7;
  }

  y += 4;
  for (const u of config.units.filter((v) => v.status === "shipped")) {
    line(
      [
        { t: "○ ", f: C.dim },
        { t: `${u.unit}.service`.padEnd(30), f: C.mid },
        { t: "inactive (shipped)".padEnd(20), f: C.dim },
        { t: u.blurb, f: C.dim },
      ],
      LH + 1
    );
  }

  y += 14;
  const mods = config.modules;
  const half = Math.ceil(mods.length / 2);
  line(
    [
      { t: "Loaded modules: ", f: C.mid },
      { t: mods.slice(0, half).join(" · "), f: C.faint },
    ],
    LH
  );
  line(
    [
      { t: "                ", f: C.mid },
      { t: mods.slice(half).join(" · "), f: C.faint },
    ],
    LH
  );

  let waka = null;
  try {
    waka = await fetchWakatime();
  } catch (e) {
    console.warn(`wakatime fetch failed, skipping section: ${e.message}`);
  }

  let wakaSvg = "";
  if (waka && waka.length) {
    const divY = y + 26;
    const chromeY = divY + 24;
    const barTop = chromeY + 24;
    const barBottom = barTop + 76;
    const barW = 72;
    const gap = (816 - 7 * barW) / 6;
    const maxSec = Math.max(...waka.map((d) => d.grand_total.total_seconds), 3600);
    const totalSec = waka.reduce((n, d) => n + d.grand_total.total_seconds, 0);
    const fmt = (sec) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    const bars = waka
      .map((d, i) => {
        const x = X + i * (barW + gap);
        const sec = d.grand_total.total_seconds;
        const ratio = sec / maxSec;
        const h = Math.max(ratio * (barBottom - barTop), sec > 0 ? 3 : 0);
        // intensity maps slate -> active green, same semantics as the units
        const mix = (a, b) => Math.round(a + ratio * (b - a));
        const fill = sec > 0 ? `rgb(${mix(33, 63)},${mix(38, 185)},${mix(45, 80)})` : "#1c2128";
        const rect =
          sec > 0
            ? `<rect x="${x}" y="${(barBottom - h).toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" rx="1" fill="${fill}" opacity="0.9"/>`
            : `<rect x="${x}" y="${barBottom - 2}" width="${barW}" height="2" rx="1" fill="${fill}"/>`;
        const time = sec > 0
          ? `<text x="${x + barW / 2}" y="${(barBottom - h - 7).toFixed(1)}" text-anchor="middle" font-size="10" fill="${C.mid}">${fmt(sec)}</text>`
          : "";
        const day = new Date(d.range.date + "T12:00:00")
          .toLocaleDateString("en-US", { weekday: "short" })
          .toUpperCase();
        const label = `<text x="${x + barW / 2}" y="${barBottom + 18}" text-anchor="middle" font-size="10" letter-spacing="1" fill="${C.dim}">${day}</text>`;
        return `    ${rect}\n    ${time}\n    ${label}`;
      })
      .join("\n");

    wakaSvg = `
    <line x1="40" y1="${divY}" x2="860" y2="${divY}" stroke="#1f242c" stroke-width="1"/>
    <text x="40" y="${chromeY}" font-size="11" letter-spacing="2" fill="${C.mid}">◆ THIS WEEK</text>
    <text x="126" y="${chromeY}" font-size="11" letter-spacing="2" fill="${C.dim}"> — WAKATIME</text>
    <text x="860" y="${chromeY}" text-anchor="end" font-size="11" letter-spacing="2" fill="${C.dim}">TOTAL ${fmt(totalSec).toUpperCase()}</text>
${bars}`;
    y = barBottom + 18;
  }

  const footerY = y + 34;
  const height = footerY + 22;
  const updated = new Date().toISOString().slice(0, 10);

  const textLines = lines
    .map(({ y, segs }) => {
      const tspans = segs.map((s) => `<tspan fill="${s.f}">${esc(s.t)}</tspan>`).join("");
      return `    <text xml:space="preserve" x="${X}" y="${y}" font-size="13">${tspans}</text>`;
    })
    .join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 ${height}" width="900" height="${height}" font-family="ui-monospace, 'SF Mono', Menlo, Monaco, monospace">
  <!-- Generated by scripts/generate-profile.js — data from the GitHub GraphQL API. Edit services.json / scripts/wordmark.js, not this file. -->
  <style>
${wm.css}
  </style>
  <rect width="900" height="${height}" fill="${C.bg}"/>

${wm.body}

  <!-- status readout: fades up with the chrome once the signal locks -->
  <g class="chrome">
    <line x1="40" y1="${OFF + 10}" x2="860" y2="${OFF + 10}" stroke="#1f242c" stroke-width="1"/>
    <text x="40" y="${34 + OFF}" font-size="11" letter-spacing="2" fill="${C.mid}">◆ SERVICES</text>
    <text x="118" y="${34 + OFF}" font-size="11" letter-spacing="2" fill="${C.dim}"> — LIVE FROM THE GITHUB API</text>
    <text x="860" y="${34 + OFF}" text-anchor="end" font-size="11" letter-spacing="2" fill="${C.dim}">UPDATED ${updated} · DAILY</text>

${textLines}
${wakaSvg}
    <text x="450" y="${footerY}" text-anchor="middle" font-size="11" letter-spacing="1" fill="${C.dim}">${totalRepos} public repos · ${commits30d} commits across tracked units in the last 30 days</text>
  </g>
</svg>
`;

  const out = join(__dirname, "..", "assets", "profile.svg");
  writeFileSync(out, svg);
  console.log(`wrote ${out} (${height}px tall, ${config.units.length} units, ${wm.bandCount} bands)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
