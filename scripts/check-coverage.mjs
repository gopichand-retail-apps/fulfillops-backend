import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const coverageDirectory = process.env.FULFILLOPS_COVERAGE_DIRECTORY ?? 'coverage';
const reportPath = resolve(coverageDirectory, 'coverage-final.json');
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const criticalFiles = [
  'src/fulfillment/fulfillment.service.ts',
  'src/auth/demo-session.service.ts',
];
const thresholds = { statements: 90, branches: 90, functions: 90, lines: 90 };
const criticalThreshold = 95;
const totals = Object.fromEntries(
  Object.keys(thresholds).map((metric) => [metric, { covered: 0, total: 0 }]),
);
const fileMetrics = new Map();

function addCounts(metric, counts) {
  totals[metric].covered += counts.filter((count) => count > 0).length;
  totals[metric].total += counts.length;
  return {
    covered: counts.filter((count) => count > 0).length,
    total: counts.length,
  };
}

function collectFileMetrics(data) {
  const statements = Object.values(data.s ?? {});
  const functions = Object.values(data.f ?? {});
  const branches = Object.values(data.b ?? {}).flat();
  const lineCounts = new Map();
  for (const [statementId, count] of Object.entries(data.s ?? {})) {
    const line = data.statementMap[statementId]?.start.line;
    if (line === undefined) continue;
    lineCounts.set(line, Math.max(lineCounts.get(line) ?? 0, count));
  }
  return {
    statements: addCounts('statements', statements),
    branches: addCounts('branches', branches),
    functions: addCounts('functions', functions),
    lines: addCounts('lines', [...lineCounts.values()]),
  };
}

for (const [path, data] of Object.entries(report)) {
  fileMetrics.set(path, collectFileMetrics(data));
}

for (const [metric, threshold] of Object.entries(thresholds)) {
  const { covered, total } = totals[metric];
  const percentage = total === 0 ? 100 : (covered / total) * 100;
  assert.ok(
    percentage >= threshold,
    `FulfillOps aggregate ${metric} coverage is ${percentage.toFixed(2)}%, below ${threshold}%.`,
  );
  process.stdout.write(`Aggregate ${metric}: ${percentage.toFixed(2)}%\n`);
}

for (const path of criticalFiles) {
  const absolutePath = resolve(path);
  const metrics = fileMetrics.get(absolutePath);
  assert.ok(metrics, `Missing critical coverage report for ${path}.`);
  for (const [metric, counts] of Object.entries(metrics)) {
    const percentage = counts.total === 0 ? 100 : (counts.covered / counts.total) * 100;
    assert.ok(
      percentage >= criticalThreshold,
      `${path} ${metric} coverage is ${percentage.toFixed(2)}%, below ${criticalThreshold}%.`,
    );
  }
  process.stdout.write(`${path}: all metrics meet ${criticalThreshold}%\n`);
}