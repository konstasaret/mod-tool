import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { IdKitResponse, PortalState, StartVerificationResponse } from '../shared/contracts.js';
import './styles.css';

type PendingBridge = {
  launchUrl: string;
  expiresAt: number;
  bridgeSessionId: string;
  requestId: string;
};

type PollResponse =
  | { status: 'pending' }
  | { status: 'complete'; requestId: string; idkitResponse: IdKitResponse }
  | { status: 'error'; error: string };

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

function App() {
  const [state, setState] = useState<PortalState>();
  const [loading, setLoading] = useState(true);
  const [pendingBridge, setPendingBridge] = useState<PendingBridge>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch('/api/init');
      if (!response.ok) throw new Error('Status could not be loaded.');
      setState((await response.json()) as PortalState);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Status could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pendingBridge) return;
    let cancelled = false;

    const poll = async () => {
      try {
        while (!cancelled && Date.now() < pendingBridge.expiresAt) {
          const response = await fetch('/api/verification/poll', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              bridgeSessionId: pendingBridge.bridgeSessionId,
              requestId: pendingBridge.requestId,
            }),
          });
          const result = (await response.json()) as PollResponse;
          if (result.status === 'pending') {
            await delay(1_500);
            continue;
          }
          if (result.status === 'error') throw new Error(result.error);

          const completion = await fetch('/api/verification/complete', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              requestId: result.requestId,
              idkitResponse: result.idkitResponse,
            }),
          });
          const completionBody = (await completion.json()) as { ok?: boolean; error?: string };
          if (!completion.ok || !completionBody.ok) {
            throw new Error(completionBody.error || 'Reddit did not accept the World proof.');
          }
          if (!cancelled) {
            setPendingBridge(undefined);
            await refresh();
          }
          return;
        }
        if (!cancelled) throw new Error('Selfie Check expired. Start again.');
      } catch (caught) {
        if (!cancelled) {
          setPendingBridge(undefined);
          setError(caught instanceof Error ? caught.message : 'Verification did not complete.');
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [pendingBridge, refresh]);

  const start = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch('/api/verification/start', { method: 'POST' });
      const result = (await response.json()) as StartVerificationResponse;
      if (!result.ok) throw new Error(result.error);
      setPendingBridge(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Verification could not start.');
    } finally {
      setLoading(false);
    }
  };

  const unlink = async () => {
    if (!window.confirm('Remove your Human Check state and matching flair from this community?')) return;
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch('/api/unlink', { method: 'POST' });
      if (!response.ok) throw new Error('Human Check data could not be removed.');
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Human Check data could not be removed.');
      setLoading(false);
    }
  };

  const canVerify =
    state?.signedIn && state.enabled && state.setupComplete && state.status === 'pending' && !loading;

  return (
    <main className="page">
      <section className="card" aria-live="polite">
        <div className="mark" aria-hidden="true">🌐</div>
        <p className="eyebrow">COMMUNITY SELFIE CHECK</p>
        <h1>Prove you’re human to post</h1>
        <p className="lede">
          Your post is held until World Selfie Check confirms you are a unique human.
        </p>

        <div className={`status status-${state?.status ?? 'loading'}`}>
          <strong>
            {loading && !state
              ? 'Loading…'
              : state?.status === 'verified'
                ? '✓ Human Checked'
                : state?.status === 'pending'
                  ? 'Post held — Selfie Check required'
                  : 'No active request'}
          </strong>
          <span>{state?.message}</span>
        </div>

        {!state?.setupComplete && state && (
          <p className="notice">A moderator must finish the app’s World setup before checks can start.</p>
        )}
        {error && <p className="error">{error}</p>}

        {state?.status === 'pending' && !pendingBridge && (
          <button className="primary" disabled={!canVerify} onClick={() => void start()}>
            {loading ? 'Preparing…' : 'Prepare Selfie Check'}
          </button>
        )}
        {pendingBridge && (
          <div className="bridge-step">
            <p>Open Selfie Check in a new tab, then keep this Reddit page open. It will update automatically.</p>
            <a className="bridge-link" href={pendingBridge.launchUrl} target="_blank" rel="noreferrer">
              Open Selfie Check
            </a>
            <span className="waiting">Waiting for completion…</span>
          </div>
        )}
        <button className="secondary" disabled={loading} onClick={() => void refresh()}>
          Refresh status
        </button>
        {state?.status === 'verified' && (
          <button className="link-button" disabled={loading} onClick={() => void unlink()}>
            Remove my Human Check data
          </button>
        )}

        <div className="privacy">
          <strong>Privacy boundary</strong>
          <p>
            Your Reddit username is not sent to World. The app sends an opaque, community-scoped
            signal and stores verification state only for this app installation.
          </p>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
