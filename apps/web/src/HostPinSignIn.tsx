import { useState } from 'react';
export function HostPinSignIn({ onSignedIn }: { onSignedIn: (csrf: string) => void }) {
  const [creating, setCreating] = useState(false),
    [code, setCode] = useState(''),
    [bootstrap, setBootstrap] = useState(''),
    [pin, setPin] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [newCode, setNewCode] = useState(''),
    [pendingCsrf, setPendingCsrf] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit() {
    if (!/^[0-9]{8,12}$/.test(pin) || (creating && pin !== confirmation)) {
      setError('Use 8–12 digits; the confirmation must match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/auth/pin/${creating ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          creating ? { pin, bootstrapCode: bootstrap } : { pin, loginCode: code.trim() },
        ),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(
          result.code === 'CURATOR_ALREADY_REGISTERED'
            ? 'The host is already registered. Use the sign-in method originally configured.'
            : response.status === 429
              ? 'Too many attempts. Wait before trying again.'
              : 'The setup code, account sign-in code or PIN could not be verified.',
        );
        return;
      }
      if (result.loginCode) {
        setNewCode(result.loginCode);
        setPendingCsrf(result.csrf);
      }
      setBootstrap('');
      setCode('');
      if (!result.loginCode) onSignedIn(result.csrf);
    } catch {
      setError('Host sign-in is unavailable. Try again later.');
    } finally {
      setBusy(false);
      setPin('');
      setConfirmation('');
    }
  }
  return (
    <section className="live-card">
      <h2>Host PIN sign-in · testnet</h2>
      <p>
        Use this if the host was set up with a PIN. A participant PIN cannot access this desk. New
        host setup requires the installation’s private setup code.
      </p>
      <div className="live-form">
        {creating ? (
          <label>
            Private host setup code
            <input
              type="password"
              value={bootstrap}
              onChange={(e) => setBootstrap(e.target.value)}
              autoComplete="off"
            />
          </label>
        ) : (
          <label>
            Host account sign-in code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="username"
              spellCheck={false}
            />
          </label>
        )}
        <label>
          Host PIN, 8–12 digits
          <input
            type="password"
            inputMode="numeric"
            maxLength={12}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoComplete={creating ? 'new-password' : 'current-password'}
          />
        </label>
        {creating && (
          <label>
            Confirm host PIN
            <input
              type="password"
              inputMode="numeric"
              maxLength={12}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        )}
        <button className="primary" disabled={busy} onClick={() => void submit()}>
          {creating ? 'Create host with PIN' : 'Sign in as host with PIN'}
        </button>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setCreating(!creating);
            setError('');
            setPin('');
            setConfirmation('');
          }}
        >
          {creating ? 'Use existing host PIN' : 'First-time host PIN setup'}
        </button>
        {newCode && (
          <div>
            <label>
              Save this host account sign-in code
              <input readOnly value={newCode} />
            </label>
            <span>
              Keep this code privately, separately from the PIN. It is not a wallet recovery seed.
            </span>
            <button className="primary" onClick={() => onSignedIn(pendingCsrf)}>
              I saved my host sign-in code — continue
            </button>
          </div>
        )}
        {busy && <p role="status">Checking host sign-in…</p>}
        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  );
}
