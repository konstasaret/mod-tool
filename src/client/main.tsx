import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  IdKitResponse,
  PortalState,
  StartVerificationResponse,
} from '../shared/contracts.js';
import './styles.css';

const WORLD_BRIDGE_ORIGIN = 'https://mustafakuloglu.github.io';
const WORLD_BRIDGE_URL = `${WORLD_BRIDGE_ORIGIN}/reddit-orb-human-badge-bridge/`;

type BridgeProofMessage = {
  type?: string;
  nonce?: string;
  requestId?: string;
  idkitResponse?: IdKitResponse;
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

function waitForBridgeProof(input: {
  bridgeWindow: Window;
  nonce: string;
  requestId: string;
}): Promise<IdKitResponse> {
  return new Promise((resolve, reject) => {
    let timeoutId = 0;
    let closedIntervalId = 0;

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      window.clearTimeout(timeoutId);
      window.clearInterval(closedIntervalId);
    };
    const fail = (message: string) => {
      cleanup();
      reject(new Error(message));
    };
    const handleMessage = (event: MessageEvent<BridgeProofMessage>) => {
      if (event.origin !== WORLD_BRIDGE_ORIGIN || event.source !== input.bridgeWindow) return;
      const message = event.data;
      if (
        message?.type !== 'orb-human-badge-proof' ||
        message.nonce !== input.nonce ||
        message.requestId !== input.requestId ||
        !message.idkitResponse
      ) {
        return;
      }
      cleanup();
      resolve(message.idkitResponse);
    };

    window.addEventListener('message', handleMessage);
    timeoutId = window.setTimeout(
      () => fail('World verification timed out. Try again.'),
      10 * 60 * 1000
    );
    closedIntervalId = window.setInterval(() => {
      if (input.bridgeWindow.closed) fail('World verification window was closed.');
    }, 500);
  });
}

function App() {
  const [state, setState] = useState<PortalState>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

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
    const worldWindow = window.open('', '_blank');
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch('/api/human-badge/start', { method: 'POST' });
      const result = (await response.json()) as StartVerificationResponse;
      if (!result.ok) throw new Error(result.error);
      if (!('session' in result)) throw new Error('World verification session was not returned.');
      const { session } = result;
      if (!worldWindow) throw new Error('Allow pop-ups, then try again.');
      const nonce = crypto.randomUUID();
      const proofPromise = waitForBridgeProof({
        bridgeWindow: worldWindow,
        nonce,
        requestId: session.requestId,
      });
      const payload = encodeURIComponent(
        JSON.stringify({ nonce, openerOrigin: window.location.origin, session })
      );
      worldWindow.location.href = `${WORLD_BRIDGE_URL}#payload=${payload}`;
      const idkitResponse = await proofPromise;
      const completionResponse = await fetch('/api/human-badge/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: session.requestId,
          idkitResponse,
        }),
      });
      if (!completionResponse.ok) throw new Error('Reddit did not accept the World proof.');
      worldWindow.close();
      await refresh();
    } catch (caught) {
      console.error('Orb verification failed', caught);
      worldWindow?.close();
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

        {state?.humanBadgeStatus !== 'verified' && (
          <button className="primary orb" disabled={!canVerify} onClick={() => void start()}>
            {loading
              ? 'Starting…'
              : state?.humanBadgeStatus === 'pending'
                ? 'Continue Orb verification'
                : 'Verify with World'}
          </button>
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
