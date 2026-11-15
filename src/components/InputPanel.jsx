const MIN_CHARS = 20;
const MAX_CHARS = 12_000;

export default function InputPanel({
  draft,
  onChange,
  onSubmit,
  onTrySample,
  busy,
  chaosModes,
  collapsed,
  onExpand,
  textareaRef,
}) {
  const length = draft.text.trim().length;
  const tooShort = length < MIN_CHARS;
  const tooLong = draft.text.length > MAX_CHARS;
  const canSubmit = !tooShort && !tooLong;
  const set = (field) => (e) => onChange((d) => ({ ...d, [field]: e.target.value }));
  const setNumber = (field) => (e) => onChange((d) => ({ ...d, [field]: Number(e.target.value) }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canSubmit) onSubmit();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e);
  };

  return (
    <aside className={`panel input-panel ${collapsed ? 'is-collapsed' : ''}`}>
      {collapsed && (
        <button type="button" className="collapsed-bar" onClick={onExpand} aria-expanded="false">
          <span>Edit notes / generate a new set</span>
          <span aria-hidden="true">▾</span>
        </button>
      )}

      <form className="input-form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <div className="label-row">
            <label htmlFor="notes">Your notes or a topic</label>
            <button type="button" className="link-btn" onClick={onTrySample}>
              Use sample notes
            </button>
          </div>
          <textarea
            id="notes"
            ref={textareaRef}
            value={draft.text}
            onChange={set('text')}
            onKeyDown={handleKeyDown}
            placeholder={'Paste lecture notes, a textbook section, or just type a topic like "the causes of World War I".'}
            rows={10}
            aria-describedby="notes-help"
            aria-invalid={tooLong}
          />
          <div id="notes-help" className={`help ${tooLong ? 'help-error' : ''}`}>
            {tooLong
              ? `Too long: ${draft.text.length.toLocaleString()} / ${MAX_CHARS.toLocaleString()} characters.`
              : tooShort && length > 0
                ? `A bit more please: at least ${MIN_CHARS} characters.`
                : `${draft.text.length.toLocaleString()} / ${MAX_CHARS.toLocaleString()}`}
          </div>
        </div>

        <div className="options-row">
          <div className="field">
            <label htmlFor="cardCount">Flashcards</label>
            <select id="cardCount" value={draft.cardCount} onChange={setNumber('cardCount')}>
              {[0, 5, 8, 12, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="quizCount">Questions</label>
            <select id="quizCount" value={draft.quizCount} onChange={setNumber('quizCount')}>
              {[0, 3, 5, 8, 12].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="difficulty">Difficulty</label>
            <select id="difficulty" value={draft.difficulty} onChange={set('difficulty')}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>

        {chaosModes && (
          <details className="chaos">
            <summary>Failure simulator (dev)</summary>
            <p className="help">Force the AI to misbehave to see how the app copes.</p>
            <select aria-label="Simulated failure" value={draft.chaos} onChange={set('chaos')}>
              <option value="">Off: normal behaviour</option>
              {Object.entries(chaosModes).map(([mode, desc]) => (
                <option key={mode} value={mode}>
                  {mode}: {desc}
                </option>
              ))}
            </select>
          </details>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={!canSubmit || (draft.cardCount === 0 && draft.quizCount === 0)}
        >
          {busy ? 'Generating… (click to restart)' : 'Generate study set'}
        </button>
        <p className="help center">
          <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> to generate
        </p>
      </form>
    </aside>
  );
}
