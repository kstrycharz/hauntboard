import { useEffect, useRef, useState } from 'react';
import {
  byteLength,
  createMockAdapter,
  SAMPLE_ADDRESS,
  SAMPLE_STORY,
  validateDraft,
  type Draft,
  type Envelope,
  type RewardQuote,
  type Route,
  type Scenario,
} from './domain';

const adapter = createMockAdapter();
const routes: Route[] = ['entrance', 'desk', 'receipt', 'inbox', 'reward', 'privacy', 'recovery'];
const labels: Record<Route, string> = {
  entrance: 'The room',
  desk: 'Submission desk',
  receipt: 'Your receipt',
  inbox: 'Curator inbox',
  reward: 'Private reward',
  privacy: 'Privacy inspector',
  recovery: 'Recovery & status',
};
function readRoute(): Route {
  const value = window.location.hash.slice(1) as Route;
  return routes.includes(value) ? value : 'entrance';
}
function Icon({
  name,
  size = 20,
}: {
  name: 'letter' | 'lock' | 'arrow' | 'eye' | 'check' | 'spark' | 'key';
  size?: number;
}) {
  const paths = {
    letter: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 6 9 7 9-7" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    check: <path d="m5 12 4 4 10-10" />,
    spark: (
      <>
        <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z" />
      </>
    ),
    key: (
      <>
        <circle cx="8" cy="8" r="5" />
        <path d="m12 12 9 9m-5-5 3-3m0 6 3-3" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
function WaxSeal({ small = false }: { small?: boolean }) {
  return (
    <div className={`wax-seal ${small ? 'small' : ''}`} aria-hidden="true">
      <Icon name="spark" size={small ? 22 : 34} />
    </div>
  );
}
function EnvelopeArt() {
  return (
    <div className="letter-scene" aria-hidden="true">
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <span className="star star-one">✧</span>
      <span className="star star-two">✦</span>
      <span className="star star-three">✧</span>
      <div className="floating-letter">
        <div className="postmark">
          HAUNTBOX
          <br />
          <span>OCTOBER · 2026</span>
        </div>
        <div className="letter-lines">
          <i />
          <i />
          <i />
        </div>
        <div className="envelope-flap" />
        <WaxSeal />
      </div>
      <p className="scene-caption">Some stories are better kept sealed.</p>
    </div>
  );
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [scenario, setScenario] = useState<Scenario>('healthy');
  const [draft, setDraft] = useState<Draft>({ text: '', payoutAddress: '' });
  const [envelope, setEnvelope] = useState<Envelope>();
  const [opened, setOpened] = useState<Draft>();
  const [unlocked, setUnlocked] = useState(false);
  const [quote, setQuote] = useState<RewardQuote>();
  const [amount, setAmount] = useState('25');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tour, setTour] = useState(false);
  const operation = useRef(false);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const generation = useRef(0);
  useEffect(() => {
    const handler = () => {
      setRoute(readRoute());
      setError('');
      setNotice('');
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  useEffect(() => {
    pageHeading.current?.focus();
  }, [route]);
  function go(next: Route) {
    setError('');
    setNotice('');
    window.location.hash = next;
    setRoute(next);
  }
  async function run(task: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const current = generation.current;
    try {
      await task();
    } catch (cause) {
      if (current === generation.current)
        setError(cause instanceof Error ? cause.message : 'The demo could not finish. Try again.');
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  function reset() {
    if (busy) return;
    generation.current++;
    adapter.reset();
    setDraft({ text: '', payoutAddress: '' });
    setEnvelope(undefined);
    setOpened(undefined);
    setQuote(undefined);
    setUnlocked(false);
    setConsent(false);
    setScenario('healthy');
    setAmount('25');
    setTour(false);
    go('entrance');
  }
  async function seal() {
    await run(async () => {
      const result = await adapter.seal(draft, scenario);
      setEnvelope(result);
      setOpened(undefined);
      setQuote(undefined);
      setConsent(false);
      go('receipt');
    });
  }
  async function openEnvelope() {
    await run(async () => {
      if (envelope) {
        setOpened(await adapter.open(envelope, scenario));
        setNotice('Sample envelope opened in the fictitious curator view.');
      }
    });
  }
  function download() {
    if (!envelope) return;
    const record = {
      kind: 'HAUNTBOX_MOCK_RECEIPT_NOT_CHAIN_EVIDENCE',
      network: 'Esmeralda · simulated',
      component: 'mock-room-the-last-letter',
      ...envelope,
      claims:
        'Synthetic bytes only. This sample proves neither blockchain inclusion, authorship, encryption, nor payment.',
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'hauntbox-mock-receipt.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Sample receipt downloaded. It contains no story or recipient.');
  }
  const mainStep =
    route === 'desk'
      ? 0
      : route === 'receipt'
        ? 1
        : route === 'inbox' || route === 'reward'
          ? 2
          : -1;
  const isCurator = route === 'inbox' || route === 'reward';
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="demo-banner">
        <span className="demo-dot" /> <strong>Mock demo — no funds move</strong>
        <span className="banner-detail">Synthetic stories. Simulated receipts & rewards.</span>
      </div>
      <header className="site-header">
        <a href="#entrance" className="brand" aria-label="Hauntbox home">
          <WaxSeal small />
          <span>
            hauntbox<span className="brand-dot">.</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#entrance" aria-current={route === 'entrance' ? 'page' : undefined}>
            The room
          </a>
          <a href="#privacy" aria-current={route === 'privacy' ? 'page' : undefined}>
            Privacy inspector
          </a>
          <a href="#inbox" className="curator-link" aria-current={isCurator ? 'page' : undefined}>
            <Icon name="key" size={16} /> Curator view
          </a>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        <div className="context-row">
          <span>
            <span className="status-dot" /> THE LAST LETTER{' '}
            <span className="context-divider">/</span> ROOM 001
          </span>
          <span className="context-right">
            {isCurator ? 'Fictitious curator' : 'Visitor'}{' '}
            <span className="pill">ESMERALDA · MOCK</span>
          </span>
        </div>
        {tour && (
          <div className="tour-banner">
            <Icon name="spark" />
            <span>
              <strong>Guided tour</strong> ·{' '}
              {mainStep === 0
                ? '1. Write your sample story and seal it.'
                : mainStep === 1
                  ? '2. Save your sample receipt. Your participant journey ends here.'
                  : mainStep === 2
                    ? '3. Open the envelope and simulate a discretionary reward.'
                    : 'Explore what each party can see.'}
            </span>
            <button className="text-button" onClick={() => setTour(false)}>
              End tour
            </button>
          </div>
        )}
        {route !== 'entrance' && (
          <div className="page-intro">
            <p className="eyebrow">THE HAUNTED POST OFFICE</p>
            <h1 ref={pageHeading} tabIndex={-1}>
              {labels[route]}
            </h1>
          </div>
        )}
        {(route === 'desk' || route === 'receipt' || route === 'inbox' || route === 'reward') && (
          <ol
            className="journey"
            aria-label={isCurator ? 'Curator demo journey' : 'Participant journey'}
          >
            {(isCurator
              ? ['Seal your story', 'Check its arrival', 'Curator demo: open & reward']
              : ['Seal your story', 'Save your receipt']
            ).map((title, index) => (
              <li
                key={title}
                className={mainStep === index ? 'active' : mainStep > index ? 'done' : ''}
              >
                <span>{mainStep > index ? <Icon name="check" size={14} /> : `0${index + 1}`}</span>
                {title}
              </li>
            ))}
          </ol>
        )}
        {error && (
          <div className="alert error" role="alert">
            <strong>Action needed</strong>
            <p>{error}</p>
          </div>
        )}
        <div className="sr-only" role="status" aria-live="polite">
          {busy ? 'Working on the simulated action. Please wait.' : notice}
        </div>
        {notice && (
          <p className="notice" aria-hidden="true">
            {notice}
          </p>
        )}

        {route === 'entrance' && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span className="tiny-star">✦</span> AN OCTOBER ROOM FOR UNTOLD STORIES
                </div>
                <h1 ref={pageHeading} tabIndex={-1}>
                  Every secret
                  <br />
                  deserves a <em>seal.</em>
                </h1>
                <p className="hero-description">
                  A haunted post office for stories you don’t want the world to read. Seal a letter,
                  check that it arrived, and optionally receive a candle: a testnet reward chosen by
                  the curator. Try the simulated experience with sample text.
                </p>
                <div className="hero-actions">
                  <button
                    className="primary"
                    onClick={() => {
                      setTour(true);
                      setDraft({ text: SAMPLE_STORY, payoutAddress: SAMPLE_ADDRESS });
                      go('desk');
                    }}
                  >
                    Try the guided demo <span aria-hidden="true">↗</span>
                  </button>
                  <button className="text-button" onClick={() => go('desk')}>
                    Enter room <Icon name="arrow" />
                  </button>
                </div>
                <p className="fine-print">
                  <Icon name="lock" size={14} /> No account or wallet needed for the mock tour.
                </p>
              </div>
              <EnvelopeArt />
            </section>
            <section className="featured-room" aria-label="Featured prompt">
              <div className="prompt-number">
                01<span>FEATURED ROOM</span>
              </div>
              <div className="prompt-copy">
                <p className="eyebrow">THE LAST LETTER</p>
                <h2>
                  It arrived after midnight.
                  <br />
                  It was addressed to you.
                </h2>
                <p>Send a two-sentence ghost story. Leave something lingering.</p>
              </div>
              <div className="prompt-meta">
                <span className="pill">TEXT ONLY</span>
                <p>
                  2,000 UTF-8 bytes
                  <br />
                  Optional testnet rewards · simulated
                </p>
                <button className="text-button" onClick={() => go('desk')}>
                  Write your letter <Icon name="arrow" size={18} />
                </button>
              </div>
            </section>
            <section className="principles" aria-label="How Hauntbox works">
              {[
                {
                  icon: 'lock' as const,
                  title: 'Seal your story',
                  text: 'The planned live app encrypts your letter in your browser for the room’s curator.',
                },
                {
                  icon: 'letter' as const,
                  title: 'Prove it arrived',
                  text: 'An Ootle receipt will record a fingerprint of the encrypted envelope, separate from payment.',
                },
                {
                  icon: 'spark' as const,
                  title: 'Receive a candle',
                  text: 'The curator may send a native private reward. This tour only simulates that decision.',
                },
              ].map((item, index) => (
                <article key={item.title}>
                  <div className="principle-top">
                    <Icon name={item.icon} />
                    <span>0{index + 1}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </section>
            <div className="privacy-footnote">
              <Icon name="eye" />
              <p>
                Secrets have boundaries. The curator can read on arrival; the operator sees selected
                payout details. Fees and transaction structure remain visible.
              </p>
              <button className="text-button" onClick={() => go('privacy')}>
                See who sees what <Icon name="arrow" size={16} />
              </button>
            </div>
          </>
        )}

        {route === 'desk' && (
          <div className="work-grid">
            <section className="panel parchment-edge">
              <div className="panel-heading">
                <Icon name="letter" />
                <div>
                  <p className="eyebrow">THE LAST LETTER</p>
                  <h2>Leave a little haunting.</h2>
                </div>
              </div>
              <p className="muted">
                A two-sentence ghost story. A door that shouldn’t open. A letter that shouldn’t
                exist.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const validation = validateDraft(draft);
                  if (validation) {
                    setError(validation);
                    return;
                  }
                  void seal();
                }}
                noValidate
              >
                <label htmlFor="story">
                  Your story <span>required</span>
                </label>
                <textarea
                  id="story"
                  rows={7}
                  placeholder="Every October, a letter arrives…"
                  value={draft.text}
                  disabled={busy}
                  onChange={(event) => setDraft({ ...draft, text: event.target.value })}
                  aria-describedby="story-help byte-count"
                  aria-invalid={byteLength(draft.text) > 2000 || (!!error && !draft.text.trim())}
                />
                <div className="field-meta">
                  <span id="story-help">Use sample text only. This mock does not encrypt.</span>
                  <span
                    id="byte-count"
                    className={byteLength(draft.text) > 2000 ? 'over-limit' : ''}
                  >
                    {byteLength(draft.text).toLocaleString('en-US')} / 2,000 bytes
                  </span>
                </div>
                <button
                  type="button"
                  className="text-button sample-button"
                  disabled={busy}
                  onClick={() => setDraft({ ...draft, text: SAMPLE_STORY })}
                >
                  Use a sample story
                </button>
                <label htmlFor="recipient">
                  Sample payout address <span>optional</span>
                </label>
                <input
                  id="recipient"
                  value={draft.payoutAddress}
                  placeholder="Leave empty, or use the sample recipient"
                  disabled={busy}
                  onChange={(event) => setDraft({ ...draft, payoutAddress: event.target.value })}
                  aria-describedby="recipient-help"
                />
                <p id="recipient-help" className="field-help">
                  Included inside the envelope in the planned live app. No address means no reward.
                </p>
                <button
                  type="button"
                  className="text-button sample-button"
                  disabled={busy}
                  onClick={() => setDraft({ ...draft, payoutAddress: SAMPLE_ADDRESS })}
                >
                  Use sample recipient
                </button>
                <div className="form-bottom">
                  <p>
                    <Icon name="lock" size={14} /> Only the curator should open your letter.
                  </p>
                  <button className="primary" disabled={busy}>
                    {busy ? 'Simulating seal…' : 'Seal submission'}
                    <Icon name="arrow" />
                  </button>
                </div>
              </form>
            </section>
            <aside className="side-stack">
              <section className="panel">
                <p className="eyebrow">BEFORE YOU SEAL</p>
                <h3>
                  A private letter.
                  <br />
                  An honest receipt.
                </h3>
                <ul className="plain-list">
                  <li>
                    <Icon name="check" />
                    Your story is intended for the curator.
                  </li>
                  <li>
                    <Icon name="check" />
                    The public receipt contains a digest.
                  </li>
                  <li>
                    <Icon name="check" />A reward is a choice, never a promise.
                  </li>
                </ul>
                <div className="callout">
                  This is a fixture simulation. Text stays in this tab’s memory, with no encryption
                  or server upload. Use no real secrets or addresses.
                </div>
              </section>
              <button className="inspector-card" onClick={() => go('privacy')}>
                <Icon name="eye" />
                <span>Inspect the privacy boundary</span>
                <Icon name="arrow" />
              </button>
            </aside>
          </div>
        )}

        {route === 'receipt' &&
          (envelope ? (
            <div className="work-grid">
              <section className="panel receipt-panel">
                <div className={`receipt-mark ${envelope.anchor !== 'anchored' ? 'waiting' : ''}`}>
                  <Icon name={envelope.anchor === 'anchored' ? 'check' : 'letter'} size={32} />
                </div>
                <p className="eyebrow">FIXTURE RECEIPT · NO CHAIN TRANSACTION</p>
                <h2>
                  {envelope.anchor === 'anchored'
                    ? 'Your sample letter arrived.'
                    : envelope.anchor === 'pending'
                      ? 'Your sample receipt is delayed.'
                      : 'The demo network is unavailable.'}
                </h2>
                <p className="muted">
                  {envelope.anchor === 'anchored'
                    ? 'Simulated inclusion records the fingerprint below. It proves neither authorship nor payment.'
                    : 'The envelope remains in this tab. Restore the demo network and check again. Do not submit a second copy.'}
                </p>
                <dl className="receipt-data">
                  <div>
                    <dt>Submission</dt>
                    <dd>{envelope.id}</dd>
                  </div>
                  <div>
                    <dt>Inclusion status</dt>
                    <dd>
                      <span className="pill">
                        {envelope.anchor === 'anchored'
                          ? 'MOCK INCLUSION'
                          : envelope.anchor.toUpperCase()}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Network / component</dt>
                    <dd>
                      Esmeralda · simulated
                      <br />
                      mock-room-the-last-letter
                    </dd>
                  </div>
                  <div>
                    <dt>Envelope digest · SHA-256</dt>
                    <dd className="digest">{envelope.digest}</dd>
                  </div>
                </dl>
                <div className="button-row">
                  <button className="secondary" onClick={download}>
                    Download sample receipt
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setEnvelope(await adapter.checkReceipt(envelope, scenario));
                        setNotice('Mock receipt status checked.');
                      })
                    }
                  >
                    Check receipt
                  </button>
                </div>
                <p className="fine-print">
                  This downloadable fixture is not live evidence. There is no explorer transaction
                  link.
                </p>
                <p>
                  Your participant journey ends here. Save the sample receipt to keep a record of
                  this demo. A receipt does not prove authorship or promise a reward. Reloading
                  clears this mock submission.
                </p>
              </section>
              <aside className="side-stack">
                <section className="panel">
                  <WaxSeal />
                  <h3>
                    On the other side
                    <br />
                    of the envelope.
                  </h3>
                  <p>
                    Continue the tour as a fictitious curator who can open this sample and choose an
                    optional testnet reward. This role switch does not grant access to real
                    submissions.
                  </p>
                  <button className="primary full" onClick={() => go('inbox')}>
                    View the curator demo <Icon name="arrow" />
                  </button>
                  <p className="fine-print">Demo role transition · no authentication or funds.</p>
                </section>
                <button className="inspector-card" onClick={() => go('privacy')}>
                  <Icon name="eye" />
                  <span>Inspect public representation</span>
                  <Icon name="arrow" />
                </button>
              </aside>
            </div>
          ) : (
            <Empty
              title="No sample receipt yet."
              text="Seal a story at the submission desk to create a fixture receipt."
              action="Go to submission desk"
              onClick={() => go('desk')}
            />
          ))}

        {route === 'inbox' &&
          (envelope ? (
            <div className="work-grid">
              <section className="panel">
                <div className="panel-heading">
                  <Icon name="letter" />
                  <div>
                    <p className="eyebrow">FICTITIOUS CURATOR · ONE SAMPLE ENVELOPE</p>
                    <h2>{opened ? 'A story in the candlelight.' : 'One letter is waiting.'}</h2>
                  </div>
                  <div className="pill">{opened ? 'OPENED' : 'SEALED'}</div>
                </div>
                <div className="inbox-row">
                  <WaxSeal small />
                  <div>
                    <strong>The Last Letter</strong>
                    <p className="mono muted">{envelope.id}</p>
                  </div>
                  <span className="muted">Sample</span>
                </div>
                {!unlocked ? (
                  <div className="key-state">
                    <Icon name="key" size={30} />
                    <h3>The curator key is locked.</h3>
                    <p>
                      In the live app, unlock locally using an encrypted recovery file and its
                      separate code. Login cannot restore a lost room key.
                    </p>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        if (scenario === 'lost-key') {
                          setError(
                            'The curator key is missing. Visit Recovery & status for the recovery procedure.',
                          );
                          return;
                        }
                        setUnlocked(true);
                      }}
                    >
                      Unlock sample key
                    </button>
                  </div>
                ) : !opened ? (
                  <div className="key-state">
                    <Icon name="lock" size={30} />
                    <h3>Ready to break the seal?</h3>
                    <p>The curator can read on arrival. There is no timed decryption.</p>
                    <button className="primary" disabled={busy} onClick={() => void openEnvelope()}>
                      {busy ? 'Simulating opening…' : 'Open envelope'}
                      <Icon name="arrow" />
                    </button>
                  </div>
                ) : (
                  <div className="opened-letter">
                    <p className="eyebrow">SYNTHETIC STORY · LOCAL DEMO VIEW</p>
                    <blockquote>{opened.text}</blockquote>
                    <p className="field-help">Sample payout address</p>
                    <p className="mono address">
                      {opened.payoutAddress || 'No recipient supplied — reward unavailable.'}
                    </p>
                  </div>
                )}
                {unlocked && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      setUnlocked(false);
                      setOpened(undefined);
                      setNotice('Sample key locked; opened story cleared from this view.');
                    }}
                  >
                    Lock sample key
                  </button>
                )}
              </section>
              <aside className="side-stack">
                <section className="panel">
                  <p className="eyebrow">A CANDLE FOR A STORY</p>
                  <h3>
                    A reward is
                    <br />
                    your decision.
                  </h3>
                  <p>
                    Operator-custodied testnet funds. No participant deposits. The operator wallet
                    service sees the selected recipient and amount.
                  </p>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(async () => {
                        if (!opened) return;
                        setQuote(await adapter.quote(opened.payoutAddress, amount, scenario));
                        setConsent(false);
                        go('reward');
                      });
                    }}
                  >
                    <label htmlFor="amount">Sample reward · base units</label>
                    <input
                      id="amount"
                      inputMode="numeric"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      disabled={!opened || !!quote || busy}
                    />
                    <p className="field-help">
                      Whole numbers, 1–1,000. Fixture fee estimate: 2 units.
                    </p>
                    <button
                      className="primary full"
                      disabled={!opened?.payoutAddress || !!quote || busy}
                    >
                      {busy ? 'Preparing sample quote…' : 'Review private reward'}
                      <Icon name="arrow" />
                    </button>
                  </form>
                  {quote && (
                    <button className="text-button" onClick={() => go('reward')}>
                      View existing reward
                    </button>
                  )}
                  <p className="fine-print">No real funds move in this demo.</p>
                </section>
              </aside>
            </div>
          ) : (
            <Empty
              title="The inbox is quiet."
              text="Switch to the visitor and seal a sample story first."
              action="Write a sample letter"
              onClick={() => go('desk')}
            />
          ))}

        {route === 'reward' &&
          (quote ? (
            <div className="work-grid">
              <section className="panel">
                <p className="eyebrow">PRIVATE REWARD · SIMULATION</p>
                <h2>
                  {quote.state === 'confirmed'
                    ? 'A sample candle sent.'
                    : quote.state === 'pending'
                      ? 'Your sample reward is pending.'
                      : quote.state === 'unknown'
                        ? 'The outcome is unknown.'
                        : quote.state === 'declined'
                          ? 'You declined this reward.'
                          : 'Send a candle for this story.'}
                </h2>
                <p className="muted">
                  {quote.state === 'unknown'
                    ? 'Freeze this intent and reconcile wallet/indexer history. Do not retry a transfer after an ambiguous submission.'
                    : quote.state === 'pending'
                      ? 'Submission is not confirmation. Simulate a committed result below; never infer payment from an HTTP success.'
                      : quote.state === 'confirmed'
                        ? 'Fixture confirmation only. This is no proof of a native transfer or recipient funds.'
                        : quote.state === 'declined'
                          ? 'No submission was attempted. The story remains available to the curator.'
                          : 'Review the exact recipient, amount, and fee before deliberately confirming.'}
                </p>
                <dl className="receipt-data">
                  <div>
                    <dt>Recipient · deliberately disclosed</dt>
                    <dd className="mono address">{quote.recipient}</dd>
                  </div>
                  <div>
                    <dt>Reward amount</dt>
                    <dd className="reward-amount">
                      {quote.amount}
                      <small>sample base units</small>
                    </dd>
                  </div>
                  <div>
                    <dt>Network</dt>
                    <dd>{quote.network}</dd>
                  </div>
                  <div>
                    <dt>Estimated fee</dt>
                    <dd>{quote.feeEstimate}</dd>
                  </div>
                  <div>
                    <dt>Intent / outcome</dt>
                    <dd>
                      {quote.id} / <strong>{quote.state.toUpperCase()}</strong>
                    </dd>
                  </div>
                </dl>
                {quote.state === 'quoted' && (
                  <>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={consent}
                        disabled={busy}
                        onChange={(event) => setConsent(event.target.checked)}
                      />
                      <span>
                        I understand that the operator wallet service sees this recipient and
                        amount. The operator controls reward funds; this demo moves none.
                      </span>
                    </label>
                    <div className="button-row">
                      <button
                        className="primary"
                        disabled={!consent || busy}
                        onClick={() =>
                          void run(async () => setQuote(await adapter.confirm(quote, scenario)))
                        }
                      >
                        {busy ? 'Simulating submission…' : 'Send private reward'}
                        <Icon name="arrow" />
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => setQuote({ ...quote, state: 'declined' })}
                      >
                        Decline reward
                      </button>
                    </div>
                  </>
                )}
                {quote.state === 'pending' && (
                  <button
                    className="primary"
                    onClick={() => setQuote({ ...quote, state: 'confirmed' })}
                  >
                    Simulate confirmed outcome <Icon name="check" />
                  </button>
                )}
                {quote.state === 'unknown' && (
                  <button className="secondary" onClick={() => go('recovery')}>
                    Read reconciliation steps
                  </button>
                )}
                {quote.state === 'confirmed' && (
                  <button className="secondary" onClick={() => go('privacy')}>
                    Inspect who sees what <Icon name="eye" />
                  </button>
                )}
              </section>
              <aside className="panel">
                <p className="eyebrow">TWO DIFFERENT KINDS OF PRIVACY</p>
                <h3>
                  The story stays sealed.
                  <br />
                  The reward has a boundary.
                </h3>
                <p>
                  App encryption protects the story for its curator. Native Tari stealth transfers
                  are intended to conceal amounts and recipient ownership from chain observers.
                </p>
                <p>
                  Fees, one-time output keys, signatures, timing, and transaction structure remain
                  observable. Live privacy is unverified until the Tari feasibility gate passes.
                </p>
                <div className="callout">
                  A chain inclusion receipt is not payment evidence. Rewards are discretionary.
                </div>
              </aside>
            </div>
          ) : (
            <Empty
              title="No reward has been selected."
              text="Open a sample envelope in the curator inbox, then prepare a reward quote."
              action="Visit curator inbox"
              onClick={() => go('inbox')}
            />
          ))}

        {route === 'privacy' && (
          <>
            <div className="privacy-intro">
              <p>Same letter. Three different views.</p>
              <h2>
                A seal is a boundary,
                <br />
                not a promise of anonymity.
              </h2>
              <p className="muted">
                All records below are synthetic. App encryption and native payment privacy are
                separate capabilities; neither is implemented by this mock.
              </p>
            </div>
            <section className="visibility-grid">
              {[
                {
                  title: 'Public observer',
                  icon: 'eye' as const,
                  kind: 'public',
                  lead: 'The outside of the envelope.',
                  rows: [
                    ['Story text', 'Hidden in the planned live app'],
                    [
                      'Envelope digest',
                      envelope?.digest || 'Visible · sample digest after sealing',
                    ],
                    ['Payout address / amount', 'Not in public receipts'],
                    ['Fees & transaction structure', 'Visible / inferable'],
                  ],
                  detail:
                    'One-time output keys and signatures are public. Timing and graph analysis can still link activity.',
                },
                {
                  title: 'Curator',
                  icon: 'key' as const,
                  kind: 'curator',
                  lead: 'The person holding the key.',
                  rows: [
                    ['Story text', 'Decryptable on arrival'],
                    ['Payout address', 'Inside the opened envelope'],
                    ['Selected reward', 'Known to the curator'],
                    ['Room key', 'Browser-held in the planned live app'],
                  ],
                  detail:
                    'The curator can share what they read. Closing a room does not release a time lock.',
                },
                {
                  title: 'App / reward operator',
                  icon: 'lock' as const,
                  kind: 'operator',
                  lead: 'The service and wallet operator.',
                  rows: [
                    ['Story text', 'Encrypted storage in the planned live app'],
                    ['Selected payout details', 'Recipient and amount disclosed to wallet'],
                    ['Wallet funds', 'Operator-custodied testnet funds'],
                    ['Network metadata', 'Infrastructure can observe IP and timing'],
                  ],
                  detail:
                    'A malicious operator could serve modified JavaScript. Browser encryption cannot prevent that attack.',
                },
              ].map((view) => (
                <article className={`panel visibility ${view.kind}`} key={view.title}>
                  <Icon name={view.icon} size={28} />
                  <h3>{view.title}</h3>
                  <p className="muted">{view.lead}</p>
                  <dl>
                    {view.rows.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="field-help">{view.detail}</p>
                </article>
              ))}
            </section>
            <div className="panel public-bytes">
              <p className="eyebrow">PUBLIC REPRESENTATION · SYNTHETIC RECORD</p>
              <pre>
                {JSON.stringify(
                  {
                    fixture: true,
                    room: 'mock-room-the-last-letter',
                    submission_id: envelope?.id || 'mock-envelope-example',
                    envelope_digest: envelope?.digest || 'sample-digest-not-live',
                    inclusion: envelope?.anchor || 'no-sample-sealed',
                    payment_proof: false,
                  },
                  null,
                  2,
                )}
              </pre>
              <p className="muted">
                No plaintext, payout address, amount, or reward transaction link belongs in a public
                receipt.
              </p>
            </div>
          </>
        )}

        {route === 'recovery' && (
          <div className="work-grid">
            <section className="panel">
              <p className="eyebrow">RECOVERY & OUTAGE REHEARSAL</p>
              <h2>
                Keep the letter.
                <br />
                Check before trying again.
              </h2>
              <div className="recovery-list">
                <article>
                  <h3>Lost curator key</h3>
                  <p>
                    Import the encrypted recovery file with its separate recovery code in a clean
                    browser. Login reset cannot recover a room key. Without both recovery materials,
                    the stories remain unreadable.
                  </p>
                </article>
                <article>
                  <h3>Network or receipt delayed</h3>
                  <p>
                    Preserve the encrypted envelope and downloaded receipt. Check the existing
                    inclusion before submitting again. A digest cannot recover missing ciphertext.
                  </p>
                </article>
                <article>
                  <h3>Wallet unavailable</h3>
                  <p>
                    Pause rewards. Restore the wallet and verify its network and private spendable
                    inputs before preparing a new quote.
                  </p>
                </article>
                <article>
                  <h3>Unknown payment outcome</h3>
                  <p>
                    Freeze the intent. Query authoritative wallet and indexer history. Reconcile the
                    committed outcome or request operator resolution. Never blindly retry a funds
                    transfer.
                  </p>
                </article>
              </div>
            </section>
            <aside className="panel">
              <p className="eyebrow">TRY AN ERROR STATE</p>
              <h3>Rehearse the unexpected.</h3>
              <p>
                Choose a fixture condition, then return to the relevant action. No real services are
                contacted.
              </p>
              <label htmlFor="scenario">Demo condition</label>
              <select
                id="scenario"
                value={scenario}
                disabled={busy}
                onChange={(event) => {
                  setScenario(event.target.value as Scenario);
                  setNotice('Demo condition updated.');
                }}
              >
                <option value="healthy">Healthy demo</option>
                <option value="network-down">Network unavailable</option>
                <option value="delayed">Delayed inclusion receipt</option>
                <option value="wallet-down">Reward wallet unavailable</option>
                <option value="unknown">Unknown reward outcome</option>
                <option value="unreadable">Unreadable envelope</option>
                <option value="lost-key">Lost curator key</option>
              </select>
              <div className="stacked-actions">
                <button className="secondary" onClick={() => go('desk')}>
                  Return to submission desk
                </button>
                <button className="secondary" onClick={() => go('receipt')}>
                  Check existing receipt
                </button>
                <button className="secondary" onClick={() => go('inbox')}>
                  Return to curator inbox
                </button>
              </div>
              <div className="callout">
                Active condition: <strong>{scenario}</strong>. Reset fixtures to start a fresh
                journey.
              </div>
            </aside>
          </div>
        )}
      </main>
      <footer>
        <div>
          <span className="footer-brand">hauntbox.</span>
          <p>A little darkness. A little discretion.</p>
        </div>
        <div className="footer-actions">
          <a href="#recovery">Recovery & status</a>
          <button className="text-button" disabled={busy} onClick={reset}>
            Reset fixtures
          </button>
          <span>OCTOBER 2026 · MOCK PROTOTYPE</span>
        </div>
      </footer>
    </>
  );
}
function Empty({
  title,
  text,
  action,
  onClick,
}: {
  title: string;
  text: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <section className="panel empty-state">
      <Icon name="letter" size={38} />
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="primary" onClick={onClick}>
        {action}
        <Icon name="arrow" />
      </button>
    </section>
  );
}
