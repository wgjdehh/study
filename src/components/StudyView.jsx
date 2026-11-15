import { useState } from 'react';
import Flashcards from './Flashcards.jsx';
import Quiz from './Quiz.jsx';
import RefineBar from './RefineBar.jsx';

export default function StudyView({ session, onRefine, refineRequest, onUndo }) {
  const { data, warnings, meta, version } = session;
  const [tab, setTab] = useState(data.cards.length ? 'cards' : 'quiz');
  const [warningsHidden, setWarningsHidden] = useState(false);

  // If a refinement removed everything from the active tab, fall back to the other one.
  const activeTab = tab === 'cards' && !data.cards.length ? 'quiz' : tab === 'quiz' && !data.quiz.length ? 'cards' : tab;

  const tabs = [
    { id: 'cards', label: 'Flashcards', count: data.cards.length },
    { id: 'quiz', label: 'Quiz', count: data.quiz.length },
  ];

  return (
    <div className="study-view">
      <div className="study-head">
        <h1 className="study-title">{data.title}</h1>
        <p className="study-meta">
          {data.cards.length} cards · {data.quiz.length} questions
          {meta?.attempts > 1 && <span className="tag" title="The first AI response was unusable, so the server asked it to fix its answer.">auto-repaired</span>}
          {meta?.provider === 'mock' && <span className="tag">demo</span>}
        </p>
      </div>

      {warnings?.length > 0 && !warningsHidden && (
        <div className="banner banner-warn" role="status">
          <div>
            <strong>Some of the AI's output was unusable and was left out:</strong>
            <ul>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setWarningsHidden(true)}>
            ×
          </button>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Study mode">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={activeTab === t.id}
            aria-controls={`panel-${t.id}`}
            className="tab"
            disabled={t.count === 0}
            onClick={() => setTab(t.id)}
          >
            {t.label} <span className="count">{t.count}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {/* key={version}: a refined set starts a fresh round instead of mixing old progress with new items */}
        {activeTab === 'cards' ? (
          <Flashcards key={version} cards={data.cards} />
        ) : (
          <Quiz key={version} questions={data.quiz} />
        )}
      </div>

      <RefineBar request={refineRequest} onSubmit={onRefine} onUndo={onUndo} />
    </div>
  );
}
