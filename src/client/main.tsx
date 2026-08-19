import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  IdKitResponse,
  PortalState,
  StartVerificationResponse,
} from '../shared/contracts.js';
import './styles.css';

type PendingBridge = {
  url: string;
  sessionId: string;
  requestId: string;
  expiresAt: number;
};

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof Error && caught.message) return caught.message;
  if (typeof caught === 'string' && caught) return caught;
  if (caught && typeof caught === 'object') {
    for (const key of ['message', 'error', 'error_code', 'code'] as const) {
      const value = (caught as Record<string, unknown>)[key];
      if (typeof value === 'string' && value) return value;
    }
  }
  return fallback;
}

type BridgeResult = {
  status?: string;
  requestId?: string;
  idkitResponse?: IdKitResponse;
};

async function waitForBridgeProof(input: PendingBridge): Promise<IdKitResponse> {
  while (Date.now() < input.expiresAt) {
    const response = await fetch('/api/human-badge/poll', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        bridgeSessionId: input.sessionId,
        requestId: input.requestId,
      }),
    });
    if (response.ok) {
      const result = (await response.json()) as BridgeResult;
      if (result.requestId !== input.requestId || !result.idkitResponse) {
        throw new Error('The bridge returned an invalid World proof.');
      }
      return result.idkitResponse;
    }
    if (response.status !== 202) {
      throw new Error('The verification bridge session expired. Try again.');
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }
  throw new Error('World verification timed out. Try again.');
}

function App() {
  const [state, setState] = useState<PortalState>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [pendingBridge, setPendingBridge] = useState<PendingBridge>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch('/api/init');
      if (!response.ok) throw new Error('Badge status could not be loaded.');
      setState((await response.json()) as PortalState);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Badge status could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const start = async () => {
    setLoading(true);
    setError(undefined);
    setPendingBridge(undefined);
    try {
      const response = await fetch('/api/human-badge/start', { method: 'POST' });
      const result = (await response.json()) as StartVerificationResponse;
      if (!result.ok) throw new Error(result.error);
      if (
        !('bridgeSessionId' in result) ||
        !result.bridgeSessionId ||
        !result.requestId ||
        !result.launchUrl ||
        !result.expiresAt
      ) {
        throw new Error('The verification bridge returned an invalid session.');
      }
      const pending = {
        url: result.launchUrl,
        sessionId: result.bridgeSessionId,
        requestId: result.requestId,
        expiresAt: result.expiresAt,
      };
      setPendingBridge(pending);
      setLoading(false);
      const idkitResponse = await waitForBridgeProof(pending);
      setPendingBridge(undefined);
      setLoading(true);
      const completionResponse = await fetch('/api/human-badge/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: result.requestId,
          idkitResponse,
        }),
      });
      if (!completionResponse.ok) throw new Error('Reddit did not accept the World proof.');
      await refresh();
    } catch (caught) {
      console.error('Orb verification failed', caught);
      setPendingBridge(undefined);
      setError(errorMessage(caught, 'Orb verification could not start.'));
    } finally {
      setLoading(false);
    }
  };

  const unlink = async () => {
    if (!window.confirm('Remove your Orb-verified human badge from this community?')) return;
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch('/api/human-badge/unlink', { method: 'POST' });
      if (!response.ok) throw new Error('Human badge data could not be removed.');
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Human badge data could not be removed.');
      setLoading(false);
    }
  };

  const canVerify =
    state?.signedIn &&
    state?.enabled &&
    state.setupComplete &&
    state.humanBadgeStatus !== 'verified' &&
    !loading;

  return (
    <main className="page">
      <section className="card" aria-live="polite">
        <div className="mark" aria-hidden="true">🌐</div>
        <p className="eyebrow">ORB PROOF OF HUMAN</p>
        <h1>Get your human badge</h1>
        <p className="lede">
          Already verified at an Orb? Prove your existing World credential and receive a
          <strong> 🌐 human</strong> flair in this community.
        </p>

        <div className={`status status-${state?.humanBadgeStatus ?? 'loading'}`}>
          <strong>
            {loading && !state
              ? 'Loading…'
              : state?.humanBadgeStatus === 'verified'
                ? '✓ Orb-verified human'
                : state?.humanBadgeStatus === 'pending'
                  ? 'Orb verification started'
                  : state?.humanBadgeStatus === 'failed'
                    ? 'Orb verification did not complete'
                    : 'Human badge not linked'}
          </strong>
          <span>
            {state?.humanBadgeStatus === 'verified'
              ? 'Your human badge is active for this community.'
              : state && !state.signedIn
                ? 'Sign in to Reddit to link your badge.'
              : 'No new Orb visit is required.'}
          </span>
        </div>

        {!state?.setupComplete && state && (
          <p className="notice">The app owner must finish the private World settings first.</p>
        )}
        {error && <p className="error">{error}</p>}

        {state?.humanBadgeStatus !== 'verified' && !pendingBridge && (
          <button className="primary orb" disabled={!canVerify} onClick={() => void start()}>
            {loading
              ? 'Starting…'
              : state?.humanBadgeStatus === 'pending'
                ? 'Continue Orb verification'
                : 'Verify with World'}
          </button>
        )}
        {pendingBridge && (
          <>
            <p className="notice">
              Open the World page and keep this Reddit page open. Your badge will update
              automatically.
            </p>
            <a
              className="primary orb bridge-link"
              href={pendingBridge.url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              Open World QR page
            </a>
          </>
        )}
        <button className="secondary" disabled={loading} onClick={() => void refresh()}>
          Refresh status
        </button>
        {state?.humanBadgeStatus === 'verified' && (
          <button className="link-button" disabled={loading} onClick={() => void unlink()}>
            Remove my human badge
          </button>
        )}

        <div className="privacy">
          <strong>Privacy boundary</strong>
          <p>
            Your Reddit username is not sent to World. The app sends an opaque,
            community-scoped signal and stores badge state only for this app installation.
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
