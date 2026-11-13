export default async function ({ frame }) {
  return frame.evaluate(() => {
    const timing = window.__ANTTiming;
    if (!timing) return { status: 'not-started' };
    const live = window.__ANTVR.snapshot();
    return { status: timing.status, mode: timing.mode, action: timing.action, error: timing.error, elapsed: live.elapsed, step: live.step, performance: live.performance, timings: timing.result?.timings };
  });
}
