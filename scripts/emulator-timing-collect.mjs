import assert from 'node:assert/strict';
import path from 'node:path';
import { capture, makeEvidence, save } from './emulator-common.mjs';

export default async function ({ frame, workspaceRoot }) {
  const timing = await frame.evaluate(() => window.__ANTTiming);
  assert.ok(timing, 'No timing run has been started');
  assert.notEqual(timing.status, 'running', 'Timing run is still active; inspect status and collect later');
  const directory = await makeEvidence(workspaceRoot, `timing-${timing.mode}`);
  await save(directory, 'run.json', timing.result);
  assert.equal(timing.status, 'complete', timing.error ?? 'Timing run failed');
  const ending = await capture(frame, directory, 'ending');
  await frame.evaluate(() => window.__ANTVR.reset());
  return { status: timing.status, mode: timing.mode, wallSeconds: timing.result.wallSeconds, activeSeconds: timing.result.activeSeconds, timings: timing.result.timings, performance: timing.result.final.peakPerformance, report: path.join(directory, 'run.json'), ending };
}
