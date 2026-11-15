// Talks to the LLM. Every supported provider exposes an OpenAI-compatible
// /chat/completions endpoint, so a single fetch call covers all of them.
// No SDK on purpose: it's one HTTP request, and this keeps it easy to explain.

import { mockCompletion } from './mock.js';

const PRESETS = {
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', needsKey: true },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', needsKey: true },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', needsKey: true },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', needsKey: true },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', needsKey: false },
  mock: { baseUrl: '', model: 'mock', needsKey: false },
};

export class ProviderError extends Error {
  /** @param {'CONFIG'|'RATE_LIMITED'|'UPSTREAM'|'TIMEOUT'|'CANCELLED'} code */
  constructor(code, message, { status, retryable = true } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function getConfig(env = process.env) {
  // No provider + no key = demo mode, so `npm install && npm start` always works.
  const name = (env.LLM_PROVIDER || (env.LLM_API_KEY ? 'groq' : 'mock')).toLowerCase();
  const preset = PRESETS[name] ?? PRESETS.groq;
  return {
    provider: PRESETS[name] ? name : 'custom',
    baseUrl: (env.LLM_BASE_URL || preset.baseUrl).replace(/\/$/, ''),
    model: env.LLM_MODEL || preset.model,
    apiKey: env.LLM_API_KEY || '',
    needsKey: PRESETS[name] ? preset.needsKey : false,
    jsonMode: env.LLM_JSON_MODE !== 'false',
    timeoutMs: Number(env.LLM_TIMEOUT_MS) || 25_000,
  };
}

/**
 * Send chat messages, return the assistant's raw text.
 * @param {object} config from getConfig()
 * @param {{role:string, content:string}[]} messages
 * @param {AbortSignal} signal aborted on timeout or client disconnect
 */
export async function chatCompletion(config, messages, signal) {
  if (config.provider === 'mock') return mockCompletion(messages, signal);

  if (config.needsKey && !config.apiKey) {
    throw new ProviderError('CONFIG', `LLM_API_KEY is not set for provider "${config.provider}". See README.`, {
      retryable: false,
    });
  }

  const body = {
    model: config.model,
    messages,
    temperature: 0.4,
    // JSON mode makes valid JSON far more likely, but it's a hint, not a guarantee:
    // we still validate everything that comes back.
    ...(config.jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };

  let res;
  try {
    res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw signal.reason ?? err;
    throw new ProviderError('UPSTREAM', `Couldn't reach the AI provider (${err.cause?.code || err.message}).`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.warn(`[llm] ${res.status} from provider: ${detail.slice(0, 300)}`);
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError('CONFIG', 'The AI provider rejected the API key.', { status: res.status, retryable: false });
    }
    if (res.status === 429) {
      throw new ProviderError('RATE_LIMITED', 'The AI provider is rate-limiting requests. Wait a moment and retry.', {
        status: res.status,
      });
    }
    throw new ProviderError('UPSTREAM', `The AI provider returned an error (${res.status}).`, { status: res.status });
  }

  const json = await res.json().catch(() => null);
  const choice = json?.choices?.[0];
  if (choice?.finish_reason === 'length') {
    console.warn('[llm] response was truncated (finish_reason=length)');
  }
  // content can legitimately be null/missing; the validator turns that into an EMPTY error.
  return typeof choice?.message?.content === 'string' ? choice.message.content : '';
}
