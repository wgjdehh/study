import { useCallback, useEffect, useRef, useState } from 'react';
import { postStudySet } from '../lib/api.js';

const IDLE = { status: 'idle', kind: null, error: null, startedAt: null };

/**
 * One "request channel" for everything that talks to the model.
 *
 * Guarantees:
 *  - Only the LATEST request can update state. Starting a new request aborts the
 *    previous one, and every response is checked against a request id before it's
 *    applied (abort alone isn't enough: a response can already be resolving when
 *    we abort it).
 *  - Cancel and unmount abort the in-flight fetch, which also stops the server's
 *    model call (it listens for the client disconnecting).
 *  - retry() re-runs exactly the last request.
 *
 * @returns {{
 *   status: 'idle'|'loading'|'error', kind: string|null, error: Error|null, startedAt: number|null,
 *   run: (call: {kind: string, path: string, body: object, onSuccess: Function}) => Promise<void>,
 *   retry: () => void, cancel: () => void, dismiss: () => void
 * }}
 */
export function useStudyRequest() {
  const [state, setState] = useState(IDLE);
  const latest = useRef({ id: 0, controller: null });
  const lastCall = useRef(null);

  const run = useCallback(async (call) => {
    latest.current.controller?.abort();
    const id = ++latest.current.id;
    const controller = new AbortController();
    latest.current.controller = controller;
    lastCall.current = call;

    setState({ status: 'loading', kind: call.kind, error: null, startedAt: Date.now() });

    try {
      const result = await postStudySet(call.path, call.body, { signal: controller.signal });
      if (id !== latest.current.id) return; // stale: a newer request owns the UI now
      setState(IDLE);
      call.onSuccess(result);
    } catch (error) {
      if (id !== latest.current.id) return;
      if (error.code === 'CANCELLED') return setState(IDLE);
      setState({ status: 'error', kind: call.kind, error, startedAt: null });
    }
  }, []);

  const retry = useCallback(() => {
    if (lastCall.current) run(lastCall.current);
  }, [run]);

  const cancel = useCallback(() => {
    latest.current.id++; // invalidate whatever is in flight
    latest.current.controller?.abort();
    setState(IDLE);
  }, []);

  const dismiss = useCallback(() => setState(IDLE), []);

  useEffect(() => {
    const ref = latest.current;
    return () => ref.controller?.abort();
  }, []);

  return { ...state, run, retry, cancel, dismiss };
}
