import { useCallback, useEffect, useRef, useState } from 'react';
import { useStudyRequest } from './hooks/useStudyRequest.js';
import { useSessions } from './hooks/useSessions.js';
import { fetchHealth } from './lib/api.js';
import { SAMPLE_NOTES } from './lib/sample.js';
import InputPanel from './components/InputPanel.jsx';
import StudyView from './components/StudyView.jsx';
import { EmptyState, ErrorState, LoadingState } from './components/States.jsx';
import SessionsDrawer from './components/SessionsDrawer.jsx';

const DEFAULT_DRAFT = { text: '', cardCount: 8, quizCount: 5, difficulty: 'medium', chaos: '' };

export default function App() {
  const [draft, setDraft] = useState(DEFAULT_DRAFT);
  // session = { id, createdAt, sourceText, data, warnings, meta, version, previous }
  const [session, setSession] = useState(null);
  const [health, setHealth] = useState({ status: 'checking' });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inputCollapsed, setInputCollapsed] = useState(false);

  const request = useStudyRequest();
  const { sessions, upsert, remove } = useSessions();
  const resultsRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((h) => setHealth({ status: 'ok', ...h }))
      .catch((err) => {
        if (!controller.signal.aborted) setHealth({ status: 'down', error: err.message });
      });
    return () => controller.abort();
  }, []);

  // Auto-save whenever the study set itself changes (new or refined).
  useEffect(() => {
    if (session) upsert(session);
  }, [session?.id, session?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToResults = () => {
    if (window.matchMedia('(max-width: 900px)').matches) {
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  const generate = useCallback(() => {
    const sourceText = draft.text.trim();
    scrollToResults();
    request.run({
      kind: 'generate',
      path: '/api/study-set',
      body: {
        text: sourceText,
        cardCount: draft.cardCount,
        quizCount: draft.quizCount,
        difficulty: draft.difficulty,
        chaos: draft.chaos || undefined,
      },
      onSuccess: ({ data, warnings, meta }) => {
        setSession({
          id: crypto.randomUUID?.() ?? String(Date.now()),
          createdAt: Date.now(),
          sourceText,
          data,
          warnings,
          meta,
          version: 1,
          previous: null,
        });
        setInputCollapsed(true);
      },
    });
  }, [draft, request]);

  const refine = useCallback(
    (instruction) => {
      if (!session) return;
      const sessionId = session.id;
      request.run({
        kind: 'refine',
        path: '/api/study-set/refine',
        body: { current: session.data, instruction, chaos: draft.chaos || undefined },
        onSuccess: ({ data, warnings, meta }) =>
          setSession((s) =>
            // Only apply to the set the refinement was made for.
            s && s.id === sessionId
              ? { ...s, data, warnings, meta, version: s.version + 1, previous: s.data }
              : s,
          ),
      });
    },
    [session, request, draft.chaos],
  );

  const undoRefine = () =>
    setSession((s) => (s?.previous ? { ...s, data: s.previous, previous: null, warnings: [], version: s.version + 1 } : s));

  const loadSession = (saved) => {
    request.cancel();
    setSession({ ...saved, warnings: [], meta: null, version: 1, previous: null });
    setDraft((d) => ({ ...d, text: saved.sourceText }));
    setDrawerOpen(false);
    setInputCollapsed(true);
    scrollToResults();
  };

  const startNew = () => {
    request.cancel();
    setSession(null);
    setDraft((d) => ({ ...d, text: '' }));
    setInputCollapsed(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const fillSample = () => {
    setDraft((d) => ({ ...d, text: SAMPLE_NOTES }));
    setInputCollapsed(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const isGenerating = request.status === 'loading' && request.kind === 'generate';
  const generateError = request.status === 'error' && request.kind === 'generate' ? request.error : null;

  let results;
  if (isGenerating) {
    results = <LoadingState startedAt={request.startedAt} onCancel={request.cancel} />;
  } else if (generateError) {
    results = (
      <ErrorState
        error={generateError}
        onRetry={request.retry}
        onDismiss={request.dismiss}
        dismissLabel={session ? 'Back to current set' : 'Dismiss'}
      />
    );
  } else if (session) {
    results = (
      <StudyView
        key={session.id}
        session={session}
        onRefine={refine}
        refineRequest={request.kind === 'refine' ? request : null}
        onUndo={session.previous ? undoRefine : null}
      />
    );
  } else {
    results = <EmptyState onTrySample={fillSample} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>Study Assistant</span>
        </div>
        <div className="topbar-actions">
          {session && (
            <button type="button" className="btn btn-ghost" onClick={startNew}>
              New set
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => setDrawerOpen(true)}>
            Saved <span className="count">{sessions.length}</span>
          </button>
        </div>
      </header>

      <HealthBanner health={health} />

      <main className="layout">
        <InputPanel
          draft={draft}
          onChange={setDraft}
          onSubmit={generate}
          onTrySample={fillSample}
          busy={isGenerating}
          chaosModes={health.chaos}
          collapsed={inputCollapsed && !!session}
          onExpand={() => setInputCollapsed(false)}
          textareaRef={textareaRef}
        />
        <section className="results" ref={resultsRef} aria-live="polite" aria-busy={isGenerating}>
          {results}
        </section>
      </main>

      <SessionsDrawer
        open={drawerOpen}
        sessions={sessions}
        currentId={session?.id}
        onLoad={loadSession}
        onDelete={remove}
        onClose={closeDrawer}
      />
    </div>
  );
}

function HealthBanner({ health }) {
  if (health.status === 'down') {
    return (
      <div className="banner banner-error" role="alert">
        <span>
          Can't reach the API server. Start it with <code>npm start</code>, then reload.
        </span>
      </div>
    );
  }
  if (health.status === 'ok' && health.provider === 'mock') {
    return (
      <div className="banner banner-info">
        <span>
          <strong>Demo mode:</strong> no API key configured, so a simple local mock stands in for the AI. Add{' '}
          <code>LLM_API_KEY</code> to <code>.env</code> for real results.
        </span>
      </div>
    );
  }
  return null;
}
