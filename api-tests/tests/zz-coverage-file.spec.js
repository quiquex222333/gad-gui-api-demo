const { test, expect } = require('@playwright/test');
const fs = require('fs');
const config = require('../src/config');

// Named zz-* so it runs after the other specs (single worker, alphabetical).
test('every recorded line is valid JSON with all 6 fields', () => {
  const lines = fs.readFileSync(config.COVERAGE_FILE, 'utf8').split('\n').filter(Boolean);
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    const e = JSON.parse(line);
    expect(Object.keys(e).sort()).toEqual(
      ['actualPath', 'bodyFields', 'method', 'pathTemplate', 'queryParams', 'status'],
    );
    expect(e.pathTemplate.startsWith('/api')).toBe(true);
    expect(Array.isArray(e.queryParams)).toBe(true);
    expect(Array.isArray(e.bodyFields)).toBe(true);
  }
});
