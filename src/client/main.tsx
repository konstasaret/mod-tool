import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { navigateTo } from '@devvit/web/client';
import type { IdKitResponse, PortalState, StartVerificationResponse } from '../shared/contracts.js';
import './styles.css';

const WORLD_BRIDGE_ORIGIN = 'https://mod-tool.onrender.com';

type PendingBridge = {
  launchUrl: string;
  expiresAt: number;
  bridgeSessionId: string;
  requestId: string;
  pollDirectly: boolean;
};

type PollResponse = {
  status?: 'pending' | 'complete' | 'error';
  requestId?: string;
  idkitResponse?: IdKitResponse;
  error?: string;
};

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
          const response = pendingBridge.pollDirectly
            ? await fetch(
                `${WORLD_BRIDGE_ORIGIN}/api/polling-sessions/${encodeURIComponent(pendingBridge.bridgeSessionId)}/result`,
                { headers: { accept: 'application/json' } }
              )
            : await fetch('/api/verification/poll', {
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
          if (!response.ok || result.status === 'error') {
            throw new Error(result.error || 'Verification bridge session expired.');
          }
          if (result.status !== 'complete' || !result.requestId || !result.idkitResponse) {
            throw new Error('Verification bridge returned an invalid proof.');
          }

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
      if (result.transport === 'server') {
        setPendingBridge({ ...result, pollDirectly: false });
        return;
      }

      const bridgeResponse = await fetch(`${WORLD_BRIDGE_ORIGIN}/api/polling-sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(result.session),
      });
      if (!bridgeResponse.ok) throw new Error('Browser bridge session could not be created.');
      const bridge = (await bridgeResponse.json()) as {
        sessionId?: string;
        launchUrl?: string;
        expiresAt?: number;
      };
      if (!bridge.sessionId || !bridge.launchUrl || !bridge.expiresAt) {
        throw new Error('Browser bridge returned an invalid session.');
      }
      const launchUrl = new URL(bridge.launchUrl);
      if (launchUrl.origin !== WORLD_BRIDGE_ORIGIN) {
        throw new Error('Browser bridge returned an unexpected launch origin.');
      }
      setPendingBridge({
        bridgeSessionId: bridge.sessionId,
        requestId: result.session.requestId,
        launchUrl: launchUrl.toString(),
        expiresAt: bridge.expiresAt,
        pollDirectly: true,
      });
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

  const openSelfieCheck = () => {
    if (!pendingBridge) return;
    navigateTo(pendingBridge.launchUrl);
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
            {pendingBridge.pollDirectly && (
              <strong>Chrome extension fallback active</strong>
            )}
            <p>Open Selfie Check in a new tab, then keep this Reddit page open. It will update automatically.</p>
            <button className="bridge-link" type="button" onClick={openSelfieCheck}>
              Open Selfie Check
            </button>
            <label className="manual-link">
              If Reddit does not open it, copy this URL into a new tab:
              <input
                readOnly
                value={pendingBridge.launchUrl}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
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
