import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RunManager, STEPS } from './run.js';
import { SceneDirector, minimumTargetSize, minimumTextHeight, shouldReturnHome, withinDropTarget, type SceneContract } from './lifecycle.js';

test('the ordered nine chapters budget 290 seconds with glanceable instructions', () => {
  assert.equal(STEPS.length, 9);
  assert.equal(STEPS.reduce((total, step) => total + step.budget, 0), 290);
  for (const step of STEPS) for (const action of step.actions) assert.ok(action.instruction.split(/\s+/u).length <= 12, action.instruction);
});

test('stale and duplicate inputs cannot skip actions or duplicate tokens', () => {
  const run = new RunManager();
  assert.equal(run.act('begin'), false);
  run.start();
  assert.equal(run.act('begin'), true);
  assert.equal(run.act('begin'), false);
  run.completeStep();
  assert.equal(run.step.id, 'profile');
  assert.equal(run.act('token-one', { token: 'music' }), true);
  assert.equal(run.act('token-two', { token: 'music' }), false);
  assert.equal(run.action?.id, 'token-two');
  assert.equal(run.act('token-two', { token: 'gardening' }), true);
  assert.deepEqual(run.state.tokens, ['music', 'gardening']);
});

test('assistance highlights at 10 seconds, progresses at 20 and resets on progress', () => {
  const run = new RunManager();
  run.start();
  run.update(9.9);
  assert.equal(run.assist, false);
  run.update(0.1);
  assert.equal(run.assist, true);
  run.update(10);
  assert.equal(run.step.id, 'kit');
  assert.equal(run.assist, false);
  assert.equal(run.snapshot().timings[0].reason, 'assist');
  run.update(11);
  run.act('open-kit');
  assert.equal(run.assist, false);
  assert.equal(run.idle, 0);
});

test('an idle visitor completes by 300 seconds, including valid prerequisite data', () => {
  const run = new RunManager();
  let completes = 0;
  run.onComplete(() => { completes++; });
  run.start();
  run.update(1000);
  assert.equal(run.finished, true);
  assert.ok(run.elapsed <= 300);
  assert.equal(run.state.tokens.length, 2);
  assert.equal(run.state.symbolPosted, true);
  assert.equal(run.state.networkReached, true);
  assert.equal(run.snapshot().timings.length, 9);
  assert.equal(completes, 1);
  run.completeStep();
  run.update(1000);
  assert.equal(completes, 1);
  for (const timing of run.snapshot().timings) assert.ok(timing.seconds <= timing.budget * 1.2 + 1e-8);
});

test('pause excludes hidden time and reset clears the entire previous visit', () => {
  const run = new RunManager();
  run.start();
  run.update(6);
  run.pause();
  run.update(120);
  assert.equal(run.elapsed, 6);
  assert.equal(run.act('begin'), false);
  run.resume();
  run.act('begin');
  assert.equal(run.snapshot().timings[0].seconds, 6);
  run.completeStep();
  run.reset();
  assert.equal(run.elapsed, 0);
  assert.equal(run.step.id, 'intro');
  assert.equal(run.running, false);
  assert.equal(run.state.kitOpen, false);
  assert.deepEqual(run.snapshot().timings, []);
});

test('jumping backwards reconstructs only prior state and flags debug reports', () => {
  const run = new RunManager();
  run.jumpTo('symbols');
  assert.equal(run.state.submitted, true);
  assert.equal(run.state.requestAccepted, true);
  assert.equal(run.state.symbolPosted, false);
  run.completeStep();
  run.jumpTo('profile');
  assert.equal(run.state.submitted, false);
  assert.equal(run.state.symbolPosted, false);
  assert.deepEqual(run.state.tokens, []);
  assert.equal(run.snapshot().debugJumped, true);
  assert.throws(() => run.jumpTo(100), RangeError);
});

test('invalid drawing data is rejected; snapshot mutation cannot change the run', () => {
  const run = new RunManager();
  run.jumpTo('symbols');
  assert.equal(run.act('draw-symbol', { points: [[0, 0], [Infinity, 1]] }), false);
  assert.equal(run.act('draw-symbol', { points: [[0.1, 0.2], [0.8, 0.9]] }), true);
  const copy = run.snapshot();
  copy.state.symbolPoints[0][0] = 0.99;
  copy.state.tokens.push('extra');
  assert.equal(run.state.symbolPoints[0][0], 0.1);
  assert.equal(run.state.tokens.length, 2);
});

test('network watching ends automatically after three seconds without extra input', () => {
  const run = new RunManager();
  run.jumpTo('further');
  run.update(3);
  assert.equal(run.step.id, 'outro');
  assert.equal(run.state.networkReached, true);
  assert.equal(run.snapshot().timings[0].seconds, 3);
  assert.equal(run.snapshot().timings[0].reason, 'automatic');
});

test('the public match stays visible until the visitor continues', () => {
  const run = new RunManager();
  run.jumpTo('public');
  run.act('turn-page');
  assert.equal(run.step.id, 'public');
  assert.equal(run.state.pageTurned, true);
  assert.equal(run.action?.id, 'meet-neighbour');
  run.update(3);
  assert.equal(run.step.id, 'public');
  run.act('meet-neighbour');
  assert.equal(run.step.id, 'private');
});

test('accepting a private request reveals the profile before continuing', () => {
  const run = new RunManager();
  run.jumpTo('private');
  run.act('accept-request');
  assert.equal(run.step.id, 'private');
  assert.equal(run.state.requestAccepted, true);
  assert.equal(run.action?.id, 'read-profile');
  run.update(3);
  assert.equal(run.step.id, 'private');
  run.act('read-profile');
  assert.equal(run.step.id, 'symbols');
});

test('scene changes exit and dispose old resources before building the next scene', () => {
  const events: string[] = [];
  const make = (id: string): SceneContract<number> => ({
    build: () => { events.push(`${id}:build`); },
    enter: (state) => { events.push(`${id}:enter:${state}`); },
    update: (delta) => { events.push(`${id}:update:${delta}`); },
    exit: () => { events.push(`${id}:exit`); },
    dispose: () => { events.push(`${id}:dispose`); },
  });
  const director = new SceneDirector<number>();
  director.show(() => make('a'), 1);
  director.update(0.1);
  director.show(() => make('b'), 2);
  director.dispose();
  director.dispose();
  assert.deepEqual(events, ['a:build', 'a:enter:1', 'a:update:0.1', 'a:exit', 'a:dispose', 'b:build', 'b:enter:2', 'b:exit', 'b:dispose']);
  assert.throws(() => director.show(() => make('c'), 3), /disposed/u);
});

test('failed scene construction still frees partial resources', () => {
  let freed = 0;
  const director = new SceneDirector<null>();
  assert.throws(() => director.show(() => ({
    build: () => { throw new Error('texture failure'); },
    enter() {}, update() {}, exit() {}, dispose: () => { freed++; },
  }), null), /texture failure/u);
  assert.equal(freed, 1);
});

test('grab return and snap acceptance work at the boundary and never move held paper', () => {
  assert.equal(withinDropTarget({ x: 0.16, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), true);
  assert.equal(withinDropTarget({ x: 0.161, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), false);
  assert.equal(withinDropTarget({ x: NaN, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), false);
  assert.equal(shouldReturnHome(true, false), false);
  assert.equal(shouldReturnHome(false, false), true);
  assert.equal(shouldReturnHome(false, true), false);
});

test('UI text and hit targets retain readable angular size', () => {
  assert.equal(minimumTextHeight(1), 0.03);
  assert.equal(minimumTextHeight(2), 0.06);
  assert.equal(minimumTargetSize(0.5), 0.044);
  assert.equal(minimumTargetSize(2), 0.088);
  assert.throws(() => minimumTextHeight(0), RangeError);
});
