import { useEffect, useRef } from 'react';

/**
 * Window-level keyboard shortcuts, e.g. { ArrowLeft: prev, ' ': flip }.
 * Ignored while typing in a field or when a button/link has focus (those
 * already handle Space/Enter natively, and we don't want double actions).
 */
export function useHotkeys(map, enabled = true) {
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target;
      const tag = t?.tagName;
      if (t?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if ((tag === 'BUTTON' || tag === 'A') && (e.key === ' ' || e.key === 'Enter')) return;
      if (t?.closest?.('[role="dialog"]')) return;
      const handler = mapRef.current[e.key];
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
