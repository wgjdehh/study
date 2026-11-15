// Request -> model -> validated StudySet, with one automatic repair attempt.

import { parseStudySet, StudySetError } from '../src/lib/studySet.js';
import { buildRepairMessages } from './prompt.js';

export const MAX_ATTEMPTS = 2; // original + 1 repair. More rarely helps and doubles latency.

/**
 * @param {(messages, signal) => Promise<string>} complete
 * @param {object[]} messages
 * @param {AbortSignal} signal
 * @returns {Promise<{data, warnings, attempts}>}
 * @throws StudySetError (bad output after all attempts) or ProviderError
 */
export async function generateStudySet(complete, messages, signal) {
  let conversation = messages;
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const raw = await complete(conversation, signal);
    try {
      const { data, warnings } = parseStudySet(raw);
      return { data, warnings, attempts: attempt };
    } catch (err) {
      if (!(err instanceof StudySetError)) throw err;
      lastError = err;
      console.warn(`[pipeline] attempt ${attempt} unusable (${err.code}): ${String(raw).slice(0, 120)}`);

      // "No usable items" usually means the input itself isn't studyable;
      // asking again won't help, so don't burn a second call on it.
      if (err.code === 'NO_USABLE_ITEMS') break;
      conversation = buildRepairMessages(messages, raw, err.message);
    }
  }
  throw lastError;
}
