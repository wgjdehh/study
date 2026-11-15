import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, normalizeStudySet, parseStudySet, StudySetError } from '../src/lib/studySet.js';

const good = {
  title: 'Cells',
  cards: [{ front: 'What is a cell?', back: 'The basic unit of life.' }],
  quiz: [{ question: 'Powerhouse of the cell?', options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi'], answerIndex: 1, explanation: 'ATP.' }],
};

const codeOf = (fn) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof StudySetError, `expected StudySetError, got ${e}`);
    return e.code;
  }
  assert.fail('expected an error');
};

test('parses clean JSON', () => {
  const { data, warnings } = parseStudySet(JSON.stringify(good));
  assert.equal(data.title, 'Cells');
  assert.equal(data.cards[0].id, 'c1');
  assert.equal(data.quiz[0].answerIndex, 1);
  assert.deepEqual(warnings, []);
});

test('recovers JSON from code fences and surrounding prose', () => {
  const raw = `Sure! Here you go:\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\`\nHope it helps!`;
  assert.equal(parseStudySet(raw).data.cards.length, 1);
  const noFence = `Here is the JSON: ${JSON.stringify(good)} Enjoy.`;
  assert.equal(parseStudySet(noFence).data.quiz.length, 1);
});

test('tolerates trailing commas', () => {
  assert.equal(extractJson('{"cards": [{"front":"a","back":"b"},],}').cards.length, 1);
});

test('empty / whitespace / non-string -> EMPTY', () => {
  assert.equal(codeOf(() => extractJson('')), 'EMPTY');
  assert.equal(codeOf(() => extractJson('   \n')), 'EMPTY');
  assert.equal(codeOf(() => extractJson(null)), 'EMPTY');
});

test('truncated JSON -> MALFORMED_JSON', () => {
  const raw = JSON.stringify(good);
  assert.equal(codeOf(() => parseStudySet(raw.slice(0, raw.length / 2))), 'MALFORMED_JSON');
});

test('valid JSON with the wrong shape -> WRONG_SHAPE', () => {
  assert.equal(codeOf(() => parseStudySet('{"response":"hello"}')), 'WRONG_SHAPE');
  assert.equal(codeOf(() => parseStudySet('"just a string"')), 'WRONG_SHAPE');
  assert.equal(codeOf(() => parseStudySet('42')), 'WRONG_SHAPE');
});

test('correct keys but nothing usable -> NO_USABLE_ITEMS', () => {
  assert.equal(codeOf(() => normalizeStudySet({ title: '', cards: [], quiz: [] })), 'NO_USABLE_ITEMS');
  assert.equal(codeOf(() => normalizeStudySet({ cards: [{ front: '' }, null, 5] })), 'NO_USABLE_ITEMS');
});

test('cards: accepts aliases, drops incomplete + duplicates with warnings', () => {
  const { data, warnings } = normalizeStudySet({
    flashcards: [
      { question: 'Q1', answer: 'A1' },
      { term: 'T2', definition: 'D2' },
      { front: 'q1', back: 'dup (case-insensitive)' },
      { front: 'no back' },
      'not an object',
    ],
  });
  assert.deepEqual(data.cards.map((c) => c.front), ['Q1', 'T2']);
  assert.equal(data.quiz.length, 0);
  assert.equal(warnings.length, 2);
});

test('top-level array is treated as cards; wrapper objects are unwrapped', () => {
  assert.equal(parseStudySet('[{"front":"a","back":"b"}]').data.cards.length, 1);
  assert.equal(normalizeStudySet({ studySet: good }).data.title, 'Cells');
});

test('quiz: resolves letter and text answers', () => {
  const opts = ['Paris', 'London', 'Rome', 'Berlin'];
  const { data } = normalizeStudySet({
    quiz: [
      { question: 'a', options: opts, answer: 'C' },
      { question: 'b', options: opts, answer: 'b)' },
      { question: 'c', options: opts, answer: 'Option D' },
      { question: 'd', options: opts, answer: 'berlin' },
      { question: 'e', options: opts, correctAnswer: 'Paris' },
      { question: 'f', options: opts, answerIndex: '2' },
      { question: 'g', choices: { A: 'x', B: 'y' }, answer: 'B' },
    ],
  });
  assert.deepEqual(data.quiz.map((q) => q.answerIndex), [2, 1, 3, 3, 0, 2, 1]);
});

test('quiz: an option whose text is a letter is matched by text first', () => {
  const { data } = normalizeStudySet({ quiz: [{ question: 'Grade?', options: ['B', 'A', 'C'], answer: 'A' }] });
  assert.equal(data.quiz[0].answerIndex, 1);
});

test('quiz: drops unresolvable questions (no guessing 1-based indices)', () => {
  const opts = ['w', 'x', 'y', 'z'];
  const { data, warnings } = normalizeStudySet({
    cards: [{ front: 'keep', back: 'me' }],
    quiz: [
      { question: 'out of range', options: opts, answerIndex: 4 },
      { question: 'negative', options: opts, answerIndex: -1 },
      { question: 'no answer', options: opts },
      { question: 'unknown text', options: opts, answer: 'banana' },
      { question: 'one option', options: ['only'], answerIndex: 0 },
      { question: 'too many', options: ['1', '2', '3', '4', '5', '6', '7'], answerIndex: 0 },
      { question: 'options not array', options: 'a,b,c', answerIndex: 0 },
      { options: opts, answerIndex: 0 },
    ],
  });
  assert.equal(data.quiz.length, 0);
  assert.match(warnings[0], /8 quiz questions were malformed/);
});

test('quiz: deduping options keeps answerIndex pointing at the right text', () => {
  const { data } = normalizeStudySet({
    quiz: [{ question: 'q', options: ['Alpha', 'alpha', '', 'Gamma', 'Delta'], answerIndex: 3 }],
  });
  const q = data.quiz[0];
  assert.deepEqual(q.options, ['Alpha', 'Gamma', 'Delta']);
  assert.equal(q.options[q.answerIndex], 'Gamma');
});

test('caps counts, trims/collapses whitespace, truncates very long text, defaults title', () => {
  const cards = Array.from({ length: 40 }, (_, i) => ({ front: `  Q   ${i} `, back: 'x'.repeat(2000) }));
  const { data, warnings } = normalizeStudySet({ cards });
  assert.equal(data.cards.length, 30);
  assert.equal(data.cards[0].front, 'Q 0');
  assert.ok(data.cards[0].back.length <= 600);
  assert.equal(data.title, 'Study set');
  assert.ok(warnings.some((w) => w.includes('first 30')));
});

test('numbers are accepted as option text; numeric answer is an index', () => {
  const { data } = normalizeStudySet({
    quiz: [
      { question: '2+2?', options: [3, 4, 5], answer: '4' },
      { question: '1+1?', options: [1, 2, 3], answer: 1 },
    ],
  });
  assert.deepEqual(data.quiz[0].options, ['3', '4', '5']);
  assert.equal(data.quiz[0].answerIndex, 1);
  assert.equal(data.quiz[1].answerIndex, 1);
});

test('a truncated object is not "rescued" by matching an inner array', () => {
  const raw = '{"title":"x","cards":[{"front":"a","back":"b"}],"quiz":[{"question":"q","options":["1","2"]';
  assert.equal(codeOf(() => parseStudySet(raw)), 'MALFORMED_JSON');
});
