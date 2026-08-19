import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IDKit, selfieCheckLegacy } from '@worldcoin/idkit-core';
import QRCode from 'qrcode';
import type { BridgePublicSession, IdKitResponse } from '../../shared/contracts.js';
import { VERIFICATION_BADGE_DATA_URL } from '../../shared/verificationBadge.js';
import './styles.css';

const sessionId = window.location.pathname.split('/').filter(Boolean).at(-1) ?? '';

function App() {
  const [phase, setPhase] = useState<'loading' | 'waiting' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Creating your secure QR code…');
  const [qrCode, setQrCode] = useState<string>();

  useEffect(() => {
    const abortController = new AbortController();

    const run = async () => {
      try {
        const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
          signal: abortController.signal,
        });
        if (!response.ok) throw new Error('This verification link has expired. Return to Reddit and try again.');
        const session = (await response.json()) as BridgePublicSession;
        const request = await IDKit.request({
          app_id: session.appId as `app_${string}`,
          action: session.action,
          rp_context: session.rpContext,
          allow_legacy_proofs: false,
          environment: session.environment,
        }).preset(selfieCheckLegacy({ signal: session.signal }));
        if (!request.connectorURI) {
          throw new Error('World did not return a QR connector. Please try again.');
        }

        const dataUrl = await QRCode.toDataURL(request.connectorURI, {
          width: 256,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#000000', light: '#ffffff' },
        });
        if (abortController.signal.aborted) return;
        setQrCode(dataUrl);
        setPhase('waiting');
        setMessage('Scan with World App, then keep this page open.');

        const completion = await request.pollUntilCompletion({
          timeout: 9 * 60 * 1000,
          signal: abortController.signal,
        });
        if (abortController.signal.aborted) return;
        if (!completion.success) throw new Error(`World verification ended: ${completion.error}`);

        const completionResponse = await fetch(
          `/api/sessions/${encodeURIComponent(sessionId)}/complete`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ idkitResponse: completion.result as unknown as IdKitResponse }),
            signal: abortController.signal,
          }
        );
        if (!completionResponse.ok) {
          throw new Error('Reddit could not finish your verification. Please try again.');
        }
        setQrCode(undefined);
        setPhase('success');
        setMessage('Return to Reddit—your post is being published.');
        window.setTimeout(() => window.close(), 1200);
      } catch (error) {
        if (abortController.signal.aborted) return;
        setPhase('error');
        setMessage(error instanceof Error ? error.message : 'Verification could not load.');
      }
    };

    void run();
    return () => abortController.abort();
  }, []);

  return (
    <main>
      <section className="panel">
        <div className="brand"><img src={VERIFICATION_BADGE_DATA_URL} alt="" /><span>WORLD</span></div>
        <p className="eyebrow">SELFIE CHECK</p>
        <h1>
          {phase === 'success'
            ? 'You’re verified'
            : phase === 'waiting'
              ? 'Scan for Selfie Check'
              : 'Selfie Check to post'}
        </h1>
        <p className={`message ${phase}`}>{message}</p>
        {qrCode && (
          <div className="qr-frame">
            <img src={qrCode} alt="QR code to scan with World App" />
          </div>
        )}
        {phase === 'loading' && <div className="spinner" aria-label="Creating QR code" />}
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
