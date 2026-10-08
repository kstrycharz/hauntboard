# Hauntboard frontend and UX recommendations

Prepared October 7, 2026. Scope: the current Hauntboard frontend in `hauntboard/web/`.

## Design direction

Make Hauntboard feel like a readable conversation space with a clear path from browsing to publishing. Keep the forest-green palette, warm serif headings, restrained gold accents and haunted-library character. Put the conversation and the next useful action ahead of network mechanics.

The highest-value changes are to simplify wallet setup, make publishing status persistent, reduce the space above the feed, and explain publishing consequences at the moment of review. These are usability recommendations, not a request to replace the frontend framework or redesign the contracts.

## Review basis and limits

This is a source-based review of `hauntboard/web/index.html`, `app.mjs`, `style.css`, and `mobile.css`, informed by `hauntboard/DELIVERY_PLAN.md` and the repository instructions. The legacy React application under `apps/web/` is not the target.

The current delivery plan takes precedence over older README descriptions: V1 centers on public threads and replies, participant browser wallets, native stealth fee posting, and recovery. Sealed threads and tips are preserved demo functionality, outside the V1 shipping path. The runtime already hides several demo controls when `posterPrivacy` is enabled; recommendations below acknowledge that behavior.

No live browser session, visual contrast measurement, screen-reader audit or user trial was performed for this document. Layout observations are inferred from the HTML/CSS. Prior engineering evidence in the delivery plan is not new validation from this review. Public posting privacy verification and release acceptance remain separate gates.

## What to preserve

- **A recognizable visual identity.** The palette and serif/sans pairing fit the product and make it distinct without requiring large illustrations.
- **Reading without wallet setup.** Visitors should understand the board before being asked to create or unlock a wallet.
- **Review before signing.** The existing review explains permanent public content and displays a fee before confirmation.
- **Recoverable operations.** `transactionPending`, `finishTransaction()` and startup reconciliation already preserve operation identity. Improve their presentation rather than replacing them with generic retries.
- **Privacy-aware draft handling.** Public drafts use session storage; sealed drafts deliberately avoid that plaintext persistence. Preserve this distinction.
- **Existing accessibility foundations.** Native dialogs, explicit form labels, focus-visible styles, live status messages and mobile 44px button targets provide a useful starting point.
- **Local hiding.** Thread visibility is controlled locally. Preserve this useful behavior and explain that it does not delete chain content.

## Prioritized recommendation register

P0 means resolve before calling the public posting experience ready. P1 means address in the next usability pass. P2 means polish after the primary flows are validated. Effort is relative: S = a focused copy/style/component change; M = a flow or state change; L = work spanning frontend and supporting APIs. These are not time estimates.

| ID | Priority / effort | Observed implementation | Recommended change and user benefit | Acceptance condition |
|---|---|---|---|---|
| GUI-01 | P0 / M | `init()` changes labels and hides features by profile, while the initial HTML contains localnet, demo-wallet and sealed-thread copy. | Render a coherent profile-aware shell before enabling actions. Always show the actual network, wallet readiness and beta status together. Avoid briefly promising unavailable features. | Public V1 shows no demo-wallet, sealed-thread or tipping affordances, including during loading and initialization failure. Local demo features remain available in that profile. |
| GUI-02 | P0 / M | The browser-wallet dialog holds creation, unlock, recovery, seed backup, funding and diagnostics in one surface. | Split it into explicit Create, Recover and Unlock flows with one primary action per step. Return to the interrupted post afterward. | A first-time participant can create, back up, fund and return to their draft without interpreting account indexes or transaction IDs. |
| GUI-03 | P0 / M | Pending operations persist, but their presentation relies heavily on `flash()`. Opening a dialog or thread clears flash messages. | Add a persistent operation panel tied to the existing operation identity. Distinguish preparing, awaiting signature, submitted, confirmed, rejected and unknown outcome. | Closing a dialog or reloading cannot hide a pending operation; checking status never creates a replacement submission. |
| GUI-04 | P0 / M | Review shows network, signing wallet, fee and content mode; public permanence is explained, but the content itself is not presented as a full review preview. | Show the exact title/body being authorized, network and fee semantics with a clear Back to edit action. Label the final action “Publish public post” or “Publish reply.” | Editing invalidates the old review/quote. Displayed copy and fee match the operation being authorized; public permanence is visible before signing. |
| GUI-05 | P1 / S | Wallet status combines total, ready funds, incoming outputs, held change and pending values in a paragraph. | Lead with “Available for posting.” Put reserved funds, held change and scanning details below it. Explain why a positive total can still be unavailable. | A user can tell whether posting is possible and which action can resolve a blocked state. Never imply held change is spendable. |
| GUI-06 | P1 / M | The large hero and navigation remain outside the board/thread visibility switch. | Use a compact board header and a smaller thread-reading header. Keep the large brand introduction on an optional first-visit/About surface. | At agreed desktop/mobile test sizes, the first thread or post appears without scrolling past the full marketing introduction. |
| GUI-07 | P1 / S | Desktop text includes 8–12px metadata, notices, labels and controls. Mobile CSS already increases many sizes. | Adopt a readable type scale across desktop and mobile; increase notice and form-copy size first. | Essential instructions remain readable at normal zoom and usable at 200% zoom; labels do not clip or disappear. |
| GUI-08 | P1 / M | `refreshBoard()` loads thread details in batches of four and renders the list after all batches complete. | Show the board shell immediately, preserve existing rows during refresh and populate available rows progressively. Add individual retry controls for unavailable threads. | One slow thread does not delay every readable thread; refresh failure retains previously loaded content with a stale-state notice. |
| GUI-09 | P1 / M | Thread navigation uses `history.replaceState()`; post parents appear as `>>N`, and replies render newest first. | Add normal navigable thread links, Back/Forward handling, a labeled reply order and parent-post jump links. Restore the feed position on return. | Browser Back returns to the prior feed/filter position; following a parent reference moves focus to the correct post or loads its page first. |
| GUI-10 | P1 / S | Filter selection is expressed with an `.active` class; dialogs lack explicit `aria-labelledby` in the reviewed markup. | Expose filter state with `aria-pressed`, name every dialog, and deliberately manage focus after navigation and validation errors. | Keyboard and screen-reader users can identify the active filter, dialog purpose and the field that needs correction. |
| GUI-11 | P1 / S | Hide is an × control, and thread rows contain both a reply count and an additional unlabeled post count. | Use a labeled overflow action for “Hide on this device,” offer Undo, and show one clearly labeled count. | Hiding is understood as local filtering, can be undone immediately, and is not mistaken for deletion. |
| GUI-12 | P2 / S | CSS contains overlapping responsive rules; HTML, presentation and state behavior are densely expressed. | Consolidate styles around shared tokens and small UI responsibilities while preserving current behavior. | Each component has one documented responsive behavior; there are no conflicting style overrides for the same state. |

## Proposed information architecture

### Desktop

Keep the sidebar focused on Board, Wallet and About. Put provider selection and raw chain inspection under Advanced. Include Secret keys only in the demo profile that supports sealed threads.

The content header should show the board name, a one-line description, network badge and compact wallet status. Place “Start a thread” beside the feed controls. On thread pages, show a breadcrumb, title, content visibility and reply count before the opening post.

```text
Sidebar             Board header                          Wallet: locked
Board               The Crypt                 Esmeralda testnet · beta
Wallet              Public conversations stored on Tari
About
                    All threads                 [Start a thread]
Advanced            Updated just now                  [Refresh]
                    --------------------------------------------------
                    Thread title
                    Two-line preview · Public · 8 replies       [More]
                    --------------------------------------------------
                    [Persistent publishing status, when applicable]
```

This is a layout proposal, not a screenshot of the running application. Render only filters supported by the active profile; public-only V1 does not need redundant All/Public filters.

### Mobile

The mobile stylesheet already restores text labels and touch targets; preserve those fixes. Replace the wrapping group of sidebar actions with a compact header containing the brand, Wallet and Menu. Keep board navigation and advanced tools in a keyboard-accessible drawer with focus restoration.

Use a single-column feed. Put “Start a thread” near the feed heading and keep its location stable. If a sticky compose action is introduced, verify it does not cover posts, errors or the software keyboard. Use the same primary action hierarchy on desktop and mobile.

For longer wallet/recovery flows, prefer a full-height mobile dialog with its own scroll area and a visible heading. Keep the primary action reachable without concealing fields. Respect safe-area insets on both sides and at the bottom.

## Primary journeys

### 1. Browse, then start a thread

Let visitors browse immediately. When they choose to post, assess wallet readiness and explain the next step in place: “Unlock your wallet to publish” or “Set up a wallet to pay the testnet posting fee.” Preserve the draft while the wallet flow is open and return to it on success.

Keep V1 composition short: title, opening post and review action. Do not expose display-name, sealed-mode or tip-address controls when unsupported. Show a remaining-space indicator based on the actual serialized payload allowance, not just textarea character count: Unicode and envelope overhead can make character limits misleading. Reuse the existing encoder/validation rules so the counter and submit validation agree.

Show “Draft saved for this tab” only after storage succeeds. In the sealed demo, explicitly state when the draft is not saved and guard against accidental dismissal without introducing plaintext persistence. Do not extend draft retention without deciding and disclosing its privacy implications.

### 2. Set up or recover a wallet

Offer two entry choices: **Create wallet** and **Recover with seed phrase**. When a wallet already exists, make **Unlock wallet** the primary action and recovery secondary.

Creation should have distinct steps: choose a device password, save the phrase, confirm backup, then obtain test funds when available. Use separate explanations for the device password and recovery phrase. A short selected-word confirmation is a proposed improvement over the current checkbox-only acknowledgement; it must remain local and must not prevent users from reviewing the phrase again.

Recovery should initially ask for the phrase and a new device password. Keep wallet format, account index and original seed passphrase in an Advanced recovery section. Keep the original receive address available with a plain explanation that it helps verify the recovered identity. Reveal advanced settings automatically when they are necessary to resolve an import problem; do not silently select a different identity.

Represent recovery success and scan completion separately: “Wallet recovered. Still checking for funds.” Offer “Continue syncing” when scanning is incomplete. A zero result from an incomplete scan must not read as a confirmed empty wallet.

Keep wallet phrase recovery distinct from sealed-thread key backup. If both exist in the demo, name them “Wallet recovery phrase” and “Sealed-thread key backup.” Do not imply that a wallet phrase restores independent conversation keys.

### 3. Review, publish and recover an interrupted operation

Use a visible sequence: **Write → Review → Publishing → Confirmed**. During review, show the exact content, network, wallet/signing mode and fee. Preserve the distinction between a maximum fee and an amount that will actually be consumed: the native stealth fee path currently explains that its shown safety buffer is not refunded. Use wording specific to the active quote, not one generic “maximum fee” label for every path.

| Operation state | Suggested message | Available action |
|---|---|---|
| Preparing | Checking your post and estimating its fee… | Return to draft when safe; do not claim submission |
| Awaiting authorization | Review your public post and network fee. | Publish / Back to edit |
| Submitted | Your post was submitted. Waiting for confirmation… | View status |
| Unknown outcome | We could not confirm the result yet. Your submission is being checked. | Check existing submission |
| Rejected | The network did not accept this post. Your draft is available to edit. | Return to draft; explain fee outcome if known |
| Confirmed | Your post is on Tari. | View post |
| Confirmed, view unavailable | Your post was accepted, but this provider has not returned it yet. | Refresh the view; do not republish |

Only show states the existing operation/chain evidence can support. Distinguishing confirmed-but-not-indexed may require state/API changes. Never convert an ambiguous outcome to a generic failure with a fresh Publish action. Never claim the user was not charged without confirming that fact.

### 4. Read and reply

Give the opening post clear emphasis, then label the reply order. Prefer oldest-first for conversational continuity or offer an explicit newest/oldest control; preserve post numbers and identity regardless of sorting. Show the quoted parent excerpt above a targeted reply and provide “Cancel reply to this post.”

Move component addresses, byte counts, signer fields and chain epochs into Details. Keep meaningful visibility and pending-state labels visible. Do not convert epochs into invented timestamps; show actual publication times only if supported by reliable data.

When loading older posts, retain scroll position and focus. For a full thread, provide a continuation action with an explicit reference to the original thread, subject to available contract capacity. Show a useful full-board state too; do not let users compose indefinitely only to discover publication is impossible at review.

## Visual system

Retain the existing palette as the starting point: background `#111714`, panel `#18201a`, primary text `#e7e5d4`, muted text `#a2ad9b`, action green `#c8df93` and gold `#dcc889`. These values have not been certified for every contrast pairing in this review.

| Element | Proposed target | Purpose |
|---|---|---|
| Reading text | 16px with about 1.65 line height; 60–75 characters per line | Make long posts comfortable to read |
| Form labels and controls | 14–16px; mobile text inputs at least 16px | Reduce squinting and keep forms consistent |
| Secondary metadata | 12–14px; never the only place essential instructions appear | Preserve hierarchy without hiding meaning |
| Thread titles | 24–32px serif, responsive to available width | Keep the editorial character |
| Display heading | 36–48px on introduction surfaces only | Avoid pushing everyday tasks below the fold |
| Spacing | 4, 8, 12, 16, 24, 32, 48px tokens | Make layouts consistent and easier to maintain |
| Controls | 44px minimum target as a product design target | Support touch and imprecise pointing |
| Focus | Clearly visible outline on every interactive control | Support keyboard navigation |

Use green for the primary action and successful states; use gold for cautions and sealed/demo context; give failures a distinct icon and text as well as color. Avoid making every operational notice visually resemble success. Reserve one filled primary button for the main action in each task surface.

## Copy changes

| Current label or pattern | Proposed copy | Rationale |
|---|---|---|
| Sync from chain | Refresh threads / Refresh conversation | Names the result of the action |
| Open a door. | Start a thread | Keeps the task unambiguous; atmospheric copy can remain underneath |
| Confirm & sign | Publish public post / Publish reply | States the consequence of authorization |
| Browser wallet | Wallet | Simplifies navigation; explain browser custody inside the flow |
| Reconcile faucet request | Check funding status | Makes the existing recovery operation understandable |
| × with Hide thread accessible name | Hide on this device | Explains scope and avoids a deletion metaphor |
| epoch N / component address in the reading header | Details | Preserves inspectability without competing with the conversation |
| Generic “Working locally…” | Creating wallet… / Recovering wallet… / Checking funds… | Communicates which operation is underway |

Keep precise, short disclosure near publication: “Public posts cannot be edited or deleted through Hauntboard. Testnet resets may remove history.” Preserve network-specific truth and current backend limits. Avoid claiming anonymity, guaranteed permanence, unlinkable activity or verified public readiness.

## Accessibility and responsive verification

These are proposed acceptance checks, not a completed compliance audit.

- Add a skip link, semantic navigation labels and dialog names via `aria-labelledby` pointing to unique headings.
- Use `aria-pressed` for simple filter buttons, or implement the complete keyboard behavior if choosing an actual tab pattern.
- Return focus to the opening control after closing dialogs. On thread navigation, focus the thread heading. On validation failure, focus the first invalid field and connect its message with `aria-describedby`.
- Keep live status announcements concise. Announce state transitions, not repeated polling responses or every balance update. Use urgent error announcements selectively.
- Test keyboard-only create/recover/review flows, including Escape behavior, focus containment and password visibility controls if added.
- Measure contrast for text, muted labels, placeholders, borders and focus indicators in normal, hover, disabled and error states. Do not infer contrast compliance from the palette alone.
- Check widths of 320, 390, 768, 1024 and 1440px, 200% zoom, long titles, long addresses, multilingual text and an open mobile keyboard. Require no horizontal page scrolling for ordinary content.
- Preserve text labels for visibility and connection states; icons and colors alone are insufficient. If motion is added, respect reduced-motion preferences.

## Implementation sequence

1. **Make the public experience coherent:** implement GUI-01 through GUI-04, including initialization failure and interrupted submission states. Keep release capability gates authoritative.
2. **Make reading and posting comfortable:** simplify the header, improve typography, clarify wallet balances and implement useful inline validation.
3. **Improve navigation and loading:** add progressive feed rendering, stateful Back/Forward behavior, reply anchors and local-hide Undo.
4. **Consolidate presentation:** extract reusable styles and view functions for wallet steps, review, operation status and empty/error states. The existing vanilla frontend can support this; no framework migration is required.
5. **Validate with people:** run the delivery plan's outstanding user trials and mobile trial before declaring the UX complete.

Likely implementation locations are `hauntboard/web/index.html` for semantic structure, `app.mjs` for navigation and operation presentation, and `style.css`/`mobile.css` for the visual system. Keep wallet cryptography and operation reconciliation semantics in their existing modules; frontend cleanup must not weaken those boundaries.

## Validation plan and success measures

Use three participants unfamiliar with the tool, each on fresh test state and approved local test funds. Ask them to read a thread, create a wallet, explain what restores it, publish a public post, recover from an interrupted response and find their reply. Include a real mobile-browser session, rather than only a resized desktop viewport.

Proposed targets: all three distinguish device password from recovery phrase; all three understand that publication makes text public; all three find their confirmed post without facilitator guidance; and none attempts a duplicate submission after an unknown outcome. Record where assistance was needed and time to first successful post as a baseline, not as a fabricated improvement claim.

Engineering checks should exercise state transitions and user outcomes: profile-specific controls, preserved drafts, fee review invalidation, keyboard navigation, pending reload/reconciliation, incomplete scans, unavailable providers and thread capacity. Reuse existing container-based browser tests and local fixtures. This documentation task does not authorize public posts or spending.

Collect usability observations without recording recovery phrases, passwords, sealed text, invitation URLs or wallet identifiers. Any future analytics proposal should specify minimal events and retention separately; adding third-party analytics is not necessary to implement these recommendations.

## Recommended first work package

Implement a compact profile-aware header, a three-entry wallet flow (Create / Recover / Unlock), an exact-content publishing review and a persistent submission status panel. This package addresses the largest comprehension and recovery risks while preserving the product's visual character and existing transaction protections.

## Implementation status — October 7, 2026

The edited plan is implemented in Hauntboard and deployed as image 0.6.4-gui (including the missing transaction WASM repair, PIN/reset controls and coordinated forums). [Implementation and deployment evidence](hauntboard/evidence/gui-implementation.md) records the changes, immutable image, rollback path and Chromium/Firefox checks. Persistent publishing status, wallet steps, exact review, profile-aware controls, progressive feed, navigation and accessibility improvements are in the local frontend source. Automated checks passed; the three-participant usability trial and a physical mobile-browser session remain open. UX-01 stays in progress until those acceptance checks are recorded.


October 7 follow-up: six-digit PIN/keypad setup, legacy password migration and confirmed browser-wallet deletion/replacement are implemented in coordinated release 0.6.4-gui. See [wallet PIN/reset evidence](hauntboard/evidence/wallet-pin-reset.md).

