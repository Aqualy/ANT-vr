import assert from 'node:assert/strict';
import { ACTIONS, CHAPTERS, act, capture, enter, makeEvidence, save, sleep, snapshot } from './emulator-common.mjs';

export default async function ({ frame, workspaceRoot, signal }) {
  const directory = await makeEvidence(workspaceRoot, 'smoke');
  const errors = [];
  const onError = (error) => errors.push(error.message);
  frame.page().on('pageerror', onError);
  try {
    await enter(frame);
    await frame.evaluate(() => { window.__ANTVR.reset(); window.__ANTVR_TEST_COMPLETIONS = 0; window.addEventListener('ant:complete', () => window.__ANTVR_TEST_COMPLETIONS++, { once: true }); });
    const shots = [];
    const samples = [];
    const seen = new Set();
    for (const [id, , , payload] of ACTIONS) {
      if (id === 'done') {
        const further = await snapshot(frame);
        assert.equal(further.step, 'further');
        samples.push(further);
        shots.push(await capture(frame, directory, '08-further'));
        await frame.waitForFunction(() => window.__ANTVR.snapshot().step === 'outro', undefined, { timeout: 15000 });
      }
      const before = await snapshot(frame);
      assert.equal(before.action, id);
      if (!seen.has(before.step)) {
        seen.add(before.step);
        await sleep(0.65, signal);
        samples.push(await snapshot(frame));
        shots.push(await capture(frame, directory, `${String(CHAPTERS.indexOf(before.step) + 1).padStart(2, '0')}-${before.step}`));
      }
      await act(frame, 'intentionally-invalid-stale-action');
      assert.equal((await snapshot(frame)).action, id, 'Invalid actions must not change the journey');
      await act(frame, id, payload);
      assert.notEqual((await snapshot(frame)).action, id);
      await sleep(0.2, signal);
      if (id === 'accept-request') shots.push(await capture(frame, directory, '06b-private-open'));
    }
    const final = await snapshot(frame);
    assert.equal(final.finished, true);
    assert.equal(final.state.visibility, 'private');
    assert.equal(final.state.requestAccepted, true);
    assert.equal(final.state.symbolPosted, true);
    assert.equal(final.state.networkReached, true);
    assert.deepEqual(final.state.tokens, ['gardening', 'music']);
    assert.equal(await frame.evaluate(() => window.__ANTVR_TEST_COMPLETIONS), 1);
    assert.ok(final.peakPerformance.calls < 150, 'Draw-call budget');
    assert.ok(final.peakPerformance.triangles < 150000, 'Triangle budget');
    await frame.evaluate(() => window.__ANTVR.reset());
    const reset = await snapshot(frame);
    assert.equal(reset.step, 'intro');
    assert.equal(reset.finished, false);
    assert.equal(reset.timings.length, 0);
    assert.deepEqual(reset.state.tokens, []);
    await act(frame, 'skip');
    assert.equal((await snapshot(frame)).step, 'kit');
    await frame.evaluate(() => window.__ANTVR.reset());
    assert.deepEqual(errors, [], 'No uncaught browser exceptions');
    const report = { kind: 'active-IWER-session-application-smoke', generatedAt: new Date().toISOString(), inputScope: 'Application action API; physical controller and hand paths are verified separately.', final, samples, shots, errors, resetAndSkipPassed: true };
    await save(directory, 'result.json', report);
    return { passed: true, chapters: 9, xr: final.xr, performance: final.peakPerformance, directory, shots };
  } finally {
    frame.page().off('pageerror', onError);
  }
}
