import { useEffect, useRef } from 'react';

export default function SessionsDrawer({ open, sessions, currentId, onLoad, onDelete, onClose }) {
  const closeRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previousFocus.current = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previousFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <h2 id="drawer-title">Saved sets</h2>
          <button type="button" ref={closeRef} className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {sessions.length === 0 ? (
          <p className="help drawer-empty">Sets you generate are saved here automatically (in this browser only).</p>
        ) : (
          <ul className="session-list">
            {sessions.map((s) => (
              <li key={s.id} className={s.id === currentId ? 'is-current' : ''}>
                <button type="button" className="session-open" onClick={() => onLoad(s)}>
                  <span className="session-title">{s.data.title}</span>
                  <span className="session-meta">
                    {s.data.cards.length} cards · {s.data.quiz.length} questions · {formatDate(s.updatedAt)}
                  </span>
                </button>
                <button type="button" className="icon-btn" aria-label={`Delete ${s.data.title}`} onClick={() => onDelete(s.id)}>
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatDate(ts) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(ts);
  } catch {
    return '';
  }
}
