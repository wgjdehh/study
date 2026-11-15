/**
 * Turning untrusted model output into a StudySet the UI can rely on.
 *
 * This module is shared by the server (to decide whether to auto-repair) and the
 * client (so the UI never trusts the network, or localStorage, blindly).
 * It has no dependencies so it runs in both Node and the browser.
 *
 * Shape the UI relies on:
 *   StudySet = {
 *     title: string,
 *     cards: { id, front, back }[],
 *     quiz:  { id, question, options: string[], answerIndex, explanation }[]
 *   }
 *
 * Philosophy: be strict about what reaches the UI, lenient about what we accept.
 * Models often return near-misses (code fences, "answer": "B", an "answer" key
 * instead of "back"). We salvage those, drop items we can't trust, and report
 * what was dropped as warnings instead of failing the whole response.
 */

export const LIMITS = {
  maxCards: 30,
  maxQuestions: 20,
  minOptions: 2,
  maxOptions: 6,
  maxFieldLength: 600,
  maxTitleLength: 120,
};

/** Error with a machine-readable code so callers can choose how to react. */
export class StudySetError extends Error {
  /**
   * @param {'EMPTY'|'MALFORMED_JSON'|'WRONG_SHAPE'|'NO_USABLE_ITEMS'} code
   * @param {string} message user-facing explanation
   */
  constructor(code, message) {
    super(message);
    this.name = 'StudySetError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Step 1: raw text -> JSON value                                      */
/* ------------------------------------------------------------------ */

/**
 * Pull a JSON value out of whatever text the model returned.
 * Handles: ```json fences, prose before/after the object, trailing commas.
 * Throws StudySetError('EMPTY' | 'MALFORMED_JSON').
 */
export function extractJson(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new StudySetError('EMPTY', 'The AI returned an empty response.');
  }

  let text = raw.trim();

  // ```json ... ``` (take the first fenced block if present)
  const fence = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence && fence[1].trim()) text = fence[1].trim();

  const candidates = [text];

  // "Sure! Here is your JSON: { ... } Hope this helps" -> outermost {...}.
  // Only look for a bare [...] if it starts before any '{'. Otherwise a truncated
  // object could "succeed" by matching an inner array and silently lose data.
  const objStart = text.indexOf('{');
  const arrStart = text.indexOf('[');
  const [open, close, start] =
    arrStart !== -1 && (objStart === -1 || arrStart < objStart) ? ['[', ']', arrStart] : ['{', '}', objStart];
  const end = text.lastIndexOf(close);
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates) {
    const parsed = tryParse(candidate) ?? tryParse(stripTrailingCommas(candidate));
    if (parsed !== undefined) return parsed;
  }

  throw new StudySetError(
    'MALFORMED_JSON',
    "The AI's response wasn't valid JSON (it may have been cut off).",
  );
}

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Only used as a fallback after a strict parse fails, so the (small) risk of
// touching a string that legitimately contains ",}" is acceptable.
function stripTrailingCommas(text) {
  return text.replace(/,\s*([}\]])/g, '$1');
}

/* ------------------------------------------------------------------ */
/* Step 2: JSON value -> validated StudySet                            */
/* ------------------------------------------------------------------ */

/**
 * Validate and normalise anything into a StudySet.
 * Returns { data, warnings }. Throws StudySetError when nothing usable remains.
 */
export function normalizeStudySet(value) {
  const root = unwrap(value);
  if (!isPlainObject(root)) {
    throw new StudySetError(
      'WRONG_SHAPE',
      "The AI's response didn't contain flashcards or quiz questions.",
    );
  }

  const rawCards = pickArray(root, ['cards', 'flashcards', 'flashCards']);
  const rawQuiz = pickArray(root, ['quiz', 'questions', 'quizQuestions', 'mcq']);

  if (rawCards === undefined && rawQuiz === undefined) {
    throw new StudySetError(
      'WRONG_SHAPE',
      "The AI's response didn't contain flashcards or quiz questions.",
    );
  }

  const warnings = [];

  const cards = normalizeCards(rawCards ?? [], warnings);
  const quiz = normalizeQuiz(rawQuiz ?? [], warnings);

  if (cards.length === 0 && quiz.length === 0) {
    throw new StudySetError(
      'NO_USABLE_ITEMS',
      "The AI didn't produce any usable flashcards or questions. Try adding more detail to your notes.",
    );
  }

  const title = cleanText(root.title ?? root.topic ?? root.name, LIMITS.maxTitleLength) || 'Study set';

  return { data: { title, cards, quiz }, warnings };
}

/** Convenience: raw model text -> { data, warnings }. */
export function parseStudySet(raw) {
  return normalizeStudySet(extractJson(raw));
}

/* ---------------------------- cards -------------------------------- */

function normalizeCards(rawCards, warnings) {
  const cards = [];
  const seen = new Set();
  let skipped = 0;
  let duplicates = 0;

  for (const item of rawCards) {
    if (cards.length >= LIMITS.maxCards) break;
    if (!isPlainObject(item)) {
      skipped++;
      continue;
    }
    const front = cleanText(item.front ?? item.question ?? item.term ?? item.q ?? item.prompt);
    const back = cleanText(item.back ?? item.answer ?? item.definition ?? item.a);
    if (!front || !back) {
      skipped++;
      continue;
    }
    const key = front.toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    cards.push({ id: `c${cards.length + 1}`, front, back });
  }

  if (rawCards.length > LIMITS.maxCards + skipped + duplicates) {
    warnings.push(`Only the first ${LIMITS.maxCards} flashcards were kept.`);
  }
  if (skipped) warnings.push(plural(skipped, 'flashcard was', 'flashcards were') + ' incomplete and skipped.');
  if (duplicates) warnings.push(plural(duplicates, 'duplicate flashcard was', 'duplicate flashcards were') + ' removed.');
  return cards;
}

/* ----------------------------- quiz -------------------------------- */

function normalizeQuiz(rawQuiz, warnings) {
  const quiz = [];
  let skipped = 0;

  for (const item of rawQuiz) {
    if (quiz.length >= LIMITS.maxQuestions) break;
    const q = normalizeQuestion(item);
    if (!q) {
      skipped++;
      continue;
    }
    quiz.push({ id: `q${quiz.length + 1}`, ...q });
  }

  if (rawQuiz.length > LIMITS.maxQuestions + skipped) {
    warnings.push(`Only the first ${LIMITS.maxQuestions} questions were kept.`);
  }
  if (skipped) {
    warnings.push(
      plural(skipped, 'quiz question was', 'quiz questions were') +
        ' malformed (e.g. missing options or an unclear correct answer) and skipped.',
    );
  }
  return quiz;
}

/** Returns a clean question or null if it can't be trusted. */
function normalizeQuestion(item) {
  if (!isPlainObject(item)) return null;

  const question = cleanText(item.question ?? item.prompt ?? item.q ?? item.text);
  if (!question) return null;

  // options may be an array, or an object like { A: "...", B: "..." }
  let rawOptions = item.options ?? item.choices ?? item.answers;
  if (isPlainObject(rawOptions)) rawOptions = Object.values(rawOptions);
  if (!Array.isArray(rawOptions)) return null;

  const original = rawOptions.map((o) => cleanText(isPlainObject(o) ? o.text ?? o.option : o));

  // Work out which ORIGINAL option is correct before we dedupe/filter,
  // otherwise indices would shift underneath us.
  const correctOriginal = resolveAnswerIndex(item, original);
  if (correctOriginal === -1 || !original[correctOriginal]) return null;
  const correctText = original[correctOriginal];

  // Remove blanks + case-insensitive duplicates.
  const options = [];
  const seen = new Set();
  for (const opt of original) {
    const key = opt.toLowerCase();
    if (!opt || seen.has(key)) continue;
    seen.add(key);
    options.push(opt);
  }

  if (options.length < LIMITS.minOptions || options.length > LIMITS.maxOptions) return null;

  const answerIndex = options.findIndex((o) => o.toLowerCase() === correctText.toLowerCase());
  if (answerIndex === -1) return null;

  const explanation = cleanText(item.explanation ?? item.rationale ?? item.reason);
  return { question, options, answerIndex, explanation };
}

/**
 * Models express the correct answer in many ways. Accepts:
 *   answerIndex: 2           (0-based integer, the format we ask for)
 *   answer: "B" / "b)" / "Option B"
 *   answer: "Paris"          (the option's text)
 * Returns -1 if it can't be resolved unambiguously. We deliberately do NOT
 * guess whether an out-of-range number was meant to be 1-based.
 */
function resolveAnswerIndex(item, options) {
  const indexValue = item.answerIndex ?? item.correctIndex ?? item.correctOptionIndex;
  if (indexValue !== undefined) {
    const n = typeof indexValue === 'string' && /^\d+$/.test(indexValue.trim()) ? Number(indexValue) : indexValue;
    return Number.isInteger(n) && n >= 0 && n < options.length ? n : -1;
  }

  const answer = item.answer ?? item.correct ?? item.correctAnswer;
  if (typeof answer === 'number') {
    return Number.isInteger(answer) && answer >= 0 && answer < options.length ? answer : -1;
  }
  if (typeof answer !== 'string' || !answer.trim()) return -1;

  const a = answer.trim();

  // Exact text match first ("A" could legitimately be an option's text).
  const textMatch = options.findIndex((o) => o.toLowerCase() === a.toLowerCase());
  if (textMatch !== -1) return textMatch;

  // Letter forms: "B", "b)", "(B)", "Option B", "B. Paris"
  const letter = a.match(/^(?:option\s*)?\(?([A-F])\)?(?:[.):\s]|$)/i);
  if (letter) {
    const idx = letter[1].toUpperCase().charCodeAt(0) - 65;
    if (idx < options.length) return idx;
  }
  return -1;
}

/* ---------------------------- helpers ------------------------------ */

/** Unwrap { data: {...} } / { studySet: {...} } and bare arrays of cards. */
function unwrap(value) {
  if (Array.isArray(value)) return { cards: value };
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && isPlainObject(value[keys[0]])) {
      const inner = value[keys[0]];
      if ('cards' in inner || 'quiz' in inner || 'flashcards' in inner || 'questions' in inner) return inner;
    }
  }
  return value;
}

function pickArray(obj, keys) {
  for (const key of keys) {
    if (key in obj) return Array.isArray(obj[key]) ? obj[key] : [];
  }
  return undefined;
}

function cleanText(value, max = LIMITS.maxFieldLength) {
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
  if (typeof value !== 'string') return '';
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function plural(n, singular, pluralForm) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}
