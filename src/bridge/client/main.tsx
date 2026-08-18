import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IDKit, orbLegacy, selfieCheckLegacy } from '@worldcoin/idkit-core';
import type { BridgePublicSession, IdKitResponse } from '../../shared/contracts.js';
import './styles.css';

const sessionId = window.location.pathname.split('/').filter(Boolean).at(-1) ?? '';

function App() {
  const [session, setSession] = useState<BridgePublicSession>();
  const [phase, setPhase] = useState<'loading' | 'ready' | 'waiting' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Loading secure verification request…');

  useEffect(() => {
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('This verification link is invalid or expired.');
        return (await response.json()) as BridgePublicSession;
      })
      .then((loaded) => {
        setSession(loaded);
        setPhase('ready');
        setMessage('Continue to World, then keep this page open while the proof returns.');
      })
      .catch((error: unknown) => {
        setPhase('error');
        setMessage(error instanceof Error ? error.message : 'Verification could not load.');
      });
  }, []);

  const verify = async () => {
    if (!session) return;
    const isHumanBadge = session.verificationLevel === 'orb';
    setPhase('waiting');
    setMessage(isHumanBadge ? 'Waiting for World Orb verification…' : 'Waiting for World Selfie Check…');
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
      const request = isHumanBadge
        ? await IDKit.request(requestConfig).preset(orbLegacy({ signal: session.signal }))
        : await IDKit.requestWithInviteCode(requestConfig).preset(
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
      if (!response.ok) throw new Error('The proof returned, but Reddit did not accept it.');
      setPhase('success');
      setMessage(
        isHumanBadge
          ? 'Human badge verified. Return to Reddit and refresh your status.'
          : 'Human Check complete. Return to Reddit and refresh your status.'
      );
    } catch (error) {
      worldWindow?.close();
      setPhase('error');
      setMessage(error instanceof Error ? error.message : 'Verification did not complete.');
    }
  };

  return (
    <main>
      <section className="panel">
        <div className="globe">🌐</div>
        <p className="eyebrow">WORLD HUMAN CHECK</p>
        <h1>
          {phase === 'success'
            ? session?.verificationLevel === 'orb'
              ? 'Human badge verified'
              : 'You’re Human Checked'
            : session?.verificationLevel === 'orb'
              ? 'Verify with your Orb credential'
              : 'Complete Selfie Check'}
        </h1>
        <p className={`message ${phase}`}>{message}</p>
        {phase === 'ready' && <button onClick={() => void verify()}>Continue with World</button>}
        {phase === 'waiting' && <div className="spinner" aria-label="Waiting" />}
        <div className="privacy">
          <strong>No Reddit username is shared.</strong> This request contains only an opaque,
          community-scoped signal and a one-time proof return path.
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
);
