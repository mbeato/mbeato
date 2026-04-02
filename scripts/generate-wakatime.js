const WAKATIME_JSON_URL = 'https://wakatime.com/share/@mbeato/b524563d-2ec4-4714-af31-e2f5794b903d.json';
const OUTPUT_PATH = 'assets/wakatime.svg';

async function fetchData() {
  const res = await fetch(WAKATIME_JSON_URL);
  const json = await res.json();
  return json.data;
}

function generateSVG(days) {
  const width = 500;
  const height = 180;
  const barAreaTop = 55;
  const barAreaBottom = 140;
  const barAreaHeight = barAreaBottom - barAreaTop;
  const barWidth = 42;
  const barGap = 16;
  const totalBarsWidth = days.length * barWidth + (days.length - 1) * barGap;
  const startX = (width - totalBarsWidth) / 2;

  // Find max hours for scaling (minimum 1hr so empty weeks don't break)
  const maxSeconds = Math.max(...days.map(d => d.grand_total.total_seconds), 3600);

  // Format day labels
  const dayLabels = days.map(d => {
    const date = new Date(d.range.date + 'T12:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);
  });

  // Total hours this week
  const totalSeconds = days.reduce((sum, d) => sum + d.grand_total.total_seconds, 0);
  const totalHrs = Math.floor(totalSeconds / 3600);
  const totalMins = Math.floor((totalSeconds % 3600) / 60);
  const totalText = totalHrs > 0 ? `${totalHrs}h ${totalMins}m` : `${totalMins}m`;

  // Build bars
  const bars = days.map((d, i) => {
    const x = startX + i * (barWidth + barGap);
    const seconds = d.grand_total.total_seconds;
    const ratio = seconds / maxSeconds;
    const barH = Math.max(ratio * barAreaHeight, seconds > 0 ? 4 : 0);
    const y = barAreaBottom - barH;

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const timeLabel = hrs > 0 ? `${hrs}h${mins > 0 ? mins + 'm' : ''}` : mins > 0 ? `${mins}m` : '';

    // Gradient color based on intensity
    const intensity = ratio;
    const r = Math.round(79 + intensity * (129 - 79));  // #4f46e5 -> #818cf8
    const g = Math.round(70 + intensity * (140 - 70));
    const b = Math.round(229 + intensity * (248 - 229));
    const color = `rgb(${r},${g},${b})`;

    return { x, y, barH, timeLabel, dayLabel: dayLabels[i], color, seconds };
  });

  const barElements = bars.map(b => {
    const timeText = b.timeLabel
      ? `<text x="${b.x + barWidth / 2}" y="${b.y - 6}" text-anchor="middle"
          font-family="'SF Mono', 'Fira Code', monospace" font-size="9" fill="#8b8b9e">${b.timeLabel}</text>`
      : '';

    const barRect = b.seconds > 0
      ? `<rect x="${b.x}" y="${b.y}" width="${barWidth}" height="${b.barH}" rx="4" fill="${b.color}" opacity="0.85"/>`
      : `<rect x="${b.x}" y="${barAreaBottom - 2}" width="${barWidth}" height="2" rx="1" fill="#1e1e2e" opacity="0.5"/>`;

    return `
    ${timeText}
    ${barRect}
    <text x="${b.x + barWidth / 2}" y="${barAreaBottom + 16}" text-anchor="middle"
      font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="10" fill="#5a5a6e">${b.dayLabel}</text>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#0a0a14"/>
    </linearGradient>
  </defs>

  <rect width="${width}" height="${height}" rx="8" fill="url(#bgGrad)"/>
  <rect width="${width}" height="${height}" rx="8" fill="none" stroke="#1e1e2e" stroke-width="1"/>

  <text x="24" y="30" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="12" fill="#8b8b9e" letter-spacing="0.5">this week</text>
  <text x="${width - 24}" y="30" text-anchor="end" font-family="'SF Mono', 'Fira Code', monospace" font-size="13" fill="#f0f0f5" font-weight="600">${totalText}</text>

  <line x1="24" y1="42" x2="${width - 24}" y2="42" stroke="#1e1e2e" stroke-width="0.5"/>

  ${barElements}
</svg>`;
}

async function main() {
  const days = await fetchData();
  const svg = generateSVG(days);
  const fs = await import('fs');
  const path = await import('path');
  const outPath = path.join(process.cwd(), OUTPUT_PATH);
  fs.writeFileSync(outPath, svg);
  console.log(`Generated ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
