import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export const CHAPTERS = ['intro', 'kit', 'profile', 'blob', 'public', 'private', 'symbols', 'further', 'outro'];
export const ACTIONS = [
  ['begin', 16, 3],
  ['open-kit', 12, 4], ['take-map', 12, 4], ['take-profile', 10, 3],
  ['token-one', 16, 5, { token: 'gardening' }], ['token-two', 16, 5, { token: 'music' }], ['accept-name', 12, 3],
  ['enter-blob', 16, 4], ['hand-profile', 15, 5], ['choose-visibility', 12, 4, { visibility: 'private' }],
  ['turn-page', 12, 4], ['meet-neighbour', 10, 4], ['accept-request', 16, 5], ['read-profile', 3, 2],
  ['draw-symbol', 17, 7, { points: [[0.5, 0.85], [0.5, 0.42], [0.27, 0.25], [0.22, 0.4], [0.5, 0.58], [0.77, 0.36], [0.78, 0.2], [0.55, 0.3]] }],
  ['post-symbol', 17, 4], ['done', 17, 6],
];

export const snapshot = (frame) => frame.evaluate(() => window.__ANTVR.snapshot());
export const act = (frame, id, payload) => frame.evaluate(({ id, payload }) => window.__ANTVR.act(id, payload), { id, payload });

export async function sleep(seconds, signal) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    signal?.throwIfAborted();
    await new Promise((resolve) => setTimeout(resolve, Math.min(250, until - Date.now())));
  }
}

export async function enter(frame) {
  await frame.waitForFunction(() => window.__ANTVR?.ready, undefined, { timeout: 45000 });
  if (!(await snapshot(frame)).xr) {
    const landingVisible = await frame.locator('#landing').isVisible();
    if (!landingVisible) await frame.locator('#exit').click();
    await frame.locator('#enter-vr').click();
    await frame.waitForFunction(() => window.__ANTVR?.snapshot().xr, undefined, { timeout: 20000 });
  }
  assert.equal((await snapshot(frame)).xr, true, 'A real IWER immersive session must be active');
  // Hide only the emulator's shadow-root controls in evidence captures.
  await frame.evaluate(() => { for (const child of document.body.children) if (child.shadowRoot) child.style.display = 'none'; });
  await frame.page().evaluate(() => { for (const child of document.body.children) if (child.shadowRoot) child.style.display = 'none'; });
}

export async function makeEvidence(workspaceRoot, name) {
  const directory = path.join(workspaceRoot, 'evidence', name);
  await mkdir(directory, { recursive: true });
  return directory;
}

export async function capture(frame, directory, name) {
  const filename = path.join(directory, `${name}.png`);
  const wasRunning = await frame.evaluate(() => window.__ANTVR.snapshot().running);
  await frame.evaluate(() => window.__ANTVR.app.run.pause());
  try {
    await frame.locator('body').screenshot({ path: filename });
  } finally {
    if (wasRunning) await frame.evaluate(() => window.__ANTVR.app.run.resume());
  }
  return filename;
}

export async function save(directory, filename, data) {
  await writeFile(path.join(directory, filename), `${JSON.stringify(data, null, 2)}\n`);
}

export async function playTimed({ frame }, mode) {
  assert.ok(['first-time', 'fast'].includes(mode));
  await enter(frame);
  // IWSDK's browser-run lease is shorter than a deliberate first-time run.
  // The page owns the asynchronous wall-clock workflow; the CLI returns now.
  // Separate status/collect commands observe it without extending a tool lease.
  return frame.evaluate(({ mode, plan }) => {
    if (window.__ANTTiming?.status === 'running') throw new Error('A timing run is already active');
    if (window.__ANTNativeRestore) { window.__ANTVR.app.run.update=window.__ANTNativeRestore; delete window.__ANTNativeRestore; }
    window.__ANTVR.reset();
    const started = performance.now();
    const state = window.__ANTTiming = { status: 'running', mode, generatedAt: new Date().toISOString(), action: 'begin', result: null, error: null };
    const wait = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    const ensure = (condition, message) => { if (!condition) throw new Error(message); };
    void (async () => {
      const actions = [];
      const samples = [];
      const seen = new Set();
      for (const [id, firstPause, fastPause, payload] of plan) {
        state.action = id;
        if (id === 'done') {
          const networkStart = performance.now();
          while (window.__ANTVR.snapshot().step !== 'outro') {
            ensure(performance.now() - networkStart < 12000, 'Network did not complete automatically');
            await wait(0.2);
          }
        }
        let before = window.__ANTVR.snapshot();
        ensure(before.xr, 'Immersive session ended during timing');
        ensure(before.action === id, `Expected ${id}, found ${before.action}; unexpected assist or transition`);
        if (!seen.has(before.step)) { seen.add(before.step); samples.push(before); }
        const delay = mode === 'first-time' ? firstPause : fastPause;
        await wait(delay);
        before = window.__ANTVR.snapshot();
        ensure(before.action === id, `Action ${id} advanced while waiting; timing invalid`);
        window.__ANTVR.act(id, payload);
        const after = window.__ANTVR.snapshot();
        ensure(after.action !== id, `Action ${id} was rejected`);
        actions.push({ id, scriptedPauseSeconds: delay, wallSeconds: (performance.now() - started) / 1000, before, after });
      }
      const final = window.__ANTVR.snapshot();
      ensure(final.finished && !final.debugJumped && final.timings.length === 9, 'Run did not finish all nine chapters normally');
      ensure(final.timings.every((timing) => timing.assistedActions === 0), 'Timing run used assistance');
      ensure(final.timings.every((timing) => timing.seconds <= timing.budget * 1.25), 'Chapter exceeded its budget by 25%');
      ensure(final.elapsed <= 300, 'Active journey exceeded five minutes');
      state.result = {
        kind: 'scripted-real-time-emulator-run', mode, generatedAt: state.generatedAt,
        method: 'Real wall-clock reading/aiming pauses, followed by the public application act() API. No clock acceleration. This is not a human usability trial or physical-controller timing.',
        entryExcluded: 'Timing begins after the immersive session is active; headset/browser permission time is excluded and belongs in physical QA.',
        wallSeconds: (performance.now() - started) / 1000,
        activeSeconds: final.elapsed, timings: final.timings, final, samples, actions,
      };
      state.status = 'complete';
      state.action = null;
    })().catch((error) => {
      state.error = String(error?.stack ?? error);
      state.status = 'failed';
      state.result = { mode, generatedAt: state.generatedAt, error: state.error, final: window.__ANTVR.snapshot(), wallSeconds: (performance.now() - started) / 1000 };
    });
    return { status: state.status, mode, next: 'Run scripts/emulator-timing-status.mjs periodically, then scripts/emulator-timing-collect.mjs when complete.' };
  }, { mode, plan: ACTIONS });
}
