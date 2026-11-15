import { useEffect, useRef, useState } from 'react';
import { shuffle } from '../lib/shuffle.js';
import { useHotkeys } from '../hooks/useHotkeys.js';

const LETTERS = 'ABCDEF';

/** Shuffle options per round, tracking which one is correct by flag (not index). */
function buildRound(questions) {
  return questions.map((q) => ({
    ...q,
    choices: shuffle(q.options.map((text, i) => ({ text, correct: i === q.answerIndex }))),
  }));
}

export default function Quiz({ questions }) {
  const [round, setRound] = useState(() => ({ items: buildRound(questions), label: 'Full quiz' }));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null); // index into current choices
  const [answers, setAnswers] = useState([]); // { id, question, chosen, correctText, correct }
  const nextRef = useRef(null);

  const finished = index >= round.items.length;
  const item = finished ? null : round.items[index];
  const answered = selected !== null;

  useEffect(() => {
    if (answered) nextRef.current?.focus();
  }, [answered]);

  const choose = (i) => {
    if (answered || !item || i >= item.choices.length) return;
    setSelected(i);
    const choice = item.choices[i];
    setAnswers((a) => [
      ...a,
      {
        id: item.id,
        question: item.question,
        chosen: choice.text,
        correctText: item.choices.find((c) => c.correct).text,
        correct: choice.correct,
      },
    ]);
  };

  const next = () => {
    if (!answered) return;
    setSelected(null);
    setIndex((i) => i + 1);
  };

  const startRound = (qs, label) => {
    setRound({ items: buildRound(qs), label });
    setIndex(0);
    setSelected(null);
    setAnswers([]);
  };

  const keys = {};
  if (!finished) {
    item.choices.forEach((_, i) => {
      keys[String(i + 1)] = () => choose(i);
      keys[LETTERS[i].toLowerCase()] = () => choose(i);
    });
    if (answered) {
      keys.Enter = next;
      keys.ArrowRight = next;
    }
  }
  useHotkeys(keys);

  if (finished) {
    const correct = answers.filter((a) => a.correct).length;
    const missed = answers.filter((a) => !a.correct);
    const pct = Math.round((correct / answers.length) * 100);
    const missedIds = new Set(missed.map((m) => m.id));

    return (
      <div className="panel quiz-results">
        <h2>{pct === 100 ? 'Perfect score!' : pct >= 70 ? 'Nice work' : 'Keep practising'}</h2>
        <div className="score-ring" style={{ '--pct': pct }} role="img" aria-label={`${correct} of ${answers.length} correct`}>
          <span>{pct}%</span>
        </div>
        <p className="study-meta center">
          {correct} of {answers.length} correct · {round.label}
        </p>

        {missed.length > 0 && (
          <div className="missed">
            <h3>Review what you missed</h3>
            <ul>
              {missed.map((m) => (
                <li key={m.id}>
                  <p className="missed-q">{m.question}</p>
                  <p className="missed-a wrong">Your answer: {m.chosen}</p>
                  <p className="missed-a right">Correct: {m.correctText}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="actions">
          {missed.length > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => startRound(questions.filter((q) => missedIds.has(q.id)), 'Retest: missed questions')}
            >
              Retest {missed.length} missed
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => startRound(questions, 'Full quiz')}>
            Retake full quiz
          </button>
        </div>
      </div>
    );
  }

  const isCorrect = answered && item.choices[selected].correct;

  return (
    <div className="quiz">
      <div className="deck-bar">
        <span className="deck-label">{round.label}</span>
        <span className="deck-pos">
          Question {index + 1} / {round.items.length}
        </span>
        <span className="deck-score">{answers.filter((a) => a.correct).length} correct</span>
      </div>
      <div className="progress" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${(index / round.items.length) * 100}%` }} />
      </div>

      <div className="panel question-card">
        <h2 className="question" id={`q-${item.id}`}>
          {item.question}
        </h2>
        <ul className="choices" role="list" aria-labelledby={`q-${item.id}`}>
          {item.choices.map((c, i) => {
            let state = '';
            if (answered) {
              if (c.correct) state = 'is-correct';
              else if (i === selected) state = 'is-wrong';
              else state = 'is-dim';
            }
            return (
              <li key={c.text}>
                <button
                  type="button"
                  className={`choice ${state}`}
                  onClick={() => choose(i)}
                  disabled={answered}
                  aria-pressed={i === selected}
                >
                  <span className="choice-letter">{LETTERS[i]}</span>
                  <span className="choice-text">{c.text}</span>
                  {answered && c.correct && <span className="choice-icon" aria-label="correct answer">✓</span>}
                  {answered && i === selected && !c.correct && <span className="choice-icon" aria-label="your answer, incorrect">✕</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {answered && (
          <div className={`feedback ${isCorrect ? 'good' : 'bad'}`} role="status">
            <strong>{isCorrect ? 'Correct.' : 'Not quite.'}</strong> {item.explanation}
          </div>
        )}
      </div>

      <div className="card-controls">
        <button type="button" ref={nextRef} className="btn btn-primary" onClick={next} disabled={!answered}>
          {index + 1 === round.items.length ? 'See results' : 'Next question'}
        </button>
      </div>
      <p className="help center keys">
        <kbd>1</kbd>–<kbd>{item.choices.length}</kbd> or <kbd>A</kbd>–<kbd>{LETTERS[item.choices.length - 1]}</kbd> answer ·{' '}
        <kbd>Enter</kbd> next
      </p>
    </div>
  );
}
