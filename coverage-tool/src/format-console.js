'use strict';
// Pure string builders. "\n" line endings, no colours (spec §9, §12).

function pad(s, w, right) {
  s = String(s);
  const fill = ' '.repeat(Math.max(0, w - s.length));
  return right ? fill + s : s + fill;
}

// rows: array of arrays of strings; align: array of 'l'|'r' per column.
function table(header, rows, align) {
  const all = [header, ...rows];
  const widths = header.map((_, c) => Math.max(...all.map((r) => String(r[c]).length)));
  const line = (r) => r.map((cell, c) => pad(cell, widths[c], align[c] === 'r')).join('  ').replace(/\s+$/, '');
  return [line(header), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)].join('\n');
}

function pct(p) {
  return p === null || p === undefined ? 'n/a' : p.toFixed(2) + '%';
}
function frac(m) {
  return m && m.covered !== null ? `${m.covered}/${m.total}` : 'n/a';
}

function formatReport(report, files) {
  const out = [];
  const s = report.summary;
  const dims = ['operations', 'statuses', 'parameters'];
  out.push('Coverage summary');
  out.push(
    table(
      ['dimension', 'scope', 'scope %', 'global', 'global %'],
      dims.map((d) => [d, frac(s.scope[d]), pct(s.scope[d].percent), frac(s.global[d]), pct(s.global[d].percent)]),
      ['l', 'r', 'r', 'r', 'r'],
    ),
  );
  out.push('');
  out.push('In-scope operations');
  const rows = report.operations
    .filter((o) => o.inScope)
    .map((o) => {
      const sd = o.statuses.filter((x) => x.documented);
      const pd = o.parameters.filter((x) => x.documented);
      return [
        o.method,
        o.path,
        String(o.requests),
        `${sd.filter((x) => x.requests > 0).length}/${sd.length}`,
        `${pd.filter((x) => x.requests > 0).length}/${pd.length}`,
      ];
    });
  out.push(table(['method', 'path', 'requests', 'statuses', 'params'], rows, ['l', 'l', 'r', 'r', 'r']));
  out.push('');
  const d = report.drift;
  out.push('Drift');
  out.push(`  unmatched requests:    ${d.unmatchedRequests.length}`);
  out.push(`  undocumented statuses: ${d.undocumentedStatuses.length}`);
  out.push(`  undocumented params:   ${d.undocumentedParams.length}`);
  out.push('');
  const wTotal = report.warnings.reduce((n, w) => n + w.count, 0);
  out.push(`Warnings: ${wTotal} (${report.warnings.length} distinct)`);
  out.push('');
  const L = report.inputs.requests.lines;
  out.push(
    `Request lines: total ${L.total}, invalid ${L.invalid}, non-test ${L.nonTest}, null status ${L.nullStatus}, excluded ${L.excluded}, counted ${L.counted}, unmatched ${L.unmatched}`,
  );
  if (files && files.length) {
    out.push('');
    out.push('Written:');
    for (const f of files) out.push(`  ${f}`);
  }
  return out.join('\n') + '\n';
}

function formatDiff(diff) {
  const out = [];
  const num = (n) => (n === null ? 'n/a' : (n > 0 ? '+' : '') + n);
  for (const scope of ['scope', 'global']) {
    out.push(`Coverage delta (${scope})`);
    const g = diff.summary[scope];
    out.push(
      table(
        ['dimension', 'base', 'head', 'd covered', 'd total', 'd %'],
        ['operations', 'statuses', 'parameters'].map((d) => [
          d,
          `${frac(g[d].base)} ${pct(g[d].base.percent)}`,
          `${frac(g[d].head)} ${pct(g[d].head.percent)}`,
          num(g[d].deltaCovered),
          num(g[d].deltaTotal),
          num(g[d].deltaPercent),
        ]),
        ['l', 'r', 'r', 'r', 'r', 'r'],
      ),
    );
    out.push('');
  }
  for (const k of ['closed', 'opened', 'added', 'removed']) {
    out.push(`Gaps ${k}: ${diff.gaps[k].length}`);
    for (const g of diff.gaps[k]) out.push(`  ${g.id}`);
  }
  out.push('');
  for (const k of ['added', 'removed']) {
    out.push(`Drift ${k}: ${diff.drift[k].length}`);
    for (const id of diff.drift[k]) out.push(`  ${id}`);
  }
  return out.join('\n') + '\n';
}

module.exports = { formatReport, formatDiff, pct, frac };
