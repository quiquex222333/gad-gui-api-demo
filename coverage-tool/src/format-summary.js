'use strict';
// Pure: (headReport, diff?) -> markdown for the PR summary / sticky comment. Deterministic, "\n" endings.
const { deriveGaps } = require('./gaps');
const { TYPE_RANK } = require('./sort');
const { pct, frac } = require('./format-console');

const DIMS = ['operations', 'statuses', 'parameters'];
const LIST_CAP = 10;

const cell = (s) => String(s).replace(/\|/g, '\\|');
const code = (s) => '`' + cell(s) + '`';

function signed(n, suffix = '') {
  if (n === null || n === undefined) return 'n/a';
  const s = (n > 0 ? '+' : n < 0 ? '-' : '') + Math.abs(n) + suffix;
  return n < 0 ? `**${s}** ▼` : n > 0 ? `${s} ▲` : s;
}

function plain(n) {
  return n === null || n === undefined ? 'n/a' : (n > 0 ? '+' : '') + n;
}

function metric(m) {
  return m && m.covered !== null && m.covered !== undefined ? `${frac(m)} (${pct(m.percent)})` : 'n/a';
}

function gapLine(g) {
  return `- ${code(g.id)}`;
}

function list(gaps, cap) {
  const lines = gaps.slice(0, cap).map(gapLine);
  if (gaps.length > cap) lines.push(`- … and ${gaps.length - cap} more`);
  return lines;
}

// Operations first, then statuses, then params; canonical order inside each type (gaps arrive canonical).
function topOpenInScope(report, n) {
  const open = deriveGaps(report).filter((g) => g.inScope);
  const ordered = open
    .map((g, i) => ({ g, i }))
    .sort((a, b) => TYPE_RANK[a.g.type] - TYPE_RANK[b.g.type] || a.i - b.i)
    .map((x) => x.g);
  return { total: ordered.length, top: ordered.slice(0, n) };
}

function formatSummary(report, diff) {
  const out = [];
  out.push('### API coverage (scope)');
  out.push('');
  if (diff) {
    out.push('| Dimension | Base | Head | Δ |');
    out.push('|---|---:|---:|---:|');
    for (const d of DIMS) {
      const x = diff.summary.scope[d];
      const delta = `${signed(x.deltaPercent, ' pp')} (covered ${plain(x.deltaCovered)}, total ${plain(x.deltaTotal)})`;
      out.push(`| ${d} | ${metric(x.base)} | ${metric(x.head)} | ${delta} |`);
    }
  } else {
    out.push('| Dimension | Head |');
    out.push('|---|---:|');
    for (const d of DIMS) out.push(`| ${d} | ${metric(report.summary.scope[d])} |`);
  }
  out.push('');

  if (diff) {
    for (const [title, key] of [['Gaps closed', 'closed'], ['Gaps opened', 'opened']]) {
      const all = diff.gaps[key];
      const inScope = all.filter((g) => g.inScope);
      const outOfScope = all.length - inScope.length;
      out.push(`**${title}:** ${inScope.length}${outOfScope ? ` (+${outOfScope} out of scope)` : ''}`);
      if (inScope.length) {
        out.push('');
        out.push(...list(inScope, LIST_CAP));
      }
      out.push('');
    }
  }

  const { total, top } = topOpenInScope(report, LIST_CAP);
  out.push(`**Top open in-scope gaps:** ${total === 0 ? 'none' : `${top.length} of ${total}`}`);
  if (top.length) {
    out.push('');
    out.push(...top.map(gapLine));
  }
  return out.join('\n') + '\n';
}

module.exports = { formatSummary };
