import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorText } from './api';
import type { Detail, Workspace } from './types';

const loadTimeout = 45000;

// Remote state has one owner. Refreshes cannot supersede a newer accepted mutation.
export default function useWorkspace(onLoaded: () => void) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(
    () => new URLSearchParams(window.location.search).get('entry') || 'tidewell',
  );
  const [reloadVersion, setReloadVersion] = useState(0);
  const selectedRef = useRef(selected);
  const loaded = useRef(onLoaded);
  loaded.current = onLoaded;
  const workspaceRead = useRef(0);
  const detailRead = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const select = useCallback((id: string) => {
    selectedRef.current = id;
    setSelected(id);
  }, []);
  const reload = useCallback(() => setReloadVersion((version) => version + 1), []);
  const refresh = useCallback(async () => {
    const read = ++workspaceRead.current;
    const value = await api<Workspace>('/api/workspace');
    if (mounted.current && read === workspaceRead.current) setWorkspace(value);
  }, []);
  const accept = useCallback((next: Detail) => {
    if (!mounted.current || next.entry.id !== selectedRef.current) return;
    ++workspaceRead.current;
    ++detailRead.current;
    setDetail(next);
    setWorkspace((current) =>
      current
        ? {
            ...current,
            entries: current.entries.map((entry) =>
              entry.id === next.entry.id ? next.entry : entry,
            ),
          }
        : current,
    );
  }, []);

  useEffect(() => {
    void reloadVersion;
    const queueVersion = ++workspaceRead.current;
    const entryVersion = ++detailRead.current;
    let active = true;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(loadTimeout)]);
    setError('');
    setDetail(null);
    void Promise.all([
      api<Workspace>('/api/workspace', { signal }),
      api<Detail>(`/api/entries/${selected}`, { signal }),
    ])
      .then(([queue, entry]) => {
        if (!active) return;
        if (queueVersion === workspaceRead.current) setWorkspace(queue);
        if (entryVersion === detailRead.current && entry.entry.id === selectedRef.current) {
          setDetail(entry);
          loaded.current();
        }
      })
      .catch((cause) => {
        if (!active || entryVersion !== detailRead.current) return;
        setError(
          cause instanceof Error && cause.name === 'TimeoutError'
            ? `The server did not respond within ${loadTimeout / 1000} seconds. Try connecting again.`
            : errorText(cause),
        );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [selected, reloadVersion]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('entry', selected);
    window.history.replaceState(null, '', url);
  }, [selected]);

  return {
    workspace,
    detail: detail?.entry.id === selected ? detail : null,
    error,
    selected,
    select,
    reload,
    reloadVersion,
    refresh,
    accept,
  };
}
