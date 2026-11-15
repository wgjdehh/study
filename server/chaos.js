// Failure simulator. Lets you (and reviewers) trigger every bad-output case on
// demand instead of waiting for the model to misbehave. Works with any provider:
// it wraps the real call and corrupts or replaces what comes back.
// Disabled when ALLOW_CHAOS=false or NODE_ENV=production.

import { sleep } from './sleep.js';
import { ProviderError } from './providers.js';

export const CHAOS_MODES = {
  fenced: 'Wrapped in ```json fences + chatty prose (parser should recover)',
  partial: 'Some items broken (bad items dropped, warnings shown)',
  flaky: 'Malformed on 1st attempt only (server auto-repair recovers)',
  malformed: 'Truncated JSON every attempt (error + retry)',
  'wrong-shape': 'Valid JSON, wrong shape (error + retry)',
  empty: 'Empty response (error + retry)',
  slow: 'Responds after ~6s (loading states; send another request to test stale handling)',
  hang: 'Never responds (server timeout)',
  fail: 'Provider returns HTTP 500',
  'rate-limit': 'Provider returns HTTP 429',
};

export function chaosEnabled(env = process.env) {
  return env.ALLOW_CHAOS !== 'false' && env.NODE_ENV !== 'production';
}

/**
 * Wraps a completion function so its output can be sabotaged.
 * @param {(messages, signal) => Promise<string>} complete
 * @param {string|undefined} mode
 */
export function withChaos(complete, mode) {
  if (!mode || !(mode in CHAOS_MODES)) return complete;
  let attempt = 0;

  return async (messages, signal) => {
    attempt++;
    switch (mode) {
      case 'fail':
        throw new ProviderError('UPSTREAM', 'The AI provider returned an error (500). [simulated]', { status: 500 });
      case 'rate-limit':
        throw new ProviderError('RATE_LIMITED', 'The AI provider is rate-limiting requests. [simulated]', { status: 429 });
      case 'hang':
        await sleep(10 * 60_000, signal); // aborted by the server timeout
        return '';
      case 'slow':
        await sleep(6000, signal);
        return complete(messages, signal);
      case 'empty':
        return '';
      case 'wrong-shape':
        return JSON.stringify({ response: 'Here are some flashcards about your topic!', items: 3 });
      default:
        break;
    }

    const real = await complete(messages, signal);

    if (mode === 'malformed' || (mode === 'flaky' && attempt === 1)) {
      return real.slice(0, Math.floor(real.length * 0.6)); // cut off mid-object
    }
    if (mode === 'fenced') {
      return `Sure! Here's your study set:\n\n\`\`\`json\n${real}\n\`\`\`\n\nLet me know if you'd like more.`;
    }
    if (mode === 'partial') {
      const data = JSON.parse(real);
      if (data.cards?.[0]) data.cards[0] = { front: data.cards[0].front }; // missing back
      if (data.cards?.length > 1) data.cards.push({ ...data.cards[1] }); // duplicate
      if (data.quiz?.[0]) data.quiz[0].answerIndex = 9; // out of range
      if (data.quiz?.length > 1) data.quiz[1] = { ...data.quiz[1], answerIndex: undefined, answer: 'B' }; // letter answer (salvaged)
      return JSON.stringify(data);
    }
    return real;
  };
}
