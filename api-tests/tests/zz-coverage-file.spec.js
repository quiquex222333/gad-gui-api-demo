const { test, expect } = require('@playwright/test');
const fs = require('fs');
const config = require('../src/config');

// Named zz-* so it runs after the other specs (single worker, alphabetical).
test('every recorded line is valid JSON with all 7 fields', () => {
  const lines = fs.readFileSync(config.COVERAGE_FILE, 'utf8').split('\n').filter(Boolean);
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    const e = JSON.parse(line);
    expect(Object.keys(e).sort()).toEqual(
      ['actualPath', 'bodyFields', 'method', 'pathTemplate', 'queryParams', 'source', 'status'],
    );
    expect(['test', 'setup']).toContain(e.source);
    expect(e.pathTemplate.startsWith('/')).toBe(true);
    expect(e.pathTemplate.startsWith('/api')).toBe(false);
    expect(Array.isArray(e.queryParams)).toBe(true);
    expect(Array.isArray(e.bodyFields)).toBe(true);
  }
});

test('globalSetup and fixture calls are recorded as "setup"', () => {
  const entries = fs.readFileSync(config.COVERAGE_FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const setup = entries.filter((e) => e.source === 'setup');
  expect(setup.some((e) => e.method === 'GET' && e.pathTemplate === '/restoreTestDB' && e.status === 201)).toBe(true);
  expect(setup.some((e) => e.method === 'POST' && e.pathTemplate === '/login' && e.status === 200)).toBe(true);
  // calls made inside tests are never "setup"
  expect(entries.some((e) => e.source === 'test' && e.pathTemplate === '/restoreTestDB')).toBe(false);
});
