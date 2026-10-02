import { useEffect, useState } from 'react';
import {
  createRoomKey,
  restoreRoomKey,
  sealStory,
  openStory,
  randomCapability,
  randomSubmissionId,
  validateEnvelope,
  envelopeDigest,
  type RoomKey,
  type StoryPayload,
  type EnvelopeContext,
} from '../../../packages/crypto/index';
import type { JWK } from 'jose';
import { vaultGet, vaultPut } from './browser-vault';
import { passkeyCeremony } from './passkeys';
import { WalletSetup, type FundingStatus } from './WalletSetup';
import { HostPinSignIn } from './HostPinSignIn';

interface Room {
  id: string;
  title: string;
  prompt: string;
  publicJwk: JWK;
  keyThumbprint: string;
  network: string;
  capacity: number;
  state: string;
  component: string | null;
}
interface Entry {
  submissionId: string;
  envelope: string;
  digest: string;
  state: string;
  rewardId?: string;
  rewardState?: string;
}
interface SavedEntry extends Entry {
  roomId: string;
  lookupCapability: string;
  context: EnvelopeContext;
  challenge: string;
}
interface Quote {
  quoteId: string;
  recipient: string;
  amount: string;
  maxFee: string;
  expiresAt: string;
  disclosure: string;
}
interface Receipt {
  fixture: false;
  submissionId: string;
  digest: string;
  network: string;
  component: string;
  epoch: string;
  transactionId: string;
}
const friendly: Record<string, string> = {
  CURATOR_SIGN_IN_REQUIRED: 'Sign in as host using the PIN or passkey originally configured.',
  FRESH_PASSKEY_REQUIRED: 'Sign in again before creating a room or sending a reward.',
  PASSKEY_BROWSER_UNAVAILABLE:
    'Passkeys need a secure browser. Open this page in Chrome, Edge, or Firefox with HTTPS or localhost.',
  NotAllowedError:
    'The passkey request was cancelled or timed out. Open this same address in your regular browser and complete its passkey prompt.',
  CURATOR_SETUP_REQUIRED:
    'The curator has not registered a passkey yet. Use the private setup code supplied by the operator.',
  ROOM_FULL: 'This room has reached its entry limit.',
  ROOM_NOT_OPEN: 'This room is not accepting entries.',
  INTAKE_PAUSED: 'Submissions are paused. Your encrypted draft is still saved in this browser.',
  PAYOUTS_PAUSED: 'Rewards are paused while funding or network checks are pending.',
  SERVICE_UNAVAILABLE:
    'The service is unavailable. Keep your saved envelope and try checking its status later.',
  INVALID_SAME_NETWORK_ADDRESS:
    'Enter a standard address for this room’s network without an embedded payment reference.',
  PRIVATE_FUNDS_OR_FEE_UNAVAILABLE:
    'The reward wallet cannot cover this private transfer and its fee. The operator must check faucet funding.',
};
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({ code: 'SERVICE_UNAVAILABLE' }));
  if (!response.ok) throw new Error(body.code ?? 'SERVICE_UNAVAILABLE');
  return body as T;
}
function download(name: string, value: string) {
  const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
function units(value: string) {
  const amount = BigInt(value);
  return `${amount / 1000000n}.${(amount % 1000000n).toString().padStart(6, '0')} tTARI`;
}

export function LiveApp() {
  const [rooms, setRooms] = useState<Room[]>([]),
    [selected, setSelected] = useState<string>(''),
    [view, setView] = useState(
      window.location.pathname === '/account'
        ? 'wallet'
        : window.location.pathname === '/submit'
          ? 'desk'
          : 'entrance',
    );
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [authenticated, setAuthenticated] = useState(false),
    [csrf, setCsrf] = useState('');
  const [network, setNetwork] = useState('checking'),
    [story, setStory] = useState(''),
    [address, setAddress] = useState(''),
    [nickname, setNickname] = useState('');
  const [fundingStatus, setFundingStatus] = useState<FundingStatus | null>(null);
  const [saved, setSaved] = useState<SavedEntry | null>(null),
    [receipt, setReceipt] = useState<Receipt | null>(null);
  const [bootstrap, setBootstrap] = useState(''),
    [generated, setGenerated] = useState<RoomKey | null>(null),
    [recoveryFile, setRecoveryFile] = useState(''),
    [recoveryCode, setRecoveryCode] = useState(''),
    [recoveryChecked, setRecoveryChecked] = useState(false);
  const [title, setTitle] = useState('The Last Letter'),
    [prompt, setPrompt] = useState('Send a two-sentence ghost story.'),
    [capacity, setCapacity] = useState(128);
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null),
    [entries, setEntries] = useState<Entry[]>([]),
    [inboxCursor, setInboxCursor] = useState<string | null>(null),
    [opened, setOpened] = useState<{ entry: Entry; payload: StoryPayload } | null>(null);
  const [amount, setAmount] = useState('1'),
    [disclosure, setDisclosure] = useState(false),
    [quote, setQuote] = useState<Quote | null>(null),
    [rewardId, setRewardId] = useState(''),
    [rewardState, setRewardState] = useState('');
  const room = rooms.find((row) => row.id === selected);
  const context = (id: string): EnvelopeContext => {
    if (!room?.component) throw new Error('ROOM_NOT_OPEN');
    return {
      network: room.network,
      component: room.component,
      submissionId: id,
      keyThumbprint: room.keyThumbprint,
    };
  };
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'SERVICE_UNAVAILABLE';
      setError(
        friendly[code] ??
          (e instanceof DOMException ? friendly[e.name] : undefined) ??
          'The operation could not complete. Keep your saved files and retry the status check.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function refreshRooms() {
    const result = await api<{ rooms: Room[] }>('/api/rooms');
    setRooms(result.rooms);
    if (!selected && result.rooms[0]) setSelected(result.rooms[0].id);
  }
  async function session() {
    try {
      const result = await api<{ csrf: string }>('/api/auth/session');
      setAuthenticated(true);
      setCsrf(result.csrf);
    } catch {
      setAuthenticated(false);
    }
  }
  const authHeaders = () => ({ 'x-hauntbox-csrf': csrf });
  useEffect(() => {
    void run(async () => {
      await refreshRooms();
      const status = await api<{ network: string }>('/api/status');
      setNetwork(status.network);
      setFundingStatus(await api<FundingStatus>('/api/funding/status'));
      await session();
      setSaved((await vaultGet<SavedEntry>('last-submission')) ?? null);
    });
  }, []);
  useEffect(() => {
    if (!rooms.some((row) => ['creating', 'closing'].includes(row.state))) return;
    const timer = setInterval(() => {
      void refreshRooms().catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [rooms, selected]);
  useEffect(() => {
    if (!saved || !['queued', 'submitted'].includes(saved.state)) return;
    const timer = setInterval(() => {
      void checkReceipt().catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [saved]);
  useEffect(() => {
    setPrivateKey(null);
    setOpened(null);
    setEntries([]);
    setQuote(null);
    setRewardId('');
  }, [selected]);
  async function signIn(kind: 'register' | 'login') {
    const start = await api<{ ceremonyId: string; options: Record<string, unknown> }>(
      `/api/auth/${kind}/options`,
      {
        method: 'POST',
        body: JSON.stringify(kind === 'register' ? { bootstrapCode: bootstrap } : {}),
      },
    );
    const response = await passkeyCeremony(kind, start.options);
    const result = await api<{ csrf: string }>(`/api/auth/${kind}/verify`, {
      method: 'POST',
      body: JSON.stringify({ ceremonyId: start.ceremonyId, response }),
    });
    setCsrf(result.csrf);
    setAuthenticated(true);
    setBootstrap('');
    setNotice('Curator signed in.');
  }
  async function checkRecovery() {
    const expected = generated?.thumbprint ?? room?.keyThumbprint;
    if (!expected) throw new Error('ROOM_NOT_OPEN');
    const restored = await restoreRoomKey(recoveryFile, recoveryCode, expected);
    const selfTest = {
      network: 'localnet',
      component: `component_${'0'.repeat(64)}`,
      submissionId: randomSubmissionId(),
      keyThumbprint: restored.thumbprint,
    };
    const encrypted = await sealStory(
      { version: 1, text: 'Recovery verification' },
      selfTest,
      restored.publicJwk,
    );
    const decrypted = await openStory(encrypted.envelope, selfTest, restored.privateKey);
    if (decrypted.text !== 'Recovery verification') throw new Error('RECOVERY_FAILED');
    await vaultPut(`key:${restored.thumbprint}`, restored.privateKey);
    setPrivateKey(restored.privateKey);
    setRecoveryChecked(true);
    setRecoveryCode('');
    setRecoveryFile('');
    setNotice('Recovery file and code verified. The working key remains in this browser.');
  }
  async function createRoom() {
    if (!generated || !recoveryChecked) throw new Error('RECOVERY_REQUIRED');
    const created = await api<Room>('/api/curator/rooms', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        title,
        prompt,
        publicJwk: generated.publicJwk,
        keyThumbprint: generated.thumbprint,
        capacity,
        recoveryVerified: true,
      }),
    });
    setRooms([created, ...rooms]);
    setSelected(created.id);
    setGenerated(null);
    setRecoveryChecked(false);
    setNotice('Room creation queued. Intake opens after its chain configuration is verified.');
  }
  async function submit() {
    if (!room?.component) throw new Error('ROOM_NOT_OPEN');
    if (!story.trim() || new TextEncoder().encode(story).length > 2000)
      throw new Error('INVALID_STORY');
    const id = randomSubmissionId(),
      expected = context(id),
      encrypted = await sealStory(
        {
          version: 1,
          text: story,
          ...(address ? { payoutAddress: address } : {}),
          ...(nickname ? { nickname } : {}),
        },
        expected,
        room.publicJwk,
      );
    const challenge = (
      await api<{ challenge: string }>(`/api/rooms/${room.id}/challenge`, {
        method: 'POST',
        body: '{}',
      })
    ).challenge;
    const pending: SavedEntry = {
      submissionId: id,
      roomId: room.id,
      lookupCapability: randomCapability(),
      context: expected,
      challenge,
      ...encrypted,
      state: 'encrypted',
    };
    // Preserve exact randomized bytes and capability before HTTP: retries reuse this record.
    await vaultPut('last-submission', pending);
    setSaved(pending);
    setStory('');
    setAddress('');
    setNickname('');
    setView('receipt');
    await uploadSaved(pending);
  }
  async function uploadSaved(entry: SavedEntry) {
    const upload = (value: SavedEntry) =>
      api<{ state: string }>(`/api/rooms/${value.roomId}/envelopes`, {
        method: 'POST',
        headers: { 'idempotency-key': value.submissionId },
        body: JSON.stringify({
          submissionId: value.submissionId,
          envelope: value.envelope,
          digest: value.digest,
          challenge: value.challenge,
          lookupCapability: value.lookupCapability,
        }),
      });
    let result;
    try {
      result = await upload(entry);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'UPLOAD_CHALLENGE_EXPIRED') throw error;
      const renewed = await api<{ challenge: string }>(`/api/rooms/${entry.roomId}/challenge`, {
        method: 'POST',
        body: '{}',
      });
      entry = { ...entry, challenge: renewed.challenge };
      await vaultPut('last-submission', entry);
      result = await upload(entry);
    }
    const stored = { ...entry, state: result.state };
    await vaultPut('last-submission', stored);
    setSaved(stored);
    setNotice(
      result.state === 'confirmed'
        ? 'The existing anchored envelope was recovered.'
        : 'Encrypted envelope stored. Chain anchoring is pending.',
    );
  }
  async function checkReceipt() {
    if (!saved) return;
    const result = await api<{ state: string; receiptAvailable: boolean }>(
      `/api/envelopes/${saved.submissionId}/status`,
      { headers: { Authorization: `Bearer ${saved.lookupCapability}` } },
    );
    const updated = { ...saved, state: result.state };
    await vaultPut('last-submission', updated);
    setSaved(updated);
    if (result.receiptAvailable) {
      const proof = await api<Receipt>(`/api/receipts/${saved.submissionId}`);
      if (
        proof.fixture !== false ||
        proof.digest !== saved.digest ||
        proof.component !== saved.context.component ||
        proof.network !== saved.context.network
      )
        throw new Error('RECEIPT_MISMATCH');
      setReceipt(proof);
    }
  }
  async function inbox(more = false) {
    if (!room) return;
    const result = await api<{ envelopes: Entry[]; next: string | null }>(
      `/api/curator/rooms/${room.id}/envelopes${more && inboxCursor ? `?after=${inboxCursor}` : ''}`,
    );
    setEntries(more ? [...entries, ...result.envelopes] : result.envelopes);
    setInboxCursor(result.next);
    setPrivateKey((await vaultGet<CryptoKey>(`key:${room.keyThumbprint}`)) ?? null);
  }
  async function openEnvelope(entry: Entry) {
    if (!privateKey) throw new Error('RECOVERY_REQUIRED');
    const payload = await openStory(entry.envelope, context(entry.submissionId), privateKey);
    setOpened({ entry, payload });
    setQuote(null);
    setRewardId(entry.rewardId ?? '');
    setRewardState(entry.rewardState ?? '');
    setDisclosure(false);
  }
  function amountUnits() {
    if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(amount)) throw new Error('INVALID_AMOUNT');
    const [whole, fraction = ''] = amount.split('.');
    return (BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'))).toString();
  }
  async function rewardQuote() {
    if (!opened?.payload.payoutAddress || !disclosure) throw new Error('DISCLOSURE_REQUIRED');
    setQuote(
      await api<Quote>('/api/curator/rewards/quote', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          submissionId: opened.entry.submissionId,
          recipient: opened.payload.payoutAddress,
          amount: amountUnits(),
          disclosureAccepted: true,
        }),
      }),
    );
  }
  async function confirmReward() {
    if (!quote) return;
    const result = await api<{ rewardId: string; state: string }>(
      `/api/curator/rewards/${quote.quoteId}/confirm`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ confirmation: 'SEND PRIVATE TESTNET REWARD' }),
      },
    );
    setRewardId(result.rewardId);
    setRewardState(result.state);
    setQuote(null);
  }
  async function checkReward() {
    const result = await api<{ state: string }>(`/api/curator/rewards/${rewardId}`);
    setRewardState(result.state);
  }
  function recoveryForm() {
    return (
      <div className="live-form">
        <label>
          Encrypted recovery file
          <input
            type="file"
            accept=".json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && file.size <= 16384) void file.text().then(setRecoveryFile);
              else setError('Choose a recovery file smaller than 16 KB.');
            }}
          />
        </label>
        <label>
          Separate recovery code
          <input
            type="password"
            autoComplete="off"
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
          />
        </label>
        <button
          className="secondary"
          disabled={busy || !recoveryFile || !recoveryCode}
          onClick={() => void run(checkRecovery)}
        >
          Verify and restore key
        </button>
        <p>
          Keep the recovery file and code in separate safe places. Losing both your working key and
          recovery material makes the stories unreadable.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="demo-banner">
        <strong>
          {network === 'checking'
            ? 'Application status loading'
            : network === 'localnet'
              ? 'Local test network'
              : 'Esmeralda testnet beta'}
        </strong>
        <span>Encrypted stories · discretionary testnet rewards · operator-custodied funds</span>
      </div>
      <header className="site-header">
        <a className="brand" href="/">
          ✦ Hauntbox
        </a>
        <nav aria-label="Main">
          <button className="text-button" onClick={() => setView('entrance')}>
            The room
          </button>
          <button className="text-button" onClick={() => setView('receipt')}>
            Your receipt
          </button>
          <button className="text-button" onClick={() => setView('privacy')}>
            Privacy
          </button>
          <button className="text-button" onClick={() => setView('wallet')}>
            Sign in / My account
          </button>
          <button className="text-button" onClick={() => setView('curator')}>
            Host / Curator
          </button>
          <a href="/demo">Try the guided demo</a>
        </nav>
      </header>
      <main className="live-main">
        <p className="eyebrow">HAUNTBOX · THE HAUNTED POST OFFICE</p>
        {error && (
          <div role="alert" className="live-error">
            {error}
          </div>
        )}
        {notice && (
          <p role="status" className="live-notice">
            {notice}
          </p>
        )}
        {busy && <p role="status">Working…</p>}
        {view === 'entrance' && (
          <>
            <h1>
              Seal your story.
              <br />
              <em>Prove it arrived.</em>
            </h1>
            <p className="hero-description">
              Your story is encrypted here in your browser. The curator can open it, and a chain
              receipt proves that the encrypted bytes arrived. A testnet reward is optional.
            </p>
            <section className="live-card">
              <h2>{room?.title ?? 'Your private submission room'}</h2>
              {rooms.length > 0 && (
                <label>
                  Choose room
                  <select
                    aria-label="Choose room"
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {rooms.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.title} — {row.state}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p>
                {room?.prompt ??
                  'The curator is setting up the first room. You can try the guided demo now.'}
              </p>
              <p>
                Room status: <strong>{room?.state ?? 'Setup pending'}</strong>
                {room && ` · maximum ${room.capacity} entries`}
              </p>
              <button className="primary" disabled={busy} onClick={() => setView('desk')}>
                Open submission desk
              </button>{' '}
              <a className="secondary" href="/demo">
                Try the guided demo
              </a>
            </section>
          </>
        )}
        {view === 'desk' && (
          <section className="live-card">
            <h1>Seal your submission</h1>
            <p>{room?.prompt}</p>
            {room?.state !== 'open' && (
              <p role="status">
                Intake is waiting for a verified room and funded receipt wallet. You can review the
                form; sealing becomes available when the room opens.
              </p>
            )}
            <div className="live-form">
              <label>
                Your private story
                <textarea value={story} onChange={(e) => setStory(e.target.value)} rows={7} />
              </label>
              <p>{new TextEncoder().encode(story).length} / 2,000 UTF-8 bytes</p>
              <label>
                Nickname, optional
                <input
                  value={nickname}
                  maxLength={80}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </label>
              <label>
                Same-network payout address, optional
                <input
                  value={address}
                  maxLength={512}
                  onChange={(e) => setAddress(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <button className="text-button" onClick={() => setView('wallet')}>
                Sign in or set up my participant account
              </button>
              <p>
                The address travels inside the encrypted envelope. The curator sees it when opening
                your story. Sending a selected reward later discloses the address and amount to the
                operator wallet service.
              </p>
              <button
                className="primary"
                disabled={
                  busy ||
                  room?.state !== 'open' ||
                  !story.trim() ||
                  new TextEncoder().encode(story).length > 2000
                }
                onClick={() => void run(submit)}
              >
                Encrypt and seal submission
              </button>
            </div>
          </section>
        )}
        {view === 'receipt' && (
          <section className="live-card">
            <h1>Your sealed envelope</h1>
            {saved ? (
              <>
                <p>
                  Status: <strong>{saved.state}</strong>
                </p>
                <p className="live-code">Digest: {saved.digest}</p>
                <p>
                  {saved.state === 'confirmed'
                    ? 'Inclusion confirmed. Your receipt proves the digest of encrypted bytes was recorded.'
                    : 'Your exact encrypted envelope is saved in this browser. Keep a private copy while chain confirmation is pending.'}
                </p>
                <div className="hero-actions">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void run(checkReceipt)}
                  >
                    Check receipt
                  </button>
                  <button
                    className="secondary"
                    onClick={() =>
                      download(
                        'hauntbox-private-envelope.json',
                        JSON.stringify({ version: 1, ...saved }, null, 2),
                      )
                    }
                  >
                    Save private envelope
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void run(() => uploadSaved(saved))}
                  >
                    Retry saved upload
                  </button>
                  {receipt && (
                    <button
                      className="primary"
                      onClick={() =>
                        download('hauntbox-public-receipt.json', JSON.stringify(receipt, null, 2))
                      }
                    >
                      Download inclusion receipt
                    </button>
                  )}
                </div>
                <p>
                  The private envelope file includes its secret lookup capability. Keep it private.
                  The inclusion receipt contains public chain evidence only.
                </p>
              </>
            ) : (
              <p>No submission is saved in this browser yet.</p>
            )}
            <label>
              Restore a private envelope file
              <input
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && file.size < 20000)
                    void run(async () => {
                      const imported = JSON.parse(await file.text()) as SavedEntry;
                      validateEnvelope(imported.envelope, imported.context);
                      if (
                        !/^[A-Za-z0-9_-]{43}$/.test(imported.lookupCapability) ||
                        imported.submissionId !== imported.context.submissionId ||
                        !/^[a-f0-9-]{36}$/.test(imported.roomId) ||
                        (await envelopeDigest(imported.envelope)) !== imported.digest
                      )
                        throw new Error('INVALID_FILE');
                      const restored = { ...imported, state: 'encrypted' };
                      await vaultPut('last-submission', restored);
                      setSaved(restored);
                      setReceipt(null);
                    });
                }}
              />
            </label>
          </section>
        )}
        {view === 'curator' && (
          <>
            <h1>Curator’s desk</h1>
            {!authenticated ? (
              <>
                <HostPinSignIn
                  onSignedIn={(value) => {
                    setCsrf(value);
                    setAuthenticated(true);
                  }}
                />
                <section className="live-card">
                  <h2>Sign in with your passkey</h2>
                  <p>
                    Use your device or security key. Open this same address in a regular browser if
                    its embedded browser cannot complete the passkey prompt.
                  </p>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void run(() => signIn('login'))}
                  >
                    Sign in with passkey
                  </button>
                  <details>
                    <summary>First-time operator setup</summary>
                    <label>
                      Private setup code
                      <input
                        type="password"
                        value={bootstrap}
                        onChange={(e) => setBootstrap(e.target.value)}
                        autoComplete="off"
                      />
                    </label>
                    <button
                      className="secondary"
                      disabled={busy || !bootstrap}
                      onClick={() => void run(() => signIn('register'))}
                    >
                      Register curator passkey
                    </button>
                  </details>
                </section>
              </>
            ) : (
              <>
                <details>
                  <summary>Refresh host authorization with PIN</summary>
                  <HostPinSignIn
                    onSignedIn={(value) => {
                      setCsrf(value);
                      setAuthenticated(true);
                    }}
                  />
                </details>
                <div className="hero-actions">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void run(() => signIn('login'))}
                  >
                    Refresh passkey authorization
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api('/api/auth/logout', {
                          method: 'POST',
                          headers: authHeaders(),
                          body: '{}',
                        });
                        setAuthenticated(false);
                        setCsrf('');
                        setPrivateKey(null);
                        setOpened(null);
                        setEntries([]);
                        setGenerated(null);
                        setRecoveryCode('');
                        setQuote(null);
                        setFundingStatus(null);
                      })
                    }
                  >
                    Sign out
                  </button>
                </div>
                <section className="live-card">
                  <h2>Create a private room</h2>
                  <div className="live-form">
                    <label>
                      Room title
                      <input
                        value={title}
                        maxLength={80}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </label>
                    <label>
                      Public prompt
                      <textarea
                        value={prompt}
                        maxLength={500}
                        onChange={(e) => setPrompt(e.target.value)}
                      />
                    </label>
                    <label>
                      Maximum entries
                      <input
                        type="number"
                        min={1}
                        max={128}
                        value={capacity}
                        onChange={(e) => setCapacity(Number(e.target.value))}
                      />
                    </label>
                    {!generated ? (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            setGenerated(await createRoomKey());
                            setRecoveryChecked(false);
                          })
                        }
                      >
                        Generate browser encryption key
                      </button>
                    ) : (
                      <>
                        <p>
                          The private key stays in this browser. Download the encrypted file and
                          copy its separate recovery code, then restore them below before
                          activation.
                        </p>
                        <button
                          className="secondary"
                          onClick={() =>
                            download('hauntbox-room-recovery.json', generated.recoveryFile)
                          }
                        >
                          Download encrypted recovery file
                        </button>
                        <label>
                          Separate recovery code
                          <input readOnly value={generated.recoveryCode} />
                        </label>
                        {recoveryForm()}
                        <button
                          className="primary"
                          disabled={busy || !recoveryChecked}
                          onClick={() => void run(createRoom)}
                        >
                          Create room on chain
                        </button>
                      </>
                    )}
                  </div>
                </section>
                {room && (
                  <section className="live-card">
                    <h2>Inbox — {room.title}</h2>
                    <label>
                      Choose room
                      <select
                        aria-label="Choose room"
                        value={selected}
                        onChange={(e) => setSelected(e.target.value)}
                      >
                        {rooms.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.title} — {row.state}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="hero-actions">
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => void run(() => inbox())}
                      >
                        Load encrypted inbox
                      </button>
                      <button
                        className="secondary"
                        disabled={busy || room.state !== 'open'}
                        onClick={() =>
                          void run(async () => {
                            await api(`/api/curator/rooms/${room.id}/close`, {
                              method: 'POST',
                              headers: authHeaders(),
                              body: '{}',
                            });
                            await refreshRooms();
                          })
                        }
                      >
                        Close intake
                      </button>
                    </div>
                    {!privateKey && (
                      <>
                        <p>
                          The room key is locked or missing from this browser. Restore it locally.
                        </p>
                        {recoveryForm()}
                      </>
                    )}
                    {inboxCursor && (
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => void run(() => inbox(true))}
                      >
                        Load more encrypted envelopes
                      </button>
                    )}
                    <ul className="live-entries">
                      {entries.map((entry) => (
                        <li key={entry.submissionId}>
                          <span>
                            {entry.submissionId.slice(0, 12)}… · {entry.state}
                          </span>
                          <button
                            className="secondary"
                            disabled={busy || !privateKey}
                            onClick={() => void run(() => openEnvelope(entry))}
                          >
                            Open envelope
                          </button>
                        </li>
                      ))}
                    </ul>
                    {opened && (
                      <article>
                        <h3>Opened in your browser</h3>
                        <p className="live-story">{opened.payload.text}</p>
                        {opened.payload.nickname && <p>Nickname: {opened.payload.nickname}</p>}
                        {opened.payload.payoutAddress ? (
                          <div className="live-form">
                            <h3>Optional private testnet reward</h3>
                            <label>
                              Recipient disclosed on approval
                              <input readOnly value={opened.payload.payoutAddress} />
                            </label>
                            <label>
                              Amount in tTARI
                              <input
                                value={amount}
                                onChange={(e) => {
                                  setAmount(e.target.value);
                                  setQuote(null);
                                }}
                                inputMode="decimal"
                              />
                            </label>
                            <label className="live-check">
                              <input
                                type="checkbox"
                                checked={disclosure}
                                onChange={(e) => {
                                  setDisclosure(e.target.checked);
                                  setQuote(null);
                                }}
                              />
                              I understand that this selected recipient and amount will be disclosed
                              to the operator wallet service. Sponsor funds are held by the
                              operator.
                            </label>
                            <button
                              className="secondary"
                              disabled={
                                busy ||
                                !disclosure ||
                                !!rewardId ||
                                opened.entry.state !== 'confirmed'
                              }
                              onClick={() => void run(rewardQuote)}
                            >
                              Get private reward quote
                            </button>
                            {quote && (
                              <div>
                                <p>
                                  Reward: {units(quote.amount)} · maximum fee: {units(quote.maxFee)}
                                </p>
                                <p>{quote.disclosure}</p>
                                <p>
                                  Quote expires: {new Date(quote.expiresAt).toLocaleTimeString()}
                                </p>
                                <button
                                  className="primary"
                                  disabled={busy}
                                  onClick={() => void run(confirmReward)}
                                >
                                  Confirm this private testnet reward
                                </button>
                              </div>
                            )}
                            {rewardId && (
                              <div role="status">
                                <p>
                                  Reward status: <strong>{rewardState}</strong>
                                </p>
                                <button
                                  className="secondary"
                                  disabled={busy}
                                  onClick={() => void run(checkReward)}
                                >
                                  Check reward status
                                </button>
                                {rewardState === 'unknown' && (
                                  <p>
                                    The outcome is uncertain. The operator must reconcile the
                                    original transaction before another payment can be considered.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p>
                            No payout address was supplied. This entry has no reward destination.
                          </p>
                        )}
                      </article>
                    )}
                  </section>
                )}
              </>
            )}
          </>
        )}
        {view === 'wallet' && (
          <WalletSetup
            network={network}
            funding={fundingStatus}
            onReturn={() => setView('desk')}
            onOperator={() => setView('curator')}
            onUseAddress={(value) => {
              setAddress(value);
              setView('desk');
            }}
            onRefresh={() =>
              void run(async () => {
                const publicStatus = await api<FundingStatus>('/api/funding/status');
                const privateStatus = authenticated
                  ? await api<Record<string, string>>('/api/curator/funding/status')
                  : {};
                setFundingStatus({ ...publicStatus, ...privateStatus });
              })
            }
          />
        )}
        {view === 'privacy' && (
          <section className="live-card">
            <h1>Who can see what?</h1>
            <table>
              <thead>
                <tr>
                  <th>Party</th>
                  <th>Visible information</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Public observer</td>
                  <td>
                    Room configuration, random submission ID, encrypted-envelope digest, inclusion
                    epoch, chain transaction metadata and fees.
                  </td>
                </tr>
                <tr>
                  <td>Curator</td>
                  <td>
                    Stories and optional payout addresses after deliberately opening an envelope.
                    The curator can open them as soon as they arrive.
                  </td>
                </tr>
                <tr>
                  <td>Operator</td>
                  <td>
                    Encrypted envelope bytes and operational metadata. A selected reward discloses
                    its recipient and amount to the wallet service.
                  </td>
                </tr>
              </tbody>
            </table>
            <p>
              Browser encryption protects story content. Tari native private transfers protect
              reward outputs. Neither provides anonymity, timed decryption, guaranteed rewards,
              hidden fees, or protection against a compromised browser.
            </p>
            <p>
              A receipt proves inclusion of encrypted bytes. It does not prove authorship, payment,
              or permanent availability.
            </p>
          </section>
        )}
      </main>
      <footer className="live-footer">
        Hauntbox · testnet funds only · <a href="/demo">Guided fixture demo</a>
      </footer>
    </>
  );
}
