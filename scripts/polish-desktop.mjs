// Visual review captures of the on-screen (non-XR) journey and the landing page.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { act, sleep } from './emulator-common.mjs';

export default async function ({ frame, workspaceRoot, signal }) {
  const directory = path.join(workspaceRoot, 'artifacts', 'polish-desktop');
  await mkdir(directory, { recursive: true });
  await frame.waitForFunction(() => window.__ANTVR?.ready, undefined, { timeout: 45000 });
  if (await frame.evaluate(() => window.__ANTVR.snapshot().xr)) {
    await frame.evaluate(() => window.__ANTVR.world.exitXR());
    await frame.waitForFunction(() => !window.__ANTVR.snapshot().xr, undefined, { timeout: 15000 });
    await sleep(0.5, signal);
  }
  const hide = () => { for (const el of document.querySelectorAll('*')) if (el.shadowRoot) el.style.display = 'none'; };
  await frame.evaluate(hide); await frame.page().evaluate(hide);
  await frame.locator('body').screenshot({ path: path.join(directory, '00-landing.png') });
  await frame.locator('#desktop').click();
  for (const [name, step, actions] of [['01-intro', 'intro', []], ['03-profile', 'profile', [['token-one', { token: 'gardening' }]]], ['04-counter', 'blob', [['enter-blob']]], ['07-symbols', 'symbols', [['draw-symbol']]]]) {
    await frame.evaluate((id) => window.__ANTVR.jumpTo(id), step);
    await sleep(0.3, signal);
    for (const [id, payload] of actions) { await act(frame, id, payload); await sleep(0.25, signal); }
    await sleep(1.2, signal);
    await frame.locator('body').screenshot({ path: path.join(directory, `${name}.png`) });
  }
  await frame.evaluate(() => window.__ANTVR.reset());
  return { directory };
}
