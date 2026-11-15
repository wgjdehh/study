// Demo "model" used when no API key is configured. It builds a crude study set
// from the notes so the whole UI can be exercised offline. It's deliberately
// simple: the real content quality comes from a real LLM.

import { sleep } from './sleep.js';

export async function mockCompletion(messages, signal) {
  await sleep(500 + Math.random() * 900, signal);

  // Always answer the FIRST user turn. On a repair turn that means we simply
  // return a valid set again, which is what a well-behaved model would do.
  const userTurn = messages.find((m) => m.role === 'user')?.content ?? '';

  if (userTurn.includes('<current_set>')) return JSON.stringify(refine(userTurn));
  return JSON.stringify(generate(userTurn));
}

function generate(prompt) {
  const notes = between(prompt, '<notes>', '</notes>');
  const cardCount = Number(prompt.match(/Create (\d+) flashcards/)?.[1] ?? 8);
  const quizCount = Number(prompt.match(/and (\d+) quiz/)?.[1] ?? 5);

  const facts = sentences(notes).map(toFact);
  if (facts.length === 0) return { title: '', cards: [], quiz: [] };

  const cards = facts.slice(0, cardCount).map((f) => ({ front: f.prompt, back: f.answer }));

  const quiz = facts.slice(0, quizCount).map((f, i) => {
    const distractors = facts
      .filter((other) => other !== f)
      .map((other) => other.answer)
      .concat(['None of the above', 'It is not mentioned in the notes', 'Both of the first two'])
      .filter((a, idx, arr) => a !== f.answer && arr.indexOf(a) === idx)
      .slice(0, 3);
    const answerIndex = i % 4;
    const options = [...distractors];
    options.splice(answerIndex, 0, f.answer);
    return {
      question: f.prompt,
      options,
      answerIndex,
      explanation: `From your notes: "${f.source}"`,
    };
  });

  // Use the first line as the title if it looks like a heading, else the first few words.
  const firstLine = notes.trim().split('\n')[0].trim();
  const title = firstLine.length <= 60 && !/[.!?]$/.test(firstLine) ? firstLine : notes.trim().split(/\s+/).slice(0, 5).join(' ') + '…';
  return { title, cards, quiz };
}

function refine(prompt) {
  const current = JSON.parse(between(prompt, '<current_set>', '</current_set>'));
  const change = prompt.split('Change:').pop().trim();
  const extra = Number(change.match(/(\d+)/)?.[1] ?? 2);

  if (/add|more/i.test(change) && current.cards.length) {
    for (let i = 0; i < Math.min(extra, 5); i++) {
      const base = current.cards[i % current.cards.length];
      current.cards.push({ front: `${base.front} (variation ${i + 1})`, back: base.back });
    }
  }
  if (/harder|difficult/i.test(change)) {
    current.quiz = current.quiz.map((q) => ({ ...q, question: `[Harder] ${q.question}` }));
  }
  if (/remove|delete|fewer/i.test(change)) {
    current.cards = current.cards.slice(0, Math.max(1, current.cards.length - extra));
  }
  return current;
}

function between(text, start, end) {
  const s = text.indexOf(start);
  const e = text.lastIndexOf(end);
  return s === -1 || e === -1 ? text : text.slice(s + start.length, e).trim();
}

function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((s) => s.split(/\s+/).length >= 4);
}

function toFact(sentence) {
  const clean = sentence.replace(/[.!?]+$/, '');
  const def = clean.match(/^(.{2,60}?)\s+(is|are|was|were|means|refers to)\s+(.+)$/i);
  if (def) {
    const subject = def[1].replace(/^(A|An|The)\b/, (m) => m.toLowerCase());
    return { prompt: `What ${def[2].toLowerCase() === 'are' ? 'are' : 'is'} ${subject}?`, answer: capitalise(def[3]), source: sentence };
  }
  const colon = clean.match(/^(.{2,60}?):\s+(.+)$/);
  if (colon) return { prompt: `What is ${colon[1]}?`, answer: capitalise(colon[2]), source: sentence };

  const words = clean.split(/\s+/);
  const cut = Math.ceil(words.length / 2);
  return { prompt: `Complete: "${words.slice(0, cut).join(' ')} …"`, answer: `… ${words.slice(cut).join(' ')}`, source: sentence };
}

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
