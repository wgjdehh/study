import { useEffect, useState } from 'react';

/** Seconds since `startedAt` (ms timestamp), updated twice a second. 0 when null. */
export function useElapsed(startedAt) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!startedAt) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
}
