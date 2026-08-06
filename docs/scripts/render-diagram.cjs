const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const input = process.argv[2];
const out = process.argv[3];
const chromeBin = process.argv[4] || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MERMAID_JS = '/Users/fortune/Documents/Workflows/nibgate-repo/node_modules/.pnpm/mermaid@11.16.0/node_modules/mermaid/dist/mermaid.min.js';
const FONT_DIR = path.join(__dirname, '..', 'public', 'fonts');

const DARK = process.env.DIAGRAM_DARK === '1';
const BG = DARK ? '#171813' : '#f4f4f0';
const TEXT = DARK ? '#e8f2e6' : '#000000';
const LEGACY_HEADER = Number(process.env.DIAGRAM_HEADER || 0);
const TOP = Number(process.env.DIAGRAM_TOP || (LEGACY_HEADER || 200));
const BOTTOM = Number(process.env.DIAGRAM_BOTTOM || (LEGACY_HEADER || 80));
const SIDE = Number(process.env.DIAGRAM_SIDE || 80);
const ACTOR_MARGIN = Number(process.env.DIAGRAM_ACTOR_MARGIN || 150);
const FONT_SIZE = Number(process.env.DIAGRAM_FONT_SIZE || 30);
const TITLE_SIZE = Number(process.env.DIAGRAM_TITLE_SIZE || 70);
const TITLE = process.env.DIAGRAM_TITLE || 'Nibgate Flow at a Glance';
const TITLE_FONT = 'Kumbh Sans, ABC Favorit, Arial, sans-serif';

const fontFace = [
  ['Kumbh Sans', 'kumbh/KumbhSans-Regular.woff2', 400],
  ['Kumbh Sans', 'kumbh/KumbhSans-SemiBold.woff2', 600],
  ['Kumbh Sans', 'kumbh/KumbhSans-Bold.woff2', 700],
  ['ABC Favorit', 'ABCFavorit-Regular.woff2', 400],
  ['ABC Favorit', 'ABCFavorit-Bold.woff2', 700],
].map(([family, file, weight]) =>
  `@font-face{font-family:"${family}";src:url("file://${FONT_DIR}/${file}") format("woff2");font-weight:${weight};}`
).join('\n');

function runChrome(args, timeoutMs = 60000) {
  const res = spawnSync(chromeBin, args, { encoding: 'utf8', timeout: timeoutMs });
  if (res.status !== 0) throw new Error(res.stderr || res.stdout || 'chrome failed');
  return res.stdout;
}

function renderMermaidInChrome(code) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${fontFace}
html,body{margin:0;font-family:"Kumbh Sans","ABC Favorit",Arial,sans-serif;}
</style></head><body>
<script src="file://${MERMAID_JS}"></script>
<script>
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await document.fonts.ready;
    window.mermaid.initialize({ startOnLoad: false, theme: 'default', fontFamily: 'Kumbh Sans, ABC Favorit, Arial, sans-serif', fontSize: ${FONT_SIZE}, sequence: { actorMargin: ${ACTOR_MARGIN} } });
    const { svg } = await window.mermaid.render('agentFlow', document.getElementById('code').textContent);
    document.body.innerHTML = svg;
    document.title = 'RENDERED';
  } catch (e) { document.title = 'ERROR: ' + e.message; }
});
</script>
<script type="text/plain" id="code">${code}</script>
</body></html>`;
  const tmpHtml = path.join(os.tmpdir(), `nibgate-mermaid-${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, html);
  try {
    const dumped = runChrome(['--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=15000', '--dump-dom', 'file://' + tmpHtml]);
    if (!/RENDERED/.test(dumped)) throw new Error((dumped.match(/ERROR:?[^<]*/) || ['render failed'])[0]);
    const m = dumped.match(/<svg[^>]*>[\s\S]*?<\/svg>/);
    if (!m) throw new Error('no svg captured from mermaid render');
    return m[0];
  } finally {
    fs.rmSync(tmpHtml, { force: true });
  }
}

function recolorForDark(svg) {
  const MINT = '#8fc7a8';
  const LIGHT = '#e8f2e6';
  const BORDER = '#3d5a4d';
  const BOX = '#20221c';
  const NOTE = '#243326';
  return svg
    .replace(/\{font-family:[^}]*;font-size:[\d.]+px;fill:#333;\}/, `{font-family:"Kumbh Sans",Arial,sans-serif;font-size:${FONT_SIZE}px;fill:${LIGHT};}`)
    .replace('.actor{stroke:#9370DB;fill:#ECECFF;stroke-width:1;}', `.actor{stroke:${BORDER};fill:${BOX};stroke-width:1;}`)
    .replace('text.actor&gt;tspan{fill:black;stroke:none;}', `text.actor&gt;tspan{fill:${LIGHT};stroke:none;}`)
    .replace('.actor-line{stroke:#9370DB;}', `.actor-line{stroke:${MINT};}`)
    .replace('.messageLine0{stroke-width:1.5;stroke-dasharray:none;stroke:#333;}', `.messageLine0{stroke-width:1.5;stroke-dasharray:none;stroke:${MINT};}`)
    .replace('.messageLine1{stroke-width:1.5;stroke-dasharray:2,2;stroke:#333;}', `.messageLine1{stroke-width:1.5;stroke-dasharray:2,2;stroke:${MINT};}`)
    .replace('[id$="-arrowhead"] path{fill:#333;stroke:#333;}', `[id$="-arrowhead"] path{fill:${MINT};stroke:${MINT};}`)
    .replace('[id$="-sequencenumber"]{fill:#333;}', `[id$="-sequencenumber"]{fill:${MINT};}`)
    .replace('.messageText{fill:#333;stroke:none;}', `.messageText{fill:${LIGHT};stroke:none;}`)
    .replace('.sequenceNumber{fill:white;}', '.sequenceNumber{fill:#171813;}')
    .replace('.note{stroke:#aaaa33;fill:#fff5ad;}', `.note{stroke:${BORDER};fill:${NOTE};}`)
    .replace('.noteText&gt;tspan{fill:black;stroke:none;font-weight:normal;}', `.noteText&gt;tspan{fill:${LIGHT};stroke:none;font-weight:normal;}`)
    .replace('g rect.rect{filter:drop-shadow(1px 2px 2px rgba(185, 185, 185, 1));stroke:#9370DB;}', `g rect.rect{filter:drop-shadow(1px 2px 2px rgba(0, 0, 0, 0.45));stroke:${BORDER};}`)
    .replace('.labelText&gt;tspan{fill:black;stroke:none;}', `.labelText&gt;tspan{fill:${LIGHT};stroke:none;}`)
    .replace('.loopText&gt;tspan{fill:black;stroke:none;}', `.loopText&gt;tspan{fill:${LIGHT};stroke:none;}`)
    .replace('.sectionTitle&gt;tspan{fill:black;stroke:none;}', `.sectionTitle&gt;tspan{fill:${LIGHT};stroke:none;}`)
    .replace('fill="rgb(232, 242, 255)"', 'fill="#1b4a40"')
    .replace('fill="rgb(232, 255, 235)"', 'fill="#2e4130"')
    .replace('fill="rgb(255, 244, 230)"', 'fill="#383f28"')
    .replace('.label{font-family:Kumbh Sans,ABC Favorit,Arial,sans-serif;color:#333;}', `.label{font-family:Kumbh Sans,ABC Favorit,Arial,sans-serif;color:${LIGHT};}`)
    .replace('.label text,#agentFlow span{fill:#333;color:#333;}', `.label text,#agentFlow span{fill:${LIGHT};color:${LIGHT};}`)
    .replace('.node rect,#agentFlow .node circle,#agentFlow .node ellipse,#agentFlow .node polygon,#agentFlow .node path{fill:#ECECFF;stroke:#9370DB;stroke-width:1px;}', `.node rect,#agentFlow .node circle,#agentFlow .node ellipse,#agentFlow .node polygon,#agentFlow .node path{fill:${BOX};stroke:${BORDER};stroke-width:1px;}`)
    .replace('.marker{fill:#333333;stroke:#333333;}', `.marker{fill:${MINT};stroke:${MINT};}`)
    .replace('.marker.cross{stroke:#333333;}', `.marker.cross{stroke:${MINT};}`)
    .replace('.arrowheadPath{fill:#333333;}', `.arrowheadPath{fill:${MINT};}`)
    .replace('.edgePath .path{stroke:#333333;stroke-width:1px;}', `.edgePath .path{stroke:${MINT};stroke-width:1px;}`)
    .replace('.flowchart-link{stroke:#333333;fill:none;}', `.flowchart-link{stroke:${MINT};fill:none;}`)
    .replace('.edgeLabel{background-color:rgba(232,232,232, 0.8);text-align:center;}', `.edgeLabel{background-color:rgba(23,24,19, 0.9);text-align:center;}`)
    .replace('.edgeLabel p{background-color:rgba(232,232,232, 0.8);}', '.edgeLabel p{background-color:rgba(23,24,19, 0.9);}')
    .replace('.edgeLabel rect{opacity:0.5;background-color:rgba(232,232,232, 0.8);fill:rgba(232,232,232, 0.8);}', '.edgeLabel rect{opacity:0.5;background-color:rgba(23,24,19, 0.9);fill:rgba(23,24,19, 0.9);}');
}

(async () => {
  let svg;
  if (input.endsWith('.svg')) {
    svg = fs.readFileSync(input, 'utf8');
  } else {
    svg = renderMermaidInChrome(fs.readFileSync(input, 'utf8'));
  }

  const viewBox = /viewBox="([^"]+)"/.exec(svg);
  const [, vb] = viewBox || ['', '-60 -10 1619 1325'];
  const [vx, vy, w, h] = vb.split(/\s+/).map(Number);
  const rootId = /<svg[^>]*\sid="([^"]+)"/.exec(svg)?.[1] || 'diagram';

  const inner = svg
    .replace(/^<\?xml[^>]*\?>/, '')
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '');

  const newW = w + SIDE * 2;
  const newH = h + TOP + BOTTOM;
  const viewX = vx - SIDE;
  const titleX = vx + w / 2;
  const titleY = vy + TOP * 0.65;

  const wrapped = `<svg id="${rootId}" xmlns="http://www.w3.org/2000/svg" viewBox="${viewX} ${vy} ${newW} ${newH}" width="${newW}" height="${newH}" role="graphics-document document" aria-roledescription="sequence">
  <rect x="${viewX}" y="${vy}" width="${newW}" height="${newH}" fill="${BG}"/>
  <text x="${titleX}" y="${titleY}" text-anchor="middle" font-family="${TITLE_FONT}" font-size="${TITLE_SIZE}" font-weight="700" fill="${TEXT}">${TITLE}</text>
  <g transform="translate(0,${TOP})">${inner}</g>
</svg>`;

  const final = DARK ? recolorForDark(wrapped) : wrapped;

  fs.writeFileSync(out.replace(/\.png$/, '.svg'), final);
  console.log('SVG viewBox:', newW, 'x', newH, 'title@', titleX, titleY, DARK ? '(dark)' : '(light)', 'actorMargin', ACTOR_MARGIN);

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${fontFace}
html,body{margin:0;padding:0;background:${BG};font-family:"Kumbh Sans","ABC Favorit",Arial,sans-serif;}
svg{display:block;}
</style></head><body>${final}</body></html>`;

  const tmpHtml = path.join(os.tmpdir(), `nibgate-diagram-${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, html);

  try {
    runChrome([
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--disable-lcd-text',
      '--force-device-scale-factor=2', '--virtual-time-budget=2000',
      `--window-size=${Math.round(newW)},${Math.round(newH)}`,
      `--screenshot=${out}`,
      'file://' + tmpHtml,
    ]);
  } finally {
    fs.rmSync(tmpHtml, { force: true });
  }
  const len = fs.statSync(out).size;
  console.log('WROTE', out, len, 'bytes');
})();
