# M1 screen and adapter inventory

| Route | Purpose | States / reusable interaction |
|---|---|---|
| `#entrance` | The Last Letter room | Enter desk; launch one-click synthetic guided tour |
| `#desk` | Submission form | Empty, UTF-8 oversized, unsupported recipient, sealing, network unavailable |
| `#receipt` | Inclusion receipt | No envelope, pending, unavailable, simulated inclusion, exact fixture-byte export |
| `#inbox` | Fictitious curator | Empty, locked, unlocked, unreadable/missing key, opened, locked again, address absent, selected reward |
| `#reward` | Quote and outcome | No quote, deliberate consent, declined, submitting, pending, simulated committed result, unknown |
| `#privacy` | Visibility boundary | Public fingerprint, curator disclosure, operator/custody and metadata limits |
| `#recovery` | Recovery instructions and rehearsal | Seven selectable fixture conditions; link back to the affected flow |

`apps/web/src/domain.ts` owns the typed adapter, drafts, envelopes, quotes, scenarios, validation, and deterministic mock implementation. `App.tsx` owns the current session and routes. CSS tokens and responsive rules live in `styles.css`. Use this M1 interaction model for later adapters, but freeze validated live API/envelope types only after M2; a mock `syntheticEnvelope` is intentionally not JWE.

Primary styles: ink/plum surfaces, parchment text, candle amber actions, mint status, serif headings, self-hosted DM Sans controls and Cormorant Garamond headings. The envelope/wax decoration uses CSS and inline SVG, with no external image/font request. Reduced motion disables transitions and the envelope animation.

Future integration must add authenticated curator sessions, verified room keys, real JWE sealing and recovery, durable status lookup and receipt preservation, expiring fee-bound quote confirmation, authoritative reconciliation, and independently evidenced receiver detection/spend. Keep fixture mode separate and visible throughout.
