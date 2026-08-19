import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IDKit, selfieCheckLegacy } from '@worldcoin/idkit-core';
import type { BridgePublicSession, IdKitResponse } from '../../shared/contracts.js';
import './styles.css';

const sessionId = window.location.pathname.split('/').filter(Boolean).at(-1) ?? '';

function App() {
  const [session, setSession] = useState<BridgePublicSession>();
  const [phase, setPhase] = useState<'loading' | 'ready' | 'waiting' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Getting your Selfie Check ready…');

  useEffect(() => {
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('This Selfie Check link has expired. Return to Reddit and try again.');
        return (await response.json()) as BridgePublicSession;
      })
      .then((loaded) => {
        setSession(loaded);
        setPhase('ready');
        setMessage('One quick Selfie Check unlocks your post and adds your Human badge.');
      })
      .catch((error: unknown) => {
        setPhase('error');
        setMessage(error instanceof Error ? error.message : 'Verification could not load.');
      });
  }, []);

  const verify = async () => {
    if (!session) return;
    setPhase('waiting');
    setMessage('Complete the check in World. This page will update automatically.');
    const worldWindow = window.open('', '_blank');
    if (worldWindow) worldWindow.opener = null;
    try {
      const requestConfig = {
        app_id: session.appId as `app_${string}`,
        action: session.action,
        rp_context: session.rpContext,
        allow_legacy_proofs: true,
        environment: session.environment,
      } as const;
      const request = await IDKit.request(requestConfig).preset(
        selfieCheckLegacy({ signal: session.signal })
      );

      if (request.connectorURI) {
        if (!worldWindow) throw new Error('Allow pop-ups, then try again.');
        worldWindow.location.href = request.connectorURI;
      }
      const completion = await request.pollUntilCompletion({ timeout: 9 * 60 * 1000 });
      if (!completion.success) throw new Error(`World verification ended: ${completion.error}`);

      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ idkitResponse: completion.result as unknown as IdKitResponse }),
      });
      if (!response.ok) throw new Error('Reddit could not finish your verification. Please try again.');
      setPhase('success');
      setMessage('Return to Reddit—your post and Human badge are being updated.');
      window.setTimeout(() => window.close(), 1200);
    } catch (error) {
      worldWindow?.close();
      setPhase('error');
      setMessage(error instanceof Error ? error.message : 'Verification did not complete.');
    }
  };

  return (
    <main>
      <section className="panel">
        <div className="wordmark" aria-label="World">WORLD</div>
        <p className="eyebrow">UNIQUE HUMAN</p>
        <h1>
          {phase === 'success'
            ? 'You’re verified'
            : 'Get your Human badge'}
        </h1>
        <p className={`message ${phase}`}>{message}</p>
        {phase === 'ready' && <button onClick={() => void verify()}>Verify with World</button>}
        {phase === 'waiting' && <div className="spinner" aria-label="Waiting" />}
        <div className="privacy">
          <strong>Private by design.</strong> World never receives your Reddit username.
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
);
