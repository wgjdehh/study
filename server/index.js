// Small API server. Its main job: keep the API key off the browser.
import 'dotenv/config';
import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { chatCompletion, getConfig, ProviderError } from './providers.js';
import { buildGenerateMessages, buildRefineMessages } from './prompt.js';
import { generateStudySet } from './pipeline.js';
import { CHAOS_MODES, chaosEnabled, withChaos } from './chaos.js';
import { normalizeStudySet, StudySetError } from '../src/lib/studySet.js';

const config = getConfig();
const app = express();
app.use(express.json({ limit: '100kb' }));

const LIMITS = { minText: 20, maxText: 12_000, maxInstruction: 500, maxCards: 30, maxQuiz: 20 };

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    provider: config.provider,
    model: config.model,
    chaos: chaosEnabled() ? CHAOS_MODES : null,
  });
});

app.post('/api/study-set', (req, res) => {
  const { text, cardCount, quizCount, difficulty } = req.body ?? {};

  if (typeof text !== 'string' || text.trim().length < LIMITS.minText) {
    return sendError(res, 400, 'INVALID_INPUT', `Please enter at least ${LIMITS.minText} characters of notes or a topic.`);
  }
  if (text.length > LIMITS.maxText) {
    return sendError(res, 400, 'INVALID_INPUT', `Notes are too long (max ${LIMITS.maxText.toLocaleString()} characters).`);
  }

  const messages = buildGenerateMessages({
    text: text.trim(),
    cardCount: clampInt(cardCount, 0, LIMITS.maxCards, 8),
    quizCount: clampInt(quizCount, 0, LIMITS.maxQuiz, 5),
    difficulty: ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium',
  });
  return run(req, res, messages);
});

app.post('/api/study-set/refine', (req, res) => {
  const { current, instruction } = req.body ?? {};

  if (typeof instruction !== 'string' || instruction.trim().length < 3) {
    return sendError(res, 400, 'INVALID_INPUT', 'Describe how you want to change the set.');
  }
  if (instruction.length > LIMITS.maxInstruction) {
    return sendError(res, 400, 'INVALID_INPUT', `Keep the instruction under ${LIMITS.maxInstruction} characters.`);
  }
  // The client's "current" set is untrusted input too.
  let validCurrent;
  try {
    validCurrent = normalizeStudySet(current).data;
  } catch {
    return sendError(res, 400, 'INVALID_INPUT', 'The current study set is invalid; generate a new one.');
  }
  return run(req, res, buildRefineMessages({ current: validCurrent, instruction: instruction.trim() }));
});

async function run(req, res, messages) {
  const started = Date.now();

  // Abort the model call on timeout OR if the browser goes away (user cancelled /
  // sent a newer request). No point paying for tokens nobody will read.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new ProviderError('TIMEOUT', 'The AI took too long to respond.'));
  }, config.timeoutMs);
  res.on('close', () => {
    if (!res.writableEnded) controller.abort(new ProviderError('CANCELLED', 'Client disconnected.'));
  });

  const chaosMode = chaosEnabled() ? req.body?.chaos : undefined;
  const complete = withChaos((msgs, signal) => chatCompletion(config, msgs, signal), chaosMode);

  try {
    const { data, warnings, attempts } = await generateStudySet(complete, messages, controller.signal);
    res.json({
      data,
      warnings,
      meta: { provider: config.provider, model: config.model, attempts, ms: Date.now() - started },
    });
  } catch (err) {
    if (res.writableEnded || res.destroyed) return; // client already gone
    if (timedOut || err?.code === 'TIMEOUT') {
      return sendError(res, 504, 'TIMEOUT', `The AI took longer than ${Math.round(config.timeoutMs / 1000)}s to respond.`, true);
    }
    if (err instanceof StudySetError) {
      const retryable = err.code !== 'NO_USABLE_ITEMS';
      return sendError(res, 502, err.code, err.message, retryable);
    }
    if (err instanceof ProviderError) {
      return sendError(res, err.code === 'CONFIG' ? 500 : 502, err.code, err.message, err.retryable);
    }
    console.error('[server] unexpected error', err);
    return sendError(res, 500, 'INTERNAL', 'Something went wrong on the server.', true);
  } finally {
    clearTimeout(timer);
  }
}

function sendError(res, status, code, message, retryable = false) {
  res.status(status).json({ error: { code, message, retryable } });
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : Math.min(max, Math.max(min, n));
}

// Serve the production build if it exists (`npm run build && npm run server`).
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const PORT = Number(process.env.PORT) || 8787;
app.listen(PORT, () => {
  const mode = config.provider === 'mock' ? 'DEMO MODE (no API key; set LLM_API_KEY in .env)' : `${config.provider} / ${config.model}`;
  console.log(`[server] http://localhost:${PORT}  ·  ${mode}`);
});
