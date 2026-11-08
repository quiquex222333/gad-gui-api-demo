// Fails if tests/ call request.<verb>() directly or use snapshot assertions.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'tests');
const rules = [
  { re: /\brequest\.(get|post|put|patch|delete|head|fetch)\s*\(/, msg: 'direct request.* call' },
  { re: /toMatchSnapshot|toHaveScreenshot/, msg: 'snapshot assertion' },
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

let bad = 0;
for (const file of walk(root)) {
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    for (const r of rules) {
      if (r.re.test(line)) {
        console.error(`${path.relative(process.cwd(), file)}:${i + 1}: ${r.msg}: ${line.trim()}`);
        bad++;
      }
    }
  });
}
if (bad) process.exit(1);
console.log('guard OK: no direct request.* calls or snapshot assertions');
