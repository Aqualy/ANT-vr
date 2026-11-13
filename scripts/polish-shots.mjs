// Visual review captures: one immersive (IWER) shot per chapter state.
// Usage: POLISH_SHOTS=before npx @iwsdk/cli browser run scripts/polish-shots.mjs --timeout 120000
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { act, enter, sleep, snapshot } from './emulator-common.mjs';

const STATES = [
  ['01-intro', 'intro', []],
  ['02-kit-closed', 'kit', []],
  ['02-kit-open', 'kit', [['open-kit'], ['take-map']]],
  ['03-profile', 'profile', [['token-one', { token: 'gardening' }]]],
  ['04-blob-counter', 'blob', [['enter-blob']]],
  ['05-public', 'public', [['turn-page']]],
  ['06-private', 'private', []],
  ['06-private-open', 'private', [['accept-request']]],
  ['07-symbols', 'symbols', [['draw-symbol']]],
  ['08-further', 'further', []],
  ['09-outro', 'outro', []],
];

export default async function ({ frame, workspaceRoot, signal }) {
  const directory = path.join(workspaceRoot, 'artifacts', `polish-${process.env.POLISH_SHOTS ?? 'after'}`);
  await mkdir(directory, { recursive: true });
  const errors = [];
  const onError = (error) => errors.push(error.message);
  frame.page().on('pageerror', onError);
  try {
    await enter(frame);
    const hide = () => {
      const walk = (root) => { for (const el of root.querySelectorAll('*')) if (el.shadowRoot) el.style.display = 'none'; };
      walk(document);
    };
    await frame.evaluate(hide);
    await frame.page().evaluate(hide);
    const stats = {};
    for (const [name, step, actions] of STATES) {
      await frame.evaluate((id) => window.__ANTVR.jumpTo(id), step);
      await sleep(0.3, signal);
      for (const [id, payload] of actions) { await act(frame, id, payload); await sleep(0.25, signal); }
      await sleep(step === 'further' ? 2.2 : 1.3, signal);
      await frame.evaluate(() => window.__ANTVR.app.run.pause());
      await frame.locator('#scene-container').screenshot({ path: path.join(directory, `${name}.png`) });
      stats[name] = (await snapshot(frame)).performance;
      await frame.evaluate(() => window.__ANTVR.app.run.resume());
    }
    await frame.evaluate(() => window.__ANTVR.reset());
    return { directory, stats, errors };
  } finally {
    frame.page().off('pageerror', onError);
  }
}
