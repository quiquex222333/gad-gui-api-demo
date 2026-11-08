'use strict';
// Pure: (report, diff?) -> one self-contained HTML document (inline CSS, no scripts, no external assets).
// Deterministic: no timestamps, no environment data; every dynamic value is escaped.
const { deriveGaps } = require('./gaps');
const { pct, frac } = require('./format-console');

const DIMS = ['operations', 'statuses', 'parameters'];

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CSS = `
:root{color-scheme:light dark;--bg:#fff;--fg:#1f2328;--muted:#656d76;--line:#d0d7de;--card:#f6f8fa;--ok:#1a7f37;--bad:#cf222e;--warn:#9a6700;--okbg:#dafbe1;--badbg:#ffebe9;--warnbg:#fff8c5}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8d96a0;--line:#30363d;--card:#161b22;--ok:#3fb950;--bad:#f85149;--warn:#d29922;--okbg:#12261e;--badbg:#2d1214;--warnbg:#2b2110}}
*{box-sizing:border-box}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif}
main{max-width:1100px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 10px;border-bottom:1px solid var(--line);padding-bottom:4px}
.meta{color:var(--muted);font-size:12px}.meta code{font-size:12px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px}
.card .name{color:var(--muted);text-transform:capitalize}.card .big{font-size:30px;font-weight:600}
.card .sub{color:var(--muted);font-size:12px}
.delta{font-weight:600}.pos{color:var(--ok)}.neg{color:var(--bad)}.zero{color:var(--muted)}
.table-wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;color:var(--muted);font-weight:600}td.num,th.num{text-align:right;white-space:nowrap}
tr.out td{color:var(--muted)}
code,.chip{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.chip{display:inline-block;border-radius:10px;padding:0 7px;margin:1px 3px 1px 0;border:1px solid transparent}
.chip.ok{background:var(--okbg);color:var(--ok)}.chip.bad{background:var(--badbg);color:var(--bad)}.chip.warn{background:var(--warnbg);color:var(--warn)}
.tag{font-size:11px;border:1px solid var(--line);border-radius:4px;padding:0 5px;color:var(--muted)}
.method{font-weight:600}
details{border:1px solid var(--line);border-radius:6px;margin:6px 0;background:var(--card)}
summary{cursor:pointer;padding:6px 10px}details ul{margin:0;padding:4px 10px 10px 30px}
ul.plain{margin:4px 0 0;padding-left:22px}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
`;

function deltaHtml(n, suffix) {
  if (n === null || n === undefined) return '<span class="delta zero">n/a</span>';
  const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero';
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `<span class="delta ${cls}">${sign}${Math.abs(n)}${suffix}</span>`;
}

function cards(report, diff) {
  const out = ['<div class="cards">'];
  for (const d of DIMS) {
    const m = report.summary.scope[d];
    const g = report.summary.global && report.summary.global[d];
    out.push('<div class="card">');
    out.push(`<div class="name">${esc(d)} · scope</div>`);
    out.push(`<div class="big">${esc(pct(m.percent))}</div>`);
    out.push(`<div>${esc(frac(m))} covered</div>`);
    if (diff) {
      const x = diff.summary.scope[d];
      out.push(`<div>${deltaHtml(x.deltaPercent, ' pp')} <span class="sub">(${deltaHtml(x.deltaCovered, '')} covered, ${deltaHtml(x.deltaTotal, '')} total vs base)</span></div>`);
    }
    out.push(`<div class="sub">global: ${esc(frac(g))} (${esc(pct(g && g.percent))})</div>`);
    out.push('</div>');
  }
  out.push('</div>');
  return out.join('\n');
}

function chip(cls, text) {
  return `<span class="chip ${cls}">${esc(text)}</span>`;
}

function operationsTable(report) {
  const rows = report.operations.map((o) => {
    const doc = o.statuses.filter((s) => s.documented);
    const covered = doc.filter((s) => s.requests > 0).map((s) => chip('ok', s.status));
    const missing = doc.filter((s) => s.requests === 0).map((s) => chip('bad', s.status));
    const undoc = o.statuses.filter((s) => !s.documented).map((s) => chip('warn', s.status));
    const pd = o.parameters.filter((p) => p.documented);
    const pc = pd.filter((p) => p.requests > 0).length;
    return `<tr class="${o.inScope ? 'in' : 'out'}">
<td class="method">${esc(o.method)}</td><td><code>${esc(o.path)}</code></td>
<td>${o.inScope ? '<span class="tag">scope</span>' : ''}</td>
<td class="num">${o.requests}</td>
<td>${covered.join('') || '–'}</td><td>${missing.join('') || '–'}</td><td>${undoc.join('') || '–'}</td>
<td class="num">${pc}/${pd.length}</td></tr>`;
  });
  return `<div class="table-wrap"><table>
<thead><tr><th>Method</th><th>Path</th><th></th><th class="num">Requests</th><th>Covered statuses</th><th>Missing statuses</th><th>Undocumented</th><th class="num">Params</th></tr></thead>
<tbody>
${rows.join('\n')}
</tbody></table></div>`;
}

function gapLabel(g) {
  if (g.type === 'operation') return 'operation never called';
  if (g.type === 'status') return `status ${g.status} never returned`;
  return `${g.in} param ${g.param} never sent`;
}

function gapGroups(report) {
  const groups = new Map();
  for (const g of deriveGaps(report)) {
    const key = `${g.method} ${g.path}`;
    if (!groups.has(key)) groups.set(key, { key, inScope: g.inScope, gaps: [] });
    groups.get(key).gaps.push(g);
  }
  const all = [...groups.values()];
  const ordered = [...all.filter((x) => x.inScope), ...all.filter((x) => !x.inScope)];
  if (!ordered.length) return '<p>No open gaps.</p>';
  return ordered
    .map(
      (x) => `<details${x.inScope ? ' open' : ''}><summary><span class="method">${esc(x.key)}</span> ${x.inScope ? '<span class="tag">scope</span> ' : ''}<span class="meta">${x.gaps.length} open</span></summary>
<ul>${x.gaps.map((g) => `<li><code>${esc(g.id)}</code> <span class="meta">${esc(gapLabel(g))}</span></li>`).join('')}</ul></details>`,
    )
    .join('\n');
}

function idList(title, items) {
  return `<div><h3>${esc(title)} (${items.length})</h3>${
    items.length ? `<ul class="plain">${items.map((i) => `<li><code>${esc(i)}</code></li>`).join('')}</ul>` : '<p class="meta">none</p>'
  }</div>`;
}

function diffSection(diff) {
  const ids = (k) => diff.gaps[k].map((g) => g.id);
  return `<h2>Changes vs base</h2>
<p class="meta">base <code>${esc(diff.base.path)}</code> → head <code>${esc(diff.head.path)}</code></p>
<div class="cols">
${idList('Gaps closed', ids('closed'))}
${idList('Gaps opened (regressions)', ids('opened'))}
${idList('Gaps added (new spec items)', ids('added'))}
${idList('Gaps removed (items gone from spec)', ids('removed'))}
${idList('Drift added', diff.drift.added)}
${idList('Drift removed', diff.drift.removed)}
</div>`;
}

function formatHtml(report, diff) {
  const d = report.drift;
  const L = report.inputs.requests.lines;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>API coverage report</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>API coverage report</h1>
<div class="meta">spec <code>${esc(report.inputs.spec.path)}</code> (${esc(report.inputs.spec.sha256.slice(0, 12))}) · requests <code>${esc(report.inputs.requests.path)}</code> (${esc(report.inputs.requests.sha256.slice(0, 12))}) · ${L.counted} counted of ${L.total} lines</div>
${cards(report, diff)}
${diff ? diffSection(diff) : ''}
<h2>Operations</h2>
${operationsTable(report)}
<h2>Open gaps by operation</h2>
${gapGroups(report)}
<h2>Drift</h2>
<p>${d.unmatchedRequests.length} unmatched requests · ${d.undocumentedStatuses.length} undocumented statuses · ${d.undocumentedParams.length} undocumented params · ${report.warnings.length} distinct warnings</p>
</main>
</body>
</html>
`;
}

module.exports = { formatHtml, esc };
