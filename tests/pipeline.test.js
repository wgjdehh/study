import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateStudySet } from '../server/pipeline.js';
import { withChaos } from '../server/chaos.js';
import { mockCompletion } from '../server/mock.js';
import { buildGenerateMessages } from '../server/prompt.js';

const valid = JSON.stringify({ title: 't', cards: [{ front: 'f', back: 'b' }], quiz: [] });

/** Fake model that returns the given outputs in order and records each call. */
function scripted(...outputs) {
  const calls = [];
  const fn = async (messages) => {
    calls.push(messages);
    return outputs[Math.min(calls.length - 1, outputs.length - 1)];
  };
  return { fn, calls };
}

test('returns on first valid attempt', async () => {
  const { fn, calls } = scripted(valid);
  const res = await generateStudySet(fn, [{ role: 'user', content: 'x' }]);
  assert.equal(res.attempts, 1);
  assert.equal(calls.length, 1);
});

test('auto-repairs once, feeding the error back to the model', async () => {
  const { fn, calls } = scripted('{"cards": [', valid);
  const res = await generateStudySet(fn, [{ role: 'user', content: 'x' }]);
  assert.equal(res.attempts, 2);
  const repairTurn = calls[1].at(-1).content;
  assert.match(repairTurn, /could not be used/);
  assert.equal(calls[1].at(-2).role, 'assistant');
});

test('gives up after two bad attempts with the last error', async () => {
  const { fn, calls } = scripted('nope', '{"wrong": true}');
  await assert.rejects(generateStudySet(fn, [{ role: 'user', content: 'x' }]), { code: 'WRONG_SHAPE' });
  assert.equal(calls.length, 2);
});

test('does not retry when the model says there is nothing to study', async () => {
  const { fn, calls } = scripted('{"title":"","cards":[],"quiz":[]}');
  await assert.rejects(generateStudySet(fn, [{ role: 'user', content: 'x' }]), { code: 'NO_USABLE_ITEMS' });
  assert.equal(calls.length, 1);
});

test('provider errors propagate unchanged', async () => {
  const boom = Object.assign(new Error('down'), { code: 'UPSTREAM' });
  await assert.rejects(generateStudySet(async () => { throw boom; }, []), boom);
});

const notes =
  'Photosynthesis is the process plants use to turn light into chemical energy. ' +
  'Chlorophyll is the green pigment that absorbs light. ' +
  'The Calvin cycle is the set of reactions that fixes carbon dioxide into sugar. ' +
  'Stomata are small pores that let gases in and out of leaves.';
const msgs = buildGenerateMessages({ text: notes, cardCount: 4, quizCount: 3, difficulty: 'easy' });

test('mock provider output passes validation end-to-end', async () => {
  const res = await generateStudySet(mockCompletion, msgs);
  assert.equal(res.data.cards.length, 4);
  assert.equal(res.data.quiz.length, 3);
});

for (const [mode, expectation] of [
  ['fenced', { attempts: 1 }],
  ['flaky', { attempts: 2 }],
  ['partial', { warnings: true }],
  ['malformed', { error: 'MALFORMED_JSON' }],
  ['wrong-shape', { error: 'WRONG_SHAPE' }],
  ['empty', { error: 'EMPTY' }],
  ['fail', { error: 'UPSTREAM' }],
]) {
  test(`chaos "${mode}" is handled`, async () => {
    const run = generateStudySet(withChaos(mockCompletion, mode), msgs);
    if (expectation.error) return assert.rejects(run, { code: expectation.error });
    const res = await run;
    if (expectation.attempts) assert.equal(res.attempts, expectation.attempts);
    if (expectation.warnings) assert.ok(res.warnings.length > 0);
  });
}

test('chaos "hang" is cut off by the abort signal', async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(Object.assign(new Error('t'), { code: 'TIMEOUT' })), 50);
  await assert.rejects(generateStudySet(withChaos(mockCompletion, 'hang'), msgs, controller.signal), { code: 'TIMEOUT' });
});
