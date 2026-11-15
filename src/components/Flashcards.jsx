import { useMemo, useState } from 'react';
import { shuffle } from '../lib/shuffle.js';
import { useHotkeys } from '../hooks/useHotkeys.js';

/**
 * A "round" is a fixed list of card ids to go through. Marking cards doesn't
 * change the current round; at the end you can start a round of only the cards
 * still being learned.
 */
export default function Flashcards({ cards }) {
  const byId = useMemo(() => Object.fromEntries(cards.map((c) => [c.id, c])), [cards]);
  const [round, setRound] = useState(() => ({ ids: cards.map((c) => c.id), label: 'All cards' }));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [marks, setMarks] = useState({}); // id -> 'known' | 'learning'

  const finished = index >= round.ids.length;
  const card = finished ? null : byId[round.ids[index]];
  const knownCount = cards.filter((c) => marks[c.id] === 'known').length;
  const learningIds = cards.filter((c) => marks[c.id] !== 'known').map((c) => c.id);

  const go = (next) => {
    setFlipped(false);
    setIndex(Math.max(0, Math.min(round.ids.length, next)));
  };
  const mark = (value) => {
    if (!card) return;
    setMarks((m) => ({ ...m, [card.id]: value }));
    go(index + 1);
  };
  const startRound = (ids, label) => {
    setRound({ ids, label });
    setIndex(0);
    setFlipped(false);
  };

  useHotkeys(
    finished
      ? {}
      : {
          ' ': () => setFlipped((f) => !f),
          Enter: () => setFlipped((f) => !f),
          ArrowRight: () => go(index + 1),
          ArrowLeft: () => go(index - 1),
          1: () => mark('learning'),
          2: () => mark('known'),
        },
  );

  if (finished) {
    return (
      <div className="panel round-summary">
        <h2>Round complete</h2>
        <p className="big-stat">
          {knownCount} <span>of {cards.length} known</span>
        </p>
        <div className="progress" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${(knownCount / cards.length) * 100}%` }} />
        </div>
        <div className="actions">
          {learningIds.length > 0 && learningIds.length < cards.length && (
            <button type="button" className="btn btn-primary" onClick={() => startRound(learningIds, 'Still learning')}>
              Review {learningIds.length} still learning
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => startRound(cards.map((c) => c.id), 'All cards')}>
            Restart all
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => startRound(shuffle(cards.map((c) => c.id)), 'Shuffled')}>
            Shuffle all
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flashcards">
      <div className="deck-bar">
        <span className="deck-label">{round.label}</span>
        <span className="deck-pos">
          {index + 1} / {round.ids.length}
        </span>
        <button
          type="button"
          className="link-btn"
          onClick={() => startRound(shuffle(round.ids), `${round.label.replace(/ \(shuffled\)$/, '')} (shuffled)`)}
        >
          Shuffle
        </button>
      </div>
      <div className="progress" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${(index / round.ids.length) * 100}%` }} />
      </div>

      <button
        type="button"
        className={`flashcard ${flipped ? 'is-flipped' : ''}`}
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? `Answer: ${card.back}. Click to show question.` : `Question: ${card.front}. Click to reveal answer.`}
      >
        <span className="flashcard-inner">
          <span className="face face-front" aria-hidden={flipped}>
            <span className="face-label">Question</span>
            <span className="face-text">{card.front}</span>
            <span className="face-hint">Tap to reveal</span>
          </span>
          <span className="face face-back" aria-hidden={!flipped}>
            <span className="face-label">Answer</span>
            <span className="face-text">{card.back}</span>
          </span>
        </span>
        {marks[card.id] && <span className={`mark-badge ${marks[card.id]}`}>{marks[card.id] === 'known' ? 'Known' : 'Learning'}</span>}
      </button>

      <div className="card-controls">
        <button type="button" className="btn btn-ghost nav" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous card">
          ←
        </button>
        <button type="button" className="btn btn-learning" onClick={() => mark('learning')}>
          Still learning
        </button>
        <button type="button" className="btn btn-known" onClick={() => mark('known')}>
          Got it
        </button>
        <button type="button" className="btn btn-ghost nav" onClick={() => go(index + 1)} aria-label="Next card">
          →
        </button>
      </div>
      <p className="help center keys">
        <kbd>Space</kbd> flip · <kbd>←</kbd>
        <kbd>→</kbd> move · <kbd>1</kbd> still learning · <kbd>2</kbd> got it
      </p>
    </div>
  );
}
