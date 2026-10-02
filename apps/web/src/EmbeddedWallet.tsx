import { useEffect, useRef, useState } from 'react';
import {
  generateWallet,
  recoverWallet,
  saveWallet,
  unlockWallet,
  walletInfo,
  walletTabId,
  type Recovery,
} from './participant-wallet';

export function EmbeddedWallet({
  network,
  onUseAddress,
}: {
  network: string;
  onUseAddress: (address: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<'create' | 'unlock' | 'recover'>('create');
  const [storedAddress, setStoredAddress] = useState(''),
    [unlockedAddress, setUnlockedAddress] = useState('');
  const [pin, setPin] = useState(''),
    [firstPin, setFirstPin] = useState('');
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [ownerPhrase, setOwnerPhrase] = useState(''),
    [viewPhrase, setViewPhrase] = useState('');
  const [ownerWord, setOwnerWord] = useState(''),
    [viewWord, setViewWord] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    setLoaded(false);
    const refresh = () => {
      void walletInfo(network)
        .then((info) => {
          if (!active) return;
          setStoredAddress(info?.address ?? '');
          setLoaded(true);
        })
        .catch(() => {
          if (!active) return;
          setLoaded(true);
          setError('Wallet storage is unavailable on this device or network.');
        });
    };
    const channel = new BroadcastChannel('hauntbox-wallet-updates');
    channel.onmessage = (event) => {
      if (event.data?.network !== network || event.data?.source === walletTabId) return;
      setUnlockedAddress('');
      refresh();
    };
    window.addEventListener('focus', refresh);
    refresh();
    return () => {
      active = false;
      channel.close();
      window.removeEventListener('focus', refresh);
    };
  }, [network]);
  function clear() {
    setPin('');
    setFirstPin('');
    setRecovery(null);
    setOwnerPhrase('');
    setViewPhrase('');
    setOwnerWord('');
    setViewWord('');
    setError('');
  }
  function open(next: typeof mode) {
    clear();
    setMode(next);
    dialog.current?.showModal();
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      const info = await walletInfo(network).catch(() => null);
      setStoredAddress(info?.address ?? '');
      setUnlockedAddress('');
      setError(
        code === 'WALLET_PIN_INCORRECT'
          ? 'Incorrect PIN. Try again, or recover with both phrases.'
          : code === 'WALLET_LOCKED'
            ? 'Wallet unlock is locked for 15 minutes. You can still recover with both phrases.'
            : code === 'WALLET_EXISTS'
              ? 'This browser already has a wallet. Unlock it or recover it instead.'
              : code === 'WALLET_CONFLICT'
                ? 'Another wallet is saved in this browser. Recover with its matching phrases; the saved wallet has been preserved.'
                : code === 'BROWSER_STORAGE_UNAVAILABLE'
                  ? 'Wallet storage is unavailable. Retry when browser storage is working; your PIN was not rejected.'
                  : code === 'WALLET_SDK_UNAVAILABLE'
                    ? 'Wallet software could not load. Check your connection and reload; your PIN was not rejected.'
                    : code === 'WALLET_DATA_INVALID'
                      ? 'Saved wallet data could not be read. Recover with both saved phrases.'
                      : code === 'WALLET_COORDINATION_UNAVAILABLE'
                        ? 'This browser cannot safely coordinate wallet updates. Use a browser with Web Locks support.'
                        : mode === 'recover'
                          ? 'Recovery could not complete. Check both 24-word Hauntbox phrases and their order.'
                          : 'Wallet setup could not complete. Browser storage and WebAssembly must be available.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function submitPin() {
    if (!/^[0-9]{8,12}$/.test(pin)) {
      setError('Enter an 8–12 digit PIN.');
      return;
    }
    if (mode === 'unlock') {
      await run(async () => {
        const address = await unlockWallet(pin, network);
        setUnlockedAddress(address);
        dialog.current?.close();
        clear();
      });
      setPin('');
      return;
    }
    if (!firstPin) {
      setFirstPin(pin);
      setPin('');
      return;
    }
    if (firstPin !== pin) {
      setPin('');
      setError('PINs do not match. Enter the same PIN again.');
      return;
    }
    await run(async () => {
      if (mode === 'create') {
        setRecovery(await generateWallet(network));
      } else {
        const restored = await recoverWallet(ownerPhrase, viewPhrase, network);
        await saveWallet(restored, pin, network, true);
        setStoredAddress(restored.address);
        setUnlockedAddress(restored.address);
        dialog.current?.close();
        clear();
      }
    });
    setPin('');
  }
  async function finish() {
    if (
      !recovery ||
      ownerWord.trim().toLowerCase() !== recovery.ownerPhrase.split(' ')[0] ||
      viewWord.trim().toLowerCase() !== recovery.viewPhrase.split(' ')[0]
    ) {
      setError('Confirm the first word of each saved phrase.');
      return;
    }
    await run(async () => {
      await saveWallet(recovery, firstPin, network);
      setStoredAddress(recovery.address);
      setUnlockedAddress(recovery.address);
      dialog.current?.close();
      clear();
    });
  }
  return (
    <section className="live-card">
      <h2>Your testnet wallet</h2>
      <p>
        Create a wallet here, save its recovery phrases, then unlock with your PIN. Your wallet
        stays on this device; PINs and recovery phrases are never sent to Hauntbox.
      </p>
      <p>
        This wallet receives optional {network} rewards. It does not open the host’s inbox. Balance
        scanning and sending are separate wallet features still pending.
      </p>
      <div className="hero-actions">
        {unlockedAddress ? (
          <>
            <button className="primary" onClick={() => onUseAddress(unlockedAddress)}>
              Use my wallet for rewards
            </button>
            <button className="secondary" onClick={() => setUnlockedAddress('')}>
              Lock wallet
            </button>
          </>
        ) : storedAddress ? (
          <button className="primary" disabled={!loaded} onClick={() => open('unlock')}>
            Sign in with PIN
          </button>
        ) : (
          <button
            className="primary"
            disabled={!loaded || !['localnet', 'esmeralda'].includes(network)}
            onClick={() => open('create')}
          >
            Create wallet
          </button>
        )}
        <button
          className="secondary"
          disabled={!loaded || !['localnet', 'esmeralda'].includes(network)}
          onClick={() => open('recover')}
        >
          Recover wallet
        </button>
      </div>
      {unlockedAddress && <p className="live-code">Your payout address: {unlockedAddress}</p>}
      {error && !dialog.current?.open && <p role="alert">{error}</p>}
      <dialog
        ref={dialog}
        className="wallet-dialog"
        aria-labelledby="wallet-dialog-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else clear();
        }}
        onClose={clear}
      >
        <div className="wallet-dialog-header">
          <h2 id="wallet-dialog-title">
            {recovery
              ? 'Save your recovery phrases'
              : mode === 'unlock'
                ? 'Unlock your wallet'
                : mode === 'recover'
                  ? 'Recover your wallet'
                  : 'Create your wallet'}
          </h2>
          <button
            className="secondary"
            aria-label="Close wallet dialog"
            disabled={busy}
            onClick={() => {
              dialog.current?.close();
              clear();
            }}
          >
            Close
          </button>
        </div>
        {recovery ? (
          <>
            <p>
              Write down both 24-word phrases in order. They restore your spending and view keys.
              This setup shows them once; keep them private. These are Hauntbox recovery phrases,
              not the native Tari daemon’s seed words.
            </p>
            <label>
              Spending-key recovery phrase
              <textarea
                aria-label="Spending-key recovery phrase"
                readOnly
                rows={4}
                value={recovery.ownerPhrase}
              />
            </label>
            <label>
              View-key recovery phrase
              <textarea
                aria-label="View-key recovery phrase"
                readOnly
                rows={4}
                value={recovery.viewPhrase}
              />
            </label>
            <label>
              First word of spending-key phrase
              <input
                autoComplete="off"
                value={ownerWord}
                onChange={(e) => setOwnerWord(e.target.value)}
              />
            </label>
            <label>
              First word of view-key phrase
              <input
                autoComplete="off"
                value={viewWord}
                onChange={(e) => setViewWord(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy} onClick={() => void finish()}>
              I saved both phrases — finish setup
            </button>
          </>
        ) : (
          <>
            {mode === 'recover' && (
              <>
                <p>
                  Enter both Hauntbox recovery phrases. Choose a new local PIN afterward. A native
                  Tari wallet seed phrase uses a different format and cannot be imported here.
                </p>
                <label>
                  Spending-key recovery phrase
                  <textarea
                    aria-label="Spending-key recovery phrase"
                    autoComplete="off"
                    spellCheck={false}
                    rows={3}
                    value={ownerPhrase}
                    onChange={(e) => setOwnerPhrase(e.target.value)}
                  />
                </label>
                <label>
                  View-key recovery phrase
                  <textarea
                    aria-label="View-key recovery phrase"
                    autoComplete="off"
                    spellCheck={false}
                    rows={3}
                    value={viewPhrase}
                    onChange={(e) => setViewPhrase(e.target.value)}
                  />
                </label>
              </>
            )}
            <p>
              {mode === 'unlock'
                ? 'Enter your wallet PIN.'
                : firstPin
                  ? 'Enter your PIN again to confirm.'
                  : 'Choose an 8–12 digit PIN for this device.'}
            </p>
            <label>
              {firstPin ? 'Confirm wallet PIN' : 'Wallet PIN'}
              <input
                type="password"
                inputMode="numeric"
                maxLength={12}
                value={pin}
                autoComplete={mode === 'unlock' ? 'current-password' : 'new-password'}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy) void submitPin();
                }}
              />
            </label>
            <div className="wallet-keypad" role="group" aria-label="PIN keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Delete'].map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={busy}
                  aria-label={
                    key === 'Delete'
                      ? 'Delete last PIN digit'
                      : key === 'Clear'
                        ? 'Clear PIN'
                        : `PIN digit ${key}`
                  }
                  onClick={() =>
                    setPin((value) =>
                      key === 'Clear'
                        ? ''
                        : key === 'Delete'
                          ? value.slice(0, -1)
                          : value.length < 12
                            ? value + key
                            : value,
                    )
                  }
                >
                  {key}
                </button>
              ))}
            </div>
            <button className="primary" disabled={busy} onClick={() => void submitPin()}>
              {mode === 'unlock'
                ? 'Unlock wallet'
                : firstPin
                  ? mode === 'recover'
                    ? 'Restore wallet'
                    : 'Generate wallet'
                  : 'Continue'}
            </button>
            <p>
              Testnet only. The PIN unlocks encrypted data in this browser. Keep both recovery
              phrases for a lost device or forgotten PIN.
            </p>
          </>
        )}
        {busy && <p role="status">Preparing your wallet…</p>}
        {error && <p role="alert">{error}</p>}
      </dialog>
    </section>
  );
}
