import { useEffect, useState } from 'react';
import { vaultGet, vaultPut } from './browser-vault';
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
  const [setup, setSetup] = useState<{
    registered: boolean;
    method: string | null;
    localSetupAvailable: boolean;
  } | null>(null);
  useEffect(() => {
    void fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('SETUP_UNAVAILABLE');
        const status = await response.json();
        setSetup(status);
        setCreating(!status.registered && status.localSetupAvailable);
      })
      .catch(() => setError('Host setup status could not load. Reload this page to try again.'));
    void vaultGet<string>('host-login-code')
      .then((saved) => setCode(saved ?? ''))
      .catch(() => {});
  }, []);
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
          creating
            ? { pin, ...(setup?.localSetupAvailable ? {} : { bootstrapCode: bootstrap }) }
            : { pin, loginCode: code.trim() },
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
      <h2>{creating ? 'Create host account' : 'Host PIN sign-in · testnet'}</h2>
      <p>
        {creating && setup?.localSetupAvailable
          ? 'Choose a PIN for this installation. No terminal or setup code is needed on localhost.'
          : setup?.method === 'passkey'
            ? 'This host uses a passkey. Use the passkey sign-in below.'
            : 'Use your host PIN and saved login code. A participant PIN cannot access this desk.'}
      </p>
      <form
        className="live-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && setup && !newCode) void submit();
        }}
      >
        {!newCode && (
          <>
            {creating && !setup?.localSetupAvailable ? (
              <label>
                Private host setup code
                <input
                  type="password"
                  value={bootstrap}
                  onChange={(e) => setBootstrap(e.target.value)}
                  autoComplete="off"
                />
              </label>
            ) : !creating ? (
              <label>
                Saved host login code
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="username"
                  spellCheck={false}
                />
              </label>
            ) : null}
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
            <button
              type="submit"
              className="primary"
              disabled={busy || !setup || setup.method === 'passkey'}
            >
              {creating ? 'Create host account' : 'Sign in as host with PIN'}
            </button>
            {!setup?.registered && !setup?.localSetupAvailable && (
              <button
                type="button"
                className="text-button"
                disabled={busy || !setup || setup.registered}
                onClick={() => {
                  setCreating(!creating);
                  setError('');
                  setPin('');
                  setConfirmation('');
                }}
              >
                {creating ? 'Use existing host PIN' : 'First-time host PIN setup'}
              </button>
            )}
          </>
        )}
        {newCode && (
          <div>
            <label>
              Save your host login code
              <input readOnly value={newCode} />
            </label>
            <span>
              Keep this code privately, separately from the PIN. It is not a wallet recovery seed.
            </span>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify({ kind: 'hauntbox-host-login', loginCode: newCode })], {
                    type: 'application/json',
                  }),
                );
                const link = document.createElement('a');
                link.href = url;
                link.download = 'hauntbox-host-login.json';
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download host login backup
            </button>
            <button
              type="button"
              className="primary"
              onClick={() =>
                void vaultPut('host-login-code', newCode)
                  .catch(() => {})
                  .then(() => onSignedIn(pendingCsrf))
              }
            >
              I saved my host sign-in code — continue
            </button>
          </div>
        )}
        {busy && <p role="status">Checking host sign-in…</p>}
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  );
}
