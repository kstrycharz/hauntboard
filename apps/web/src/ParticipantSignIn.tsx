import { useEffect, useState } from 'react';
import { passkeyCeremony } from './passkeys';
import { vaultGet, vaultPut } from './browser-vault';
interface Session {
  participantId: string;
  csrf: string;
  authenticated: boolean;
  loginCode?: string;
}
async function request<T>(path: string, body?: unknown, csrf?: string): Promise<T> {
  const response = await fetch(`/api/participant/auth/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers:
      body === undefined
        ? {}
        : { 'Content-Type': 'application/json', ...(csrf ? { 'x-hauntbox-csrf': csrf } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.code);
  return result;
}
export function ParticipantSignIn({
  network,
  onUseAddress,
}: {
  network: string;
  onUseAddress: (address: string) => void;
}) {
  const [session, setSession] = useState<Session | null>(null),
    [method, setMethod] = useState<'pin' | 'passkey'>('pin'),
    [creating, setCreating] = useState(false),
    [pin, setPin] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [loginCode, setLoginCode] = useState(''),
    [newCode, setNewCode] = useState(''),
    [address, setAddress] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    void request<Session>('session')
      .then(setSession)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (session)
      void vaultGet<string>(`participant-address:${session.participantId}:${network}`).then(
        (value) => setAddress(value ?? ''),
      );
  }, [session?.participantId, network]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      setError(
        code === 'PARTICIPANT_SIGN_IN_FAILED'
          ? 'The sign-in code or PIN is incorrect, or this account is temporarily locked.'
          : code === 'TRY_AGAIN_LATER'
            ? 'Too many attempts. Wait before trying again.'
            : ['NotAllowedError', 'PASSKEY_BROWSER_UNAVAILABLE'].includes(code) ||
                (e instanceof DOMException && e.name === 'NotAllowedError')
              ? 'The passkey could not complete. Choose PIN instead, or use your regular browser.'
              : 'Sign-in could not complete. Check your entries and try again.',
      );
    } finally {
      setPin('');
      setConfirmation('');
      setBusy(false);
    }
  }
  async function authenticate() {
    if (method === 'pin') {
      if (!/^[0-9]{8,12}$/.test(pin) || (creating && pin !== confirmation)) {
        setError('Use 8–12 digits; both PIN entries must match.');
        return;
      }
      if (!creating && !/^[A-Za-z0-9_-]{43}$/.test(loginCode.trim())) {
        setError(
          'Enter the account sign-in code saved at creation. To make a new account, choose Create an account.',
        );
        return;
      }
      const result = await request<Session>(
        `pin/${creating ? 'register' : 'login'}`,
        creating ? { pin } : { loginCode: loginCode.trim(), pin },
      );
      setSession(result);
      setNewCode(result.loginCode ?? '');
      setLoginCode('');
    } else {
      const kind = creating ? 'register' : 'login';
      const start = await request<{ ceremonyId: string; options: Record<string, unknown> }>(
        `${kind}/options`,
        {},
      );
      const response = await passkeyCeremony(kind, start.options);
      setSession(
        await request<Session>(`${kind}/verify`, { ceremonyId: start.ceremonyId, response }),
      );
    }
    setNotice(
      'Signed in as a participant. You can submit a story and choose an optional reward destination.',
    );
  }
  return (
    <section className="live-card">
      <h2>{session ? 'Your participant account' : 'Sign in to Hauntbox'}</h2>
      <p>
        A participant is someone submitting a story. Signing in does not give access to the host’s
        inbox or funding wallets.
      </p>
      {!session ? (
        <>
          <div className="hero-actions">
            <button
              className={method === 'pin' ? 'primary' : 'secondary'}
              onClick={() => setMethod('pin')}
            >
              Use PIN
            </button>
            <button
              className={method === 'passkey' ? 'primary' : 'secondary'}
              onClick={() => setMethod('passkey')}
            >
              Use passkey
            </button>
          </div>
          <p>
            {creating
              ? 'Create your testnet participant account.'
              : 'Use the sign-in method you chose when creating your account.'}
          </p>
          {method === 'pin' ? (
            <div className="live-form">
              <p>
                Testnet PIN sign-in works without a passkey. Keep your separate account sign-in
                code; it identifies your account on another browser.
              </p>
              {!creating && (
                <label>
                  Account sign-in code
                  <input
                    value={loginCode}
                    onChange={(e) => setLoginCode(e.target.value)}
                    autoComplete="username"
                    spellCheck={false}
                  />
                </label>
              )}
              <label>
                PIN, 8–12 digits
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
                  Confirm PIN
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
            </div>
          ) : (
            <p>
              Your device or security key verifies your passkey. If this browser cannot use
              passkeys, choose PIN when creating an account.
            </p>
          )}
          <div className="hero-actions">
            <button className="primary" disabled={busy} onClick={() => void run(authenticate)}>
              {creating ? 'Create participant account' : 'Sign in'}
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setCreating(!creating);
                setPin('');
                setConfirmation('');
                setError('');
              }}
            >
              {creating ? 'I already have an account' : 'Create an account'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            Signed in as a participant on <strong>{network}</strong>. This app account is separate
            from a wallet that can spend tokens.
          </p>
          {newCode && (
            <div className="live-form">
              <label>
                Save your account sign-in code
                <input readOnly value={newCode} spellCheck={false} />
              </label>
              <p>
                Store this code privately, separately from your PIN. It is shown only after account
                creation. Losing both your sign-in method and recovery details can prevent access.
              </p>
              <button
                className="secondary"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob(
                      [
                        JSON.stringify({
                          version: 1,
                          kind: 'hauntbox-testnet-sign-in',
                          network,
                          loginCode: newCode,
                        }),
                      ],
                      { type: 'application/json' },
                    ),
                  );
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = 'hauntbox-account.recovery.json';
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download sign-in code
              </button>
            </div>
          )}
          <div className="live-form">
            <label>
              Your optional {network} payout address
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <p>
              You control this destination wallet. The address is saved only in this browser and
              travels inside the encrypted story when you submit. An account PIN or passkey is not a
              wallet seed or spending key.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (
                    address &&
                    !address.startsWith(network === 'localnet' ? 'otl_loc_1' : 'otl_esm_1')
                  )
                    throw new Error('WRONG_NETWORK');
                  await vaultPut(
                    `participant-address:${session.participantId}:${network}`,
                    address,
                  );
                  onUseAddress(address);
                })
              }
            >
              Use this address in my submission
            </button>
          </div>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await request('logout', {}, session.csrf);
                setSession(null);
                setCreating(false);
                setNewCode('');
                setAddress('');
                setNotice('Signed out.');
              })
            }
          >
            Sign out of participant account
          </button>
        </>
      )}
      {busy && <p role="status">Working…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
