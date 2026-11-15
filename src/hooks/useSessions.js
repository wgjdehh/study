import { useCallback, useEffect, useState } from 'react';
import { normalizeStudySet } from '../lib/studySet.js';

const STORAGE_KEY = 'study-assistant:sessions:v1';
const MAX_SESSIONS = 20;

/**
 * Saved study sets in localStorage. Stored data is treated as untrusted: it may
 * be from an older version, hand-edited, or corrupted, so every entry is
 * re-validated on load and bad ones are dropped instead of crashing the app.
 */
export function useSessions() {
  const [sessions, setSessions] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      // Storage full or disabled (e.g. some private modes): the app still works, just without saving.
    }
  }, [sessions]);

  const upsert = useCallback((session) => {
    const entry = {
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: Date.now(),
      sourceText: session.sourceText,
      data: session.data,
    };
    setSessions((prev) => [entry, ...prev.filter((s) => s.id !== entry.id)].slice(0, MAX_SESSIONS));
  }, []);

  const remove = useCallback((id) => setSessions((prev) => prev.filter((s) => s.id !== id)), []);

  return { sessions, upsert, remove };
}

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((s) => {
      if (!s || typeof s.id !== 'string') return [];
      try {
        const { data } = normalizeStudySet(s.data);
        return [{ id: s.id, createdAt: Number(s.createdAt) || Date.now(), updatedAt: Number(s.updatedAt) || Date.now(), sourceText: String(s.sourceText ?? ''), data }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
