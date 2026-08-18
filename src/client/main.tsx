import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { navigateTo } from '@devvit/web/client';
import type {
  PortalState,
  StartVerificationResponse,
} from '../shared/contracts.js';
import './styles.css';

function App() {
  const [state, setState] = useState<PortalState>();
  const [loading, setLoading] = useState(true);
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

  const start = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch('/api/verification/start', { method: 'POST' });
      const result = (await response.json()) as StartVerificationResponse;
      if (!result.ok) throw new Error(result.error);
      navigateTo(result.launchUrl);
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
    state?.enabled && state.setupComplete && state.status === 'pending' && !loading;

  return (
    <main className="page">
      <section className="card" aria-live="polite">
        <div className="mark" aria-hidden="true">🌐</div>
        <p className="eyebrow">COMMUNITY HUMAN CHECK</p>
        <h1>Verify you’re human</h1>
        <p className="lede">
          This community uses a privacy-preserving World Selfie Check to add friction for bots.
        </p>

        <div className={`status status-${state?.status ?? 'loading'}`}>
          <strong>
            {loading && !state
              ? 'Loading…'
              : state?.status === 'verified'
                ? '✓ Human Checked'
                : state?.status === 'pending'
                  ? 'Selfie Check requested'
                  : 'No active request'}
          </strong>
          <span>{state?.message}</span>
        </div>

        {!state?.setupComplete && state && (
          <p className="notice">A moderator must finish the app’s World setup before checks can start.</p>
        )}
        {error && <p className="error">{error}</p>}

        {state?.status === 'pending' && (
          <button className="primary" disabled={!canVerify} onClick={() => void start()}>
            {loading ? 'Starting…' : 'Verify with World'}
          </button>
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
