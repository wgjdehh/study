import { useEffect, useRef } from 'react';
import { useElapsed } from '../hooks/useElapsed.js';

export function EmptyState({ onTrySample }) {
  return (
    <div className="panel empty-state">
      <h1>Turn your notes into something you can practise with.</h1>
      <ol className="steps">
        <li>
          <strong>Paste</strong> notes, or just type a topic.
        </li>
        <li>
          <strong>Flip</strong> through flashcards and mark what you know.
        </li>
        <li>
          <strong>Quiz</strong> yourself, then retest only what you missed.
        </li>
      </ol>
      <button type="button" className="btn btn-secondary" onClick={onTrySample}>
        Try it with sample notes
      </button>
    </div>
  );
}

export function LoadingState({ startedAt, onCancel }) {
  const seconds = useElapsed(startedAt);
  const message =
    seconds < 6
      ? 'Reading your notes and writing questions…'
      : seconds < 20
        ? 'Still working. Longer notes take a little longer.'
        : 'This is taking longer than usual. You can keep waiting or cancel and try again.';

  return (
    <div className="panel loading-state">
      <div className="loading-head">
        <span className="spinner" aria-hidden="true" />
        <p role="status">{message}</p>
        <span className="elapsed" aria-hidden="true">
          {seconds}s
        </span>
      </div>
      <div className="skeleton-card" aria-hidden="true">
        <div className="sk-line w60" />
        <div className="sk-line w90" />
        <div className="sk-line w40" />
      </div>
      <div className="skeleton-row" aria-hidden="true">
        <div className="sk-pill" />
        <div className="sk-pill" />
        <div className="sk-pill" />
      </div>
      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

const ERROR_TITLES = {
  TIMEOUT: 'That took too long',
  MALFORMED_JSON: "The AI's answer came back garbled",
  WRONG_SHAPE: "The AI's answer wasn't in the expected format",
  EMPTY: 'The AI sent back an empty answer',
  BAD_RESPONSE: 'We got an unexpected response',
  NO_USABLE_ITEMS: 'Nothing to study here',
  RATE_LIMITED: 'Too many requests right now',
  NETWORK: "Can't connect",
  SERVER_UNREACHABLE: "Can't reach the API server",
  CONFIG: "The server isn't set up correctly",
  INVALID_INPUT: 'Check your input',
  UPSTREAM: 'The AI service had a problem',
};

const ERROR_HINTS = {
  MALFORMED_JSON: 'This happens occasionally with AI models. We already retried once automatically; trying again usually works.',
  WRONG_SHAPE: 'We already retried once automatically. Trying again usually works.',
  EMPTY: 'Trying again usually works.',
  NO_USABLE_ITEMS: 'Try adding more detail, or describe the topic more specifically.',
  CONFIG: 'Check LLM_PROVIDER and LLM_API_KEY in the server’s .env file.',
};

export function ErrorState({ error, onRetry, onDismiss, dismissLabel = 'Dismiss' }) {
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), [error]);

  const title = ERROR_TITLES[error.code] ?? 'Something went wrong';
  const hint = ERROR_HINTS[error.code];

  return (
    <div className="panel error-state" role="alert" tabIndex={-1} ref={ref}>
      <div className="error-icon" aria-hidden="true">!</div>
      <h2>{title}</h2>
      <p>{error.message}</p>
      {hint && <p className="help">{hint}</p>}
      <div className="actions">
        {error.retryable !== false && (
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Try again
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onDismiss}>
          {dismissLabel}
        </button>
      </div>
      <p className="error-code">Error code: {error.code}</p>
    </div>
  );
}
