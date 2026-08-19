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
        const pending = { ...result, pollDirectly: false };
        setPendingBridge(pending);
        navigateTo(pending.launchUrl);
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
      const pending = {
        bridgeSessionId: bridge.sessionId,
        requestId: result.session.requestId,
        launchUrl: launchUrl.toString(),
        expiresAt: bridge.expiresAt,
        pollDirectly: true,
      };
      setPendingBridge(pending);
      navigateTo(pending.launchUrl);
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
  const heading =
    state?.status === 'verified'
      ? 'You’re verified'
      : state?.status === 'pending'
        ? 'Unlock your post'
        : state?.status === 'failed'
          ? 'Verification expired'
        : 'Human badge';
  const description =
    !state
      ? 'Checking your status…'
      : state.status === 'verified'
        ? 'Your Human badge is active in this community.'
        : state.status === 'pending'
          ? 'Verify with World to publish your post and get your Human badge.'
          : state.status === 'failed'
            ? 'Ask a moderator for a new verification link.'
          : 'Post in this community to get started.';

  return (
    <main className="page">
      <section className="card" aria-live="polite">
        <div className="wordmark" aria-label="World">WORLD</div>
        <h1>{heading}</h1>
        <p className="lede">{description}</p>

        {!state?.setupComplete && state && (
          <p className="notice">Selfie Check isn’t available yet. Please let a moderator know.</p>
        )}
        {error && <p className="error">{error}</p>}

        {state?.status === 'pending' && !pendingBridge && (
          <button className="primary" disabled={!canVerify} onClick={() => void start()}>
            {loading ? 'Opening World…' : 'Verify & publish my post'}
          </button>
        )}
        {pendingBridge && (
          <div className="bridge-step">
            <strong>Finish in World</strong>
            <p>Keep this page open. We’ll update your post automatically.</p>
            <button className="bridge-link" type="button" onClick={openSelfieCheck}>
              Open again
            </button>
            <details className="manual-link">
              <summary>Link didn’t open?</summary>
              <label>
                Copy into a new tab
                <input
                  readOnly
                  value={pendingBridge.launchUrl}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
            </details>
          </div>
        )}
        {state?.status === 'verified' && (
          <button className="link-button" disabled={loading} onClick={() => void unlink()}>
            Remove verification
          </button>
        )}
        <p className="privacy-note">World never receives your Reddit username.</p>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
