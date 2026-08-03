// Shared wordmark block for the profile SVG — ASCII figlet with a seeded
// noise-dissolve resolve. Deterministic: same seed -> same bands, so daily
// regeneration only changes the data lines below it.
//
// All animation is CSS baked into the SVG (fill-opacity, not opacity —
// Firefox doesn't apply opacity to tspans). Defaults are the resolved
// state, so renderers that never run animations show a clean static header.

// ANSI Shadow figlet, "Maximus Beato" — keep in sync with the tagline below.
const ROWS = [
  "███╗   ███╗ █████╗ ██╗  ██╗██╗███╗   ███╗██╗   ██╗███████╗    ██████╗ ███████╗ █████╗ ████████╗ ██████╗ ",
  "████╗ ████║██╔══██╗╚██╗██╔╝██║████╗ ████║██║   ██║██╔════╝    ██╔══██╗██╔════╝██╔══██╗╚══██╔══╝██╔═══██╗",
  "██╔████╔██║███████║ ╚███╔╝ ██║██╔████╔██║██║   ██║███████╗    ██████╔╝█████╗  ███████║   ██║   ██║   ██║",
  "██║╚██╔╝██║██╔══██║ ██╔██╗ ██║██║╚██╔╝██║██║   ██║╚════██║    ██╔══██╗██╔══╝  ██╔══██║   ██║   ██║   ██║",
  "██║ ╚═╝ ██║██║  ██║██╔╝ ██╗██║██║ ╚═╝ ██║╚██████╔╝███████║    ██████╔╝███████╗██║  ██║   ██║   ╚██████╔╝",
  "╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝     ╚═╝ ╚═════╝ ╚══════╝    ╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ",
];

const TAGLINE = "building tools for the agentic web — recense · tonos · jobfill";
const STATUS = "available for seed-stage roles ↗";

const SEED = 0x5eed;
const BAND = 5; // chars per resolve band — small enough to read as a wave, not chunks
const X = 42;
const Y0 = 102;
const LH = 16;

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const css = `    .n tspan { fill-opacity: 0; animation: off .22s ease-out both; }
    .f tspan { animation: on .22s ease-in both; }
    .n { animation: flick .22s steps(2, end) infinite; }
    .chrome { animation: chromeon .3s ease-out 1.72s both; }
    @keyframes off { from { fill-opacity: 1; } to { fill-opacity: 0; } }
    @keyframes on { from { fill-opacity: 0; } to { fill-opacity: 1; } }
    @keyframes flick { 50% { opacity: .72; } }
    @keyframes chromeon { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) {
      .n, .n tspan, .f tspan, .chrome { animation: none; }
    }`;

// Renders the wordmark + its corner chrome and taglines. Returns the SVG
// body (no <svg> wrapper) and the y where the block ends.
function render() {
  const rand = mulberry32(SEED);

  // Silhouette-preserving noise: glyph cells become ░▒▓, spaces stay spaces,
  // so the signal keeps its shape while it decrypts.
  const noisify = (s) => {
    let out = "";
    for (const ch of s) {
      if (ch === " ") {
        out += " ";
      } else {
        const r = rand();
        out += r < 0.35 ? "░" : r < 0.75 ? "▒" : "▓";
      }
    }
    return out;
  };

  const bands = (s) => {
    const out = [];
    for (let i = 0; i < s.length; i += BAND) out.push(s.slice(i, i + BAND));
    return out;
  };

  // Per-band resolve delays: a diagonal wave — left→right sweep with a slight
  // downward lag per row and just enough jitter to feel organic. Bands
  // cross-fade (see css) so the front reads as smooth. Settles by ~1.85s.
  const rowBands = ROWS.map((row, ri) =>
    bands(row).map((text, bi) => ({
      text,
      noise: noisify(text),
      delay: (0.25 + bi * 0.055 + ri * 0.045 + rand() * 0.06).toFixed(3),
    }))
  );

  const layer = (cls, fill, key) =>
    rowBands
      .map((chunks, ri) => {
        const tspans = chunks
          .map((b) => `<tspan style="animation-delay:${b.delay}s">${b[key]}</tspan>`)
          .join("");
        return `  <text class="${cls}" xml:space="preserve" x="${X}" y="${Y0 + ri * LH}" font-size="13" fill="${fill}">${tspans}</text>`;
      })
      .join("\n");

  const body = `  <!-- noise layer (resolves out band-by-band) -->
${layer("n", "#5b6470", "noise")}

  <!-- resolved wordmark -->
${layer("f", "#c9d1d9", "text")}

  <!-- corner chrome + taglines: appear once the signal locks -->
  <g class="chrome">
    <text x="40" y="34" font-size="11" letter-spacing="2" fill="#8b949e">◆ MAXIMUS BEATO</text>
    <text x="40" y="50" font-size="11" letter-spacing="2" fill="#4b5563">CTO · VERTIKALX</text>
    <text x="860" y="34" text-anchor="end" font-size="11" letter-spacing="2" fill="#4b5563">PURDUE CS ALUM</text>
    <text x="450" y="218" text-anchor="middle" font-size="12.5" letter-spacing="1" fill="#6b7280">${TAGLINE}</text>
    <text x="450" y="256" text-anchor="middle" font-size="12" letter-spacing="1" fill="#6b7280">${STATUS}</text>
  </g>`;

  return { css, body, bottomY: 256, bandCount: rowBands.flat().length };
}

module.exports = { render };
