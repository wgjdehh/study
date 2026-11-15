import { normalizeStudySet } from './studySet.js';

/** Every failure the UI can see is an ApiError with a code it can switch on. */
export class ApiError extends Error {
  constructor(code, message, { retryable = true, status } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

// Slightly longer than the server's per-attempt timeout x 2 attempts, so the
// server normally reports its own (more specific) timeout first.
const CLIENT_TIMEOUT_MS = 60_000;

/**
 * POST to a study-set endpoint and return a validated { data, warnings, meta }.
 * @param {string} path
 * @param {object} body
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} options
 *   signal: abort to cancel (user cancel, or superseded by a newer request)
 */
export async function postStudySet(path, body, { signal, timeoutMs = CLIENT_TIMEOUT_MS } = {}) {
  // One internal controller fed by both the caller's signal and our timeout,
  // so we can tell the two apart afterwards.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    let res;
    let payload = null;
    try {
      res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      payload = await res.json().catch(() => null); // body may be HTML or empty
    } catch {
      if (signal?.aborted) throw new ApiError('CANCELLED', 'Request cancelled.', { retryable: false });
      if (timedOut) throw new ApiError('TIMEOUT', `No response after ${Math.round(timeoutMs / 1000)}s.`);
      throw new ApiError('NETWORK', "Couldn't reach the server. Check your connection and try again.");
    }

    if (!res.ok) {
      const err = payload?.error;
      if (!err) {
        // e.g. the Vite proxy answering 502/500 because the API server isn't running
        throw new ApiError('SERVER_UNREACHABLE', `The API server didn't respond properly (HTTP ${res.status}). Is it running?`, {
          status: res.status,
        });
      }
      throw new ApiError(err.code || `HTTP_${res.status}`, err.message || `Server error (${res.status}).`, {
        retryable: err.retryable ?? res.status >= 500,
        status: res.status,
      });
    }

    if (!payload || typeof payload !== 'object') {
      throw new ApiError('BAD_RESPONSE', 'The server sent an unreadable response.');
    }

    // The server already validated this, but the UI depends on the shape, so we
    // check again at the boundary instead of trusting the network.
    try {
      const { data, warnings } = normalizeStudySet(payload.data);
      const allWarnings = [...new Set([...(Array.isArray(payload.warnings) ? payload.warnings : []), ...warnings])];
      return { data, warnings: allWarnings, meta: payload.meta ?? {} };
    } catch (err) {
      throw new ApiError(err.code || 'BAD_RESPONSE', err.message || 'The server sent data in an unexpected shape.');
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

export async function fetchHealth(signal) {
  const res = await fetch('/api/health', { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
