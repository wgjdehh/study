import { useState } from 'react';
import { useElapsed } from '../hooks/useElapsed.js';

const SUGGESTIONS = ['Make the quiz harder', 'Add 3 more flashcards', 'Use simpler language', 'Focus more on definitions'];

/**
 * Follow-up prompts that edit the current set instead of regenerating it.
 * If a refinement fails, the current set is untouched; we only say so.
 */
export default function RefineBar({ request, onSubmit, onUndo }) {
  const [text, setText] = useState('');
  const loading = request?.status === 'loading';
  const error = request?.status === 'error' ? request.error : null;
  const seconds = useElapsed(loading ? request.startedAt : null);

  const submit = (instruction) => {
    const value = instruction.trim();
    if (value.length < 3 || loading) return;
    onSubmit(value);
    setText('');
  };

  return (
    <section className="panel refine" aria-label="Refine this set">
      <div className="label-row">
        <h3>Refine this set</h3>
        {onUndo && !loading && (
          <button type="button" className="link-btn" onClick={onUndo}>
            Undo last change
          </button>
        )}
      </div>

      <form
        className="refine-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. add a question about RuBisCO"
          maxLength={500}
          disabled={loading}
          aria-label="How should the set change?"
        />
        <button type="submit" className="btn btn-primary" disabled={loading || text.trim().length < 3}>
          {loading ? `Updating… ${seconds}s` : 'Apply'}
        </button>
      </form>

      <div className="chips">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => submit(s)} disabled={loading}>
            {s}
          </button>
        ))}
      </div>

      {loading && (
        <p className="help" role="status">
          Updating your set. Your current cards stay usable until the new version arrives.{' '}
          <button type="button" className="link-btn" onClick={request.cancel}>
            Cancel
          </button>
        </p>
      )}

      {error && (
        <div className="banner banner-error inline" role="alert">
          <div>
            <strong>Couldn't apply that change.</strong> {error.message} Your current set hasn't changed.
          </div>
          <div className="actions">
            {error.retryable !== false && (
              <button type="button" className="btn btn-small" onClick={request.retry}>
                Retry
              </button>
            )}
            <button type="button" className="icon-btn" aria-label="Dismiss" onClick={request.dismiss}>
              ×
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
