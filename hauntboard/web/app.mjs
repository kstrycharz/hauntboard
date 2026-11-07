import {
  randomId,
  newThreadKey,
  encodePost,
  decodePost,
  saveKey,
  loadKey,
  deleteKey,
  exportKeys,
  importKeys,
  unbase64,
  postSpace,
} from "./crypto.mjs";
import * as browserWallet from "./browser-wallet.mjs";
import { setupWalletOptions } from './wallet-options.mjs';
import {fundsReadiness, POSTING_FEE_LIMIT} from './posting-readiness.mjs';
import { PinEntry } from "./pin-entry.mjs";
import { createApiClient } from "./api-client.mjs";
import { FaucetClient, FaucetCredit, faucetMessage } from "./faucet-client.mjs";
import {createRoomManager} from './room-manager.mjs';
import { chainStateLink, postProof } from "./post-proof.mjs";
import {
  isSealedPayload,
  sealedMetadata,
  sealedThread,
  sealedSpace,
  sealPost,
  openSealedPost,
  invitationUrl,
} from "./sealed-posts.mjs";
const $ = (id) => document.getElementById(id);
const roomManager=createRoomManager({api:(...args)=>api(...args),review,cancelReview:invalidateReview,legacyKey:keyFor,refresh:async()=>{if(currentThread)await renderThread(currentThread);},openDialog:dialog,pending:()=>Boolean(transactionPending),checkOperation:reconcilePending,unlockWallet:async()=>{$('room-dialog').close();await openWallet();}});
let config,
  board,
  currentThread,
  filter = "all",
  showHidden = false,
  quote,
  publishContext,
  busy = false;
let postIntentBusy = false, postingRevision = 0;
const postingIntents = new Map();
let threadRows = [];
let threadRenderGeneration=0;
const categories = {
  tari: {
    title: "/tari/ · Tari",
    description: "Tari, Ootle, wallets, mining and building on the network.",
  },
  general: {
    title: "/general/ · General",
    description:
      "Everyday conversations, questions and whatever is on your mind.",
  },
  pol: {
    title: "/pol/ · Politics",
    description: "Politics, current affairs and public debate.",
  },
};
const categoryOf = (content) =>
  Object.hasOwn(categories, content?.category) ? content.category : "general";
let category = Object.hasOwn(
  categories,
  new URL(location.href).searchParams.get("category"),
)
  ? new URL(location.href).searchParams.get("category")
  : "general";
function selectCategory(value) {
  category = Object.hasOwn(categories, value) ? value : "general";
  $("board-title").textContent = categories[category].title;
  $("board-description").textContent = categories[category].description;
  document.querySelectorAll("[data-category]").forEach((button) => {
    const selected = button.dataset.category === category;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  renderRows();
}
const keys = new Map();
function readStorage(storage, key, fallback) {
  try {
    return JSON.parse(storage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
const hidden = new Set(readStorage(localStorage, "hauntboard-hidden", []));
const savedLocators = new Set(
  readStorage(localStorage, "hauntboard-secret-locators", []),
);
let boardAddress = new URL(location.href).searchParams.get("board");
let transactionPending = readStorage(localStorage, "hauntboard-pending", null);
let feedGeneration = 0,
  navigationGeneration = 0,
  feedLoading = true,
  feedError = false,
  walletReturn = null,
  walletStep = "entry",
  seedCheck = null,
  scanIncomplete = false;
let walletUnlockMethod = "pin";
let recoveryPlan = null, walletDialogGeneration = 0, lastWalletBalance = null, lastWalletIdentity = null;
const walletActions = new Map();
const pinEntry = new PinEntry({
  dialog: $("browser-wallet-dialog"), input: $("wallet-password"), label: $("wallet-password-label"),
  dots: $("wallet-pin-dots"), status: $("wallet-pin-status"), keypad: $("wallet-keypad"), back: $("wallet-pin-back"),
  onPhase(phase, purpose) {
    $("wallet-step").textContent = phase === "confirm" ? "CONFIRM PIN" : phase === "create" ? "CREATE PIN" : "UNLOCK ON THIS BROWSER";
    if (["create", "change-pin", "recover-pin"].includes(purpose))
      $("browser-wallet-title").textContent = phase === "confirm" ? "Confirm your PIN" : purpose === "change-pin" ? "Choose a new PIN" : "Create a PIN";
  },
  async onComplete(pin, purpose) {
    if (purpose === "recover-pin") {
      recoveryPlan.pin = pin;
      setWalletStep("recover-review");
      $("wallet-restore").focus();
      return;
    }
    await walletActions.get({ create: "wallet-create", unlock: "wallet-unlock", "change-pin": "wallet-save-pin", "show-phrase": "wallet-show-seed" }[purpose])(pin);
  },
});
let reconciliationRunning = false;
let feedSnapshot = null;
const dialogOpeners = new Map();
const component = /^component_[a-f0-9]{64}$/;
const number = (value) => Number(BigInt(value)) / 1000000;
const units = (value) =>
  `${number(value).toLocaleString(undefined, { maximumFractionDigits: 6 })} test TARI`;
function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}
function button(text, className, action) {
  const b = node("button", className, text);
  b.type = "button";
  b.addEventListener("click", action);
  return b;
}
function flash(message, isError = false) {
  const el = $("flash");
  el.hidden = false;
  el.textContent = message;
  el.classList.toggle("error", isError);
  const d = document.querySelector("dialog[open]");
  if (d) {
    d.querySelector(".dialog-message")?.remove();
    const m = node(
      "div",
      `flash dialog-message${isError ? " error" : ""}`,
      message,
    );
    m.setAttribute("role", "status");
    d.append(m);
  }
}
function clearFlash() {
  $("flash").hidden = true;
  document.querySelectorAll(".dialog-message").forEach((n) => n.remove());
}
const api = createApiClient({getConfig: () => config});
const faucetClient = new FaucetClient({api});
const faucetCredit = new FaucetCredit();
const walletOptions = setupWalletOptions({
  document, getConfig: () => config, pending: () => Boolean(transactionPending),
  selectionChanged: connection => { invalidateReview(); if (connection) { $('identity').textContent = 'Sapient connected'; showPostingWallet(); } else if (config) walletView().catch(() => {}); },
  connected: () => { $('browser-wallet-dialog').close(); if (walletReturn) resumeWalletTask(); else flash('Sapient connected. You can now create a post or reply.'); },
  useBrowserWallet: () => {
    $("sapient-options").open = false;
    const target = !$("wallet-password-panel").hidden ? $("wallet-password")
      : !$("wallet-entry").hidden && !$("wallet-create-choice").hidden ? $("wallet-create-choice")
      : $("browser-wallet-title");
    target.focus({ preventScroll: true });
  },
});
function dialog(id) {
  clearFlash();
  if ($(id).open) return;
  dialogOpeners.set(id, document.activeElement);
  $(id).showModal();
}
function operationState(state, message) {
  $("operation-panel").hidden = false;
  $("operation-panel").dataset.state = state;
  const titles = {
    preparing: "Preparing your post",
    review: "Ready to publish",
    submitted: "Waiting for Tari",
    unknown: "Submission needs checking",
    confirmed: "Confirmed on Tari",
    rejected: "Submission stopped",
    indexing: "Confirmed · waiting for the view",
  };
  $("operation-title").textContent = titles[state] ?? "Publishing status";
  if ($("operation-message").textContent !== message)
    $("operation-message").textContent = message;
  $("check-operation").hidden =
    !transactionPending || busy || reconciliationRunning;
  $("view-operation").hidden = state !== "confirmed" || !currentThread;
  if (state === "confirmed" && currentThread)
    $("view-operation").href = `/?board=${boardAddress}&category=${category}&thread=${currentThread.address}`;
}
function operationError(error) {
  operationState(
    transactionPending?.accepted
      ? "indexing"
      : transactionPending
        ? "unknown"
        : "rejected",
    transactionPending?.accepted
      ? "Your post was accepted. Refresh its view; do not republish."
      : transactionPending
        ? "We could not confirm the result yet. Check the existing submission before posting again."
        : error.message,
  );
  flash(error.message, true);
}
async function reconcilePending() {
  if (!transactionPending || busy || reconciliationRunning) return;
  reconciliationRunning = true;
  $("check-operation").hidden = true;
  try {
    const pending = { ...transactionPending };
    if (pending.keyLocator) pending.key = await keyFor(pending.keyLocator);
    operationState(
      pending.accepted ? "indexing" : "submitted",
      "Checking your existing submission…",
    );
    await finishTransaction(pending);
  } catch (error) {
    operationError(error);
  } finally {
    reconciliationRunning = false;
    $("check-operation").hidden = !transactionPending;
  }
}
function rememberFeed() {
  if (!currentThread) {
    feedSnapshot = { board: boardAddress, category, filter, showHidden, scroll: scrollY };
    history.replaceState(feedSnapshot, "", location.href);
  }
}
function routeTo(thread, replace = false) {
  const url = `/?board=${boardAddress}&category=${category}${thread ? `&thread=${thread}` : ""}`;
  if (replace || url === location.pathname + location.search) return;
  history.pushState({}, "", url);
}
function setFilter(value) {
  filter = value;
  document.querySelectorAll("[data-filter]").forEach((b) => {
    b.classList.toggle("active", b.dataset.filter === filter);
    b.setAttribute("aria-pressed", String(b.dataset.filter === filter));
  });
}
function toggleMenu(expanded) {
  document.querySelector(".sidebar").dataset.expanded = String(expanded);
  $("menu-button").setAttribute("aria-expanded", String(expanded));
}
$("menu-button").addEventListener("click", () =>
  toggleMenu($("menu-button").getAttribute("aria-expanded") !== "true"),
);
document.querySelector(".sidebar").addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    toggleMenu(false);
    $("menu-button").focus();
  }
});
document.querySelectorAll("dialog").forEach((d) =>
  d.addEventListener("close", () => {
    const opener = dialogOpeners.get(d.id);
    if (opener?.isConnected && !document.querySelector("dialog[open]"))
      opener.focus({ preventScroll: true });
  }),
);
function requestComposeClose() {
  if (
    document.querySelector("input[name=mode]:checked").value === "1" &&
    ($("thread-title").value || $("thread-body").value) &&
    !transactionPending
  ) {
    $("discard-secret").hidden = false;
    $("keep-draft").focus();
    return;
  }
  $("compose-dialog").close();
}
$("compose-dialog").addEventListener("cancel", (e) => {
  e.preventDefault();
  requestComposeClose();
});
$("keep-draft").addEventListener("click", () => {
  $("discard-secret").hidden = true;
  $("thread-body").focus();
});
$("discard-draft").addEventListener("click", () => {
  $("compose-form").reset();
  $("discard-secret").hidden = true;
  $("compose-dialog").close();
});
$("check-operation").addEventListener("click", reconcilePending);
function info(title, paragraphs, eyebrow = "ABOUT THIS EXPERIMENT") {
  $("info-title").textContent = title;
  $("info-eyebrow").textContent = eyebrow;
  const root = $("info-content");
  root.replaceChildren();
  for (const p of paragraphs) root.append(node("p", "info-paragraph", p));
  dialog("info-dialog");
}
async function keepKey(thread, key) {
  if (!component.test(thread) || unbase64(key).length !== 32)
    throw new Error("Invalid secret invitation.");
  await saveKey(thread, key);
  keys.set(thread, key);
  savedLocators.add(thread);
  localStorage.setItem(
    "hauntboard-secret-locators",
    JSON.stringify([...savedLocators]),
  );
}
async function keyFor(thread) {
  if (!keys.has(thread)) {
    const key = await loadKey(thread);
    if (key) keys.set(thread, key);
  }
  return keys.get(thread);
}
async function acceptInvitation(threadAddress, boardAddress, key) {
  if (
    !component.test(threadAddress ?? "") ||
    !component.test(boardAddress ?? "")
  )
    throw new Error("Invalid invitation.");
  const thread = await api(`/api/thread?address=${threadAddress}`);
  if (thread.board !== boardAddress || !sealedThread(thread))
    throw new Error(
      "Invitation does not identify a sealed thread on this board.",
    );
  const opening = thread.posts.find((post) => post.index === 0);
  if (thread.schema === 4)
    await openSealedPost(
      opening.payload,
      key,
      config,
      postContext(thread, opening),
      thread.title,
    );
  else
    await decodePost(
      opening.payload,
      thread.mode,
      key,
      postContext(thread, opening),
    );
  await keepKey(threadAddress, key);
}
function postContext(thread, post) {
  return [thread.board, thread.uid, post.nonce, post.parent];
}
async function contentFor(thread, post) {
  if (thread.schema === 4 && sealedThread(thread)) {
    if (!isSealedPayload(post.payload))
      throw new Error(
        "Unencrypted message in a sealed conversation. Hidden to prevent a misleading privacy claim.",
      );
    return openSealedPost(
      post.payload,
      await roomManager.key(config,thread,post) ?? await keyFor(thread.address),
      config,
      postContext(thread, post),
      thread.title,
    );
  }
  return decodePost(
    post.payload,
    thread.mode,
    await keyFor(thread.address),
    postContext(thread, post),
  );
}
function persistHidden() {
  localStorage.setItem("hauntboard-hidden", JSON.stringify([...hidden]));
}
function invite(thread, key, base = location.origin) {
  return invitationUrl(thread, key, base);
}
function updateOtherClient() {
  const other =
    config.role === "sender"
      ? "http://localhost:8281"
      : "http://localhost:8280";
  const key = currentThread && !roomManager.managed(config,currentThread) ? keys.get(currentThread.address) : null;
  $("other-client").href = currentThread
    ? key
      ? invite(currentThread, key, other)
      : `${other}/?board=${currentThread.board}&thread=${currentThread.address}`
    : `${other}/?board=${boardAddress}`;
  $("other-client").textContent =
    config.role === "sender" ? "Open with Ghost B ↗" : "Open with Ghost A ↗";
}
async function refreshBoard() {
  const generation = ++feedGeneration,
    requestedBoard = boardAddress;
  $("refresh").disabled = true;
  feedLoading = true;
  feedError = false;
  $("thread-list").setAttribute("aria-busy", "true");
  try {
    const latest = await api(
      `/api/board?address=${encodeURIComponent(requestedBoard)}`,
    );
    if (generation !== feedGeneration || requestedBoard !== boardAddress)
      return;
    board = latest;
    const cached = new Map(threadRows.map((row) => [row.ref.address, row]));
    const refs = [...board.threads].reverse();
    threadRows = refs.map((ref) => ({
      ...cached.get(ref.address),
      ref,
      loading: true,
      error: null,
    }));
    renderRows();
    updateCapacity();
    // Workers populate each row as it arrives; a slow provider response does not gate a whole batch.
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, refs.length) }, async () => {
        while (next < refs.length) {
          const ref = refs[next++];
          const row = await retrieveRow(ref, requestedBoard);
          if (generation !== feedGeneration || requestedBoard !== boardAddress)
            return;
          const index = threadRows.findIndex(
            (r) => r.ref.address === ref.address,
          );
          if (index >= 0) {
            threadRows[index] = {
              ...threadRows[index],
              ...row,
              loading: false,
            };
            renderRows();
          }
        }
      }),
    );
    if (generation !== feedGeneration) return;
    $("sync-time").textContent =
      `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${threadRows.some((row) => row.error) ? " · Some threads unavailable" : ""}`;
    updateOtherClient();
  } catch (error) {
    if (generation === feedGeneration) {
      feedError = true;
      $("sync-time").textContent =
        "Refresh failed · previously loaded content may be out of date";
      flash(
        "Could not refresh this board. Previously loaded threads are still available.",
        true,
      );
    }
    throw error;
  } finally {
    if (generation === feedGeneration) {
      feedLoading = false;
      $("refresh").disabled = !config;
      $("thread-list").setAttribute("aria-busy", "false");
      renderRows();
    }
  }
}
async function retrieveRow(ref, expectedBoard) {
  try {
    const thread = await api(`/api/thread?address=${ref.address}`);
    if (thread.board !== expectedBoard)
      throw new Error("Thread belongs to another board.");
    let content;
    try {
      content = await contentFor(thread, thread.posts[0]);
    } catch {
      if (thread.schema === 4 && isSealedPayload(thread.posts[0]?.payload)) {
        const metadata = sealedMetadata(thread.posts[0].payload);
        content = {
          title: thread.title,
          category: metadata.category,
          body: "Encrypted message. Open an invitation to read.",
          locked: true,
        };
      }
    }
    return { ref, thread, content, error: null };
  } catch (error) {
    return { ref, error: error.message };
  }
}
function updateCapacity() {
  const full = Boolean(board && board.threads.length >= 128);
  $("board-capacity").hidden = !full;
  $("board-capacity").textContent =
    "This board is full. Open another compatible board to start a thread.";
  $("new-thread").disabled = !config || full;
  $("continue-thread").disabled = full;
}
function renderRows() {
  const root = $("thread-list");
  root.replaceChildren();
  $("thread-count").textContent = threadRows.filter(
    (row) => categoryOf(row.content) === category,
  ).length;
  const rows = threadRows.filter(
    ({ ref, content, thread }) =>
      categoryOf(content) === category &&
      (showHidden || !hidden.has(ref.address)) &&
      (filter === "all" ||
        (filter === "public" ? !sealedThread(thread) : sealedThread(thread))),
  );
  if (!rows.length) {
    if(feedError) {
      const unavailable=node('div','empty');
      unavailable.append(node('h3','','Conversations could not be loaded.'),node('p','','Try refreshing the conversations. Your draft is kept.'),button('Try again','subtle',()=>refreshBoard().catch(()=>{})));
      root.append(unavailable);return;
    }
    const loading = feedLoading || threadRows.some((row) => row.loading);
    const hasForumThreads = threadRows.some(
      (row) => categoryOf(row.content) === category,
    );
    const empty = node("div", "empty");
    empty.append(
      node(
        "h3",
        "",
        loading
          ? "Loading this forum…"
          : hasForumThreads
            ? "No threads match this view."
            : "No threads in this forum yet.",
      ),
    );
    empty.append(
      node(
        "p",
        "",
        loading
          ? "Retrieving conversations from the provider."
          : hasForumThreads
            ? "Try showing hidden threads or changing the filter."
            : `Start a conversation in ${categories[category].title}. Public posts are stored on Tari.`,
      ),
    );
    if (!loading && hasForumThreads) {
      empty.append(
        button("Show all threads in this forum", "subtle", () => {
          setFilter("all");
          showHidden = true;
          $("show-hidden").textContent = "Hide filtered threads";
          rememberFeed();
          renderRows();
        }),
      );
    } else if (!loading) {
      const start = button("Start a thread", "subtle", () => openCompose());
      start.disabled =
        !config || config.preview || board?.threads.length >= 128;
      empty.append(start);
    }
    root.append(empty);
    return;
  }
  for (const { ref, thread, content, error, loading } of rows) {
    const row = node("article", "thread-row");
    row.dataset.address = ref.address;
    row.append(
      node(
        "div",
        `thread-icon${sealedThread(thread) ? " secret" : ""}`,
        sealedThread(thread) ? "◇" : "✦",
      ),
    );
    const middle = node("div");
    const h = node("h3");
    const link = node("a", "thread-link", content?.title ?? ref.title);
    link.href = `/?board=${boardAddress}&category=${categoryOf(content)}&thread=${ref.address}`;
    link.addEventListener("click", (e) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)
        return;
      e.preventDefault();
      openThread(ref.address).catch((error) => flash(error.message, true));
    });
    h.append(link);
    middle.append(h);
    middle.append(
      node(
        "p",
        "thread-preview",
        content?.body.slice(0, 180) ??
          (loading
            ? "Loading conversation…"
            : error
              ? "This provider could not retrieve the conversation."
              : "A sealed conversation. An invitation key opens the door."),
      ),
    );
    const meta = node("div", "thread-meta");
    meta.append(node("span", "badge", categories[categoryOf(content)].title));
    const threadChainLink = node("a", "", "View thread on chain");
    threadChainLink.href = chainStateLink(config, ref.address);
    threadChainLink.target = "_blank";
    threadChainLink.rel = "noopener noreferrer";
    threadChainLink.setAttribute(
      "aria-label",
      `View ${content?.title ?? ref.title} on chain (opens a new tab)`,
    );
    meta.append(threadChainLink);
    meta.append(
      node(
        "span",
        `badge${sealedThread(thread) ? " sealed" : ""}`,
        sealedThread(thread)
          ? content && !content.locked
            ? "SEALED · OPENED"
            : "SEALED · LOCKED"
          : "PUBLIC",
      ),
    );
    if (!config.posterPrivacy)
      meta.append(node("span", "", content?.name ?? "Ghost"));
    meta.append(
      node(
        "span",
        "",
        thread
          ? `${Math.max(0, thread.postCount - 1)} replies`
          : loading
            ? "Loading replies…"
            : "Replies unavailable",
      ),
    );
    middle.append(meta);
    if (error) {
      middle.append(
        button("Retry this thread", "subtle", async () => {
          const expectedBoard = boardAddress;
          const result = await retrieveRow(ref, expectedBoard);
          if (expectedBoard !== boardAddress) return;
          const index = threadRows.findIndex(
            (r) => r.ref.address === ref.address,
          );
          if (index >= 0) {
            threadRows[index] = { ...threadRows[index], ...result };
            renderRows();
          }
        }),
      );
      middle.append(
        node("p", "small", "Previously loaded content may be out of date."),
      );
    }
    row.append(middle);
    const side = node("details", "row-side");
    const summary = node("summary", "", "More");
    summary.setAttribute(
      "aria-label",
      `More actions for ${content?.title ?? ref.title}`,
    );
    side.append(summary);
    side.append(
      button(
        hidden.has(ref.address) ? "Show on this device" : "Hide on this device",
        "text-button",
        () => {
          const wasHidden = hidden.has(ref.address);
          wasHidden ? hidden.delete(ref.address) : hidden.add(ref.address);
          persistHidden();
          renderRows();
          flash(
            wasHidden
              ? "Thread shown on this device."
              : "Thread hidden on this device. Its chain content has not changed.",
          );
          $("flash").append(
            button("Undo", "text-button", () => {
              wasHidden ? hidden.add(ref.address) : hidden.delete(ref.address);
              persistHidden();
              renderRows();
              flash("Visibility restored.");
            }),
          );
        },
      ),
    );
    row.append(side);
    root.append(row);
  }
}
async function openThread(address, { navigate = true, focus = true } = {}) {
  const generation = ++navigationGeneration;
  clearFlash();
  if (navigate) rememberFeed();
  const thread = await api(
    `/api/thread?address=${encodeURIComponent(address)}`,
  );
  if (generation !== navigationGeneration) return;
  const changed = currentThread?.address !== thread.address;
  currentThread = thread;
  boardAddress = thread.board;
  if (changed) {
    $("reply-body").value = !sealedThread(thread)
      ? readStorage(sessionStorage, `hauntboard-reply-${thread.address}`, "")
      : "";
    resetReplyTarget();
  }
  await renderThread(thread);
  if (navigate) routeTo(address);
  if (focus) {
    $("conversation-title").focus({ preventScroll: true });
    $("thread-view").scrollIntoView({ block: "start" });
  }
  return thread;
}
async function renderThread(thread) {
  const generation=++threadRenderGeneration;
  boardAddress = thread.board;
  const key = await roomManager.key(config,thread,thread.posts[0]).catch(()=>null) ?? await keyFor(thread.address);
  if(generation!==threadRenderGeneration)return;
  document.body.dataset.view = "thread";
  $("board-view").hidden = true;
  $("thread-view").hidden = false;
  const heading = $("thread-heading");
  heading.replaceChildren();
  let title = thread.title;
  try {
    const opening = await contentFor(thread, thread.posts[0]);
    title = opening.title;
    selectCategory(categoryOf(opening));
  } catch {
    if (thread.schema === 4 && isSealedPayload(thread.posts[0]?.payload)) {
      try { selectCategory(sealedMetadata(thread.posts[0].payload).category); } catch {}
    }
  }
  if(generation!==threadRenderGeneration)return;
  heading.append(
    node(
      "span",
      `badge${sealedThread(thread) ? " sealed" : ""}`,
      sealedThread(thread)
        ? thread.schema === 4
          ? "SEALED CONVERSATION · PUBLIC TITLE"
          : "SEALED CONVERSATION"
        : "PUBLIC CONVERSATION",
    ),
  );
  const titleNode = node("h2", "", title);
  titleNode.id = "conversation-title";
  titleNode.tabIndex = -1;
  heading.append(titleNode);
  heading.append(
    node("p", "muted", `${Math.max(0, thread.postCount - 1)} replies`),
  );
  const threadDetails = node("details");
  threadDetails.append(
    node("summary", "", "Conversation details"),
    node(
      "p",
      "small",
      `${thread.address} · ${thread.postCount} / ${thread.capacity} posts · chain version ${thread.version}`,
    ),
  );
  heading.append(threadDetails);
  const posts = $("posts");
  posts.replaceChildren();
  const direction = $("reply-order").value === "newest" ? -1 : 1;
  for (const post of [
    thread.posts[0],
    ...thread.posts.slice(1).sort((a, b) => direction * (a.index - b.index)),
  ]) {
    const article = node(
      "article",
      `post${post.index === 0 ? " opening" : ""}`,
    );
    article.dataset.post = post.index;
    article.id = `post-${post.index}`;
    article.tabIndex = -1;
    let content;
    try {
      content = await contentFor(thread, post);
    } catch (e) {
      article.classList.add("locked");
      article.append(node("p", "locked-copy", e.message));
    }
    if(generation!==threadRenderGeneration)return;
    const header = node("div", "post-header");
    if (!config.posterPrivacy)
      header.append(node("strong", "", content?.name || "Ghost"));
    header.append(
      node(
        "span",
        "",
        post.index === 0 ? "Opening post" : `Post ${post.index + 1}`,
      ),
    );
    if (post.parent !== null) {
      const parent = node("a", "", `In reply to post ${post.parent + 1}`);
      parent.href = `#post-${post.parent}`;
      parent.addEventListener("click", (e) => {
        e.preventDefault();
        jumpToPost(post.parent).catch((error) => flash(error.message, true));
      });
      header.append(parent);
    }
    article.prepend(header);
    if (content) article.append(node("p", "post-body", content.body));
    const footer = node("div", "post-footer");
    const details = node("details");
    details.append(
      node("summary", "", "Post details"),
      node(
        "p",
        "small",
        `Epoch ${post.epoch} · ${post.payload.length} on-chain bytes${post.author ? ` · Signer ${post.author}` : " · No author field"}`,
      ),
    );
    footer.append(details);
    const proof = postProof(config, thread, post);
    details.append(
      node(
        "p",
        "small chain-locator",
        `Stored in ${proof.address}. Post ${proof.postNumber}: page ${proof.pageNumber}, entry ${proof.slot + 1} (raw array index ${proof.slot}). The indexer reports verified chain state; this does not prove who wrote the post.`,
      ),
    );
    const proofLink = node("a", "text-button post-chain-link", "View on chain");
    proofLink.href = proof.href;
    proofLink.target = "_blank";
    proofLink.rel = "noopener noreferrer";
    proofLink.title = `Post ${proof.postNumber} · page ${proof.pageNumber}, entry ${proof.slot + 1}`;
    proofLink.setAttribute(
      "aria-label",
      `View post ${proof.postNumber} on chain (opens a new tab)`,
    );
    footer.append(proofLink);
    if (content?.recipient && config.profile === "local")
      footer.append(
        button("◇ Leave a private tip", "text-button", () => {
          publishContext = { destination: content.recipient };
          dialog("tip-dialog");
        }),
      );
    if (!sealedThread(thread) || key) {
      footer.append(
        button("Reply", "text-button", () => {
          invalidateReview();
          $("reply-form").dataset.parent = String(post.index);
          $("reply-context").textContent = `Replying to post ${post.index + 1}`;
          $("reply-target").hidden = false;
          $("reply-excerpt").textContent =
            content?.body.slice(0, 180) ?? "Sealed post";
          $("reply-body").focus();
          showPostingHelp('reply', {code:'writing', message:`Write your reply to post ${post.index + 1} below, then press Reply to publish.`});
          $('reply-form').scrollIntoView({block:'center'});
        }),
      );
    }
    article.append(footer);
    posts.append(article);
  }
  $("invite-button").hidden = !(sealedThread(thread) && key) || roomManager.managed(config,thread);
  $("room-access-button").hidden = !sealedThread(thread);
  $("reply-form").hidden = sealedThread(thread) && !key;
  if (thread.nextBefore !== null) {
    const older = button("Load older replies", "secondary", async () => {
      older.disabled = true;
      try {
        const y = scrollY;
        await loadEarlier(thread);
        if (currentThread !== thread) return;
        await renderThread(thread);
        window.scrollTo(0, y);
        ($("load-older") ?? $("conversation-title")).focus({
          preventScroll: true,
        });
      } catch (e) {
        older.disabled = false;
        flash(e.message, true);
      }
    });
    older.id = "load-older";
    posts.append(older);
  }
  $("thread-capacity").hidden = thread.postCount < thread.capacity;
  if (thread.postCount >= thread.capacity) $("reply-form").hidden = true;
  updateSpace("reply");
  updateOtherClient();
}
async function loadEarlier(thread) {
  const previous = await api(
    `/api/thread?address=${thread.address}&before=${thread.nextBefore}`,
  );
  thread.posts = [
    ...new Map(
      [...previous.posts, ...thread.posts].map((p) => [p.index, p]),
    ).values(),
  ].sort((a, b) => a.index - b.index);
  thread.nextBefore = previous.nextBefore;
}
async function jumpToPost(index) {
  const thread = currentThread;
  while (!$(`post-${index}`) && thread.nextBefore !== null) {
    await loadEarlier(thread);
    if (currentThread !== thread) return;
    await renderThread(thread);
  }
  const target = $(`post-${index}`);
  if (target) {
    target.scrollIntoView({ block: "center" });
    target.focus({ preventScroll: true });
  } else flash("This post is not available from the provider yet.", true);
}
function resetReplyTarget() {
  $("reply-form").dataset.parent = "0";
  $("reply-context").textContent = "Replying to the thread";
  $("reply-target").hidden = true;
  $("reply-excerpt").textContent = "";
}
async function showBoard({ navigate = true, restore = null } = {}) {
  ++navigationGeneration;
  currentThread = null;
  document.body.dataset.view = "board";
  restore ??= feedSnapshot?.board === boardAddress ? feedSnapshot : null;
  if (restore) {
    setFilter(restore.filter ?? "all");
    showHidden = restore.showHidden ?? false;
  }
  if (navigate) {
    routeTo(null);
    history.replaceState(restore ?? {}, "", location.href);
  }
  $("thread-view").hidden = true;
  $("board-view").hidden = false;
  await refreshBoard();
  $("board-title").focus({ preventScroll: true });
  window.scrollTo(0, restore?.scroll ?? 0);
}
async function review(body, context) {
  const useSapient = Boolean(walletOptions.adapter.connection && ['thread', 'reply'].includes(body.kind));
  if (
    !useSapient && (((config.profile !== "local" || config.posterPrivacy) &&
      !browserWallet.active()) ||
    browserWallet.needsPhraseConfirmation())
  ) {
    if (context.inline) {
      showPostingHelp(context.inline, {code:'wallet-required', message: browserWallet.needsPhraseConfirmation() ? 'Finish saving your recovery words before posting. Your draft is kept.' : 'Set up posting on this device, or unlock it with your PIN. Your draft is kept.', action:'wallet'});
      return;
    }
    walletReturn = body.kind === "thread" ? "compose" : "reply";
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
    await openWallet();
    if (body.kind === 'registry') walletOptions.browser();
    $("wallet-message").hidden = false;
    $("wallet-message").textContent = browserWallet.needsPhraseConfirmation()
      ? "Save and confirm your recovery phrase before publishing. Use Show recovery phrase, then return to your post."
      : "Set up posting on this device, or choose an existing wallet. Your draft is kept.";
    return;
  }
  if (config.profile !== "local" && body.kind === "tip")
    throw new Error(
      "Participant private tips are awaiting receive/spend verification.",
    );
  busy = true;
  const buttons = document.querySelectorAll(
    "#compose-form button[type=submit],#reply-form button[type=submit],#tip-form button[type=submit]",
  );
  buttons.forEach((b) => (b.disabled = true));
  operationState("preparing", "Checking your post and estimating its fee…");
  try {
    quote =
      useSapient ? await walletOptions.adapter.review(body, config, api) : browserWallet.active() && body.kind !== "tip"
        ? body.kind==='registry' ? await browserWallet.reviewRegistry(body,context.admin) : await browserWallet.review(body)
        : await api("/api/quote", body);
    publishContext = { ...context, body, quote };
    if (context.inline) {
      if (context.revision !== postingRevision) throw Object.assign(new Error('Your draft or wallet changed during the check. Press Post when you are ready.'), {notSubmitted:true});
      if (BigInt(quote.maxFee) <= 0n || BigInt(quote.maxFee) > POSTING_FEE_LIMIT) throw Object.assign(new Error('The fee exceeds the 1 test TARI limit. Nothing was submitted.'), {notSubmitted:true});
      showPostingHelp(context.inline, {code: 'ready', message: quote.sapient ? 'Approve this post and its fee in Sapient. Your extension will open.' : `Network fee: ${units(quote.maxFee)}${quote.privateFee ? ', paid in full' : ' maximum'}. Posting…`});
      return {ready:true};
    }
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
    $("review-title").textContent =
      body.kind === "tip"
        ? "Review your private tip"
        : body.kind === "reply"
          ? "Review your reply"
          : "Review your post";
    const sealed = body.mode === 1 || isSealedPayload(body.payload);
    $("review-copy").textContent =
      body.kind === "tip"
        ? `Send ${units(body.amount)} as a separate native stealth transfer.`
        : sealed
          ? "The message body is encrypted locally. The title, category, reply links and chain metadata are public. Share the invitation only through a trusted private channel; anyone with it can read and reply. There is no key revocation or author authentication."
          : "Public posts cannot be edited or deleted through Hauntboard. Testnet resets may remove history.";
    $("review-preview").hidden = body.kind === "tip";
    $("review-content-title").textContent = context.content?.title ?? "";
    $("review-content-title").hidden = !context.content?.title;
    $("review-content-body").textContent = context.content?.body ?? "";
    $("review-wallet").textContent = quote.sapient ? 'Sapient wallet' : quote.privateFee
      ? "One-time native stealth spend"
      : quote.browser
        ? "Your browser wallet"
        : `${config.label} · local companion`;
    $("review-fee-label").textContent = quote.privateFee
      ? "Network fee · paid in full"
      : "Maximum network fee";
    $("review-fee").textContent = units(quote.maxFee);
    $("review-mode").textContent =
      body.kind === "tip"
        ? "Native stealth transfer"
        : sealed
          ? "Encrypted in this browser"
          : "Public full text";
    $("review-signing").textContent = quote.sapient ? 'Approve in Sapient. Your wallet builds and submits the transaction with private fees. Wallet signatures and fee change may link posts. If submission is interrupted, check the existing request before trying again.' : quote.privateFee
      ? "Your browser authorizes a native stealth input with its one-time spend key. The full shown fee is paid; the safety buffer cannot be refunded. Your persistent wallet key and account are omitted. Fees, spent-output links, timing and network connections remain visible."
      : quote.browser
        ? "Your browser signs locally. The companion relays the signed transaction to Tari."
        : "The local companion signs using its demo wallet. Publishing records the transaction on the local chain.";
    $("confirm-publish").textContent =
      body.kind === "tip"
        ? "Send private tip"
        : body.kind === "reply"
          ? "Publish reply"
          : sealed
            ? "Publish sealed post"
            : "Publish public post";
    $("confirm-publish").disabled = false;
    if(body.kind==='registry'){
      $('review-title').textContent='Review room access change';
      $('review-copy').textContent=context.content.body;
      $('review-mode').textContent='Recipient-encrypted key delivery';
      $('review-signing').textContent='Your browser signs with a separate room administration key and funds the fee from a native stealth output. Registry updates within this room are linked to that administration key. Member pseudonyms, timing and fees are public. The existing board remains permissionless.';
      $('confirm-publish').textContent='Publish room access change';
    }
    if(context.managed)$('review-copy').textContent='This message uses the current managed-room key. Removed members do not receive new generation keys. Old messages and previously shared keys remain accessible. Titles, categories and chain metadata are public.';
    operationState(
      "review",
      "Review the exact content and fee before publishing.",
    );
    dialog("review-dialog");
  } finally {
    busy = false;
    buttons.forEach((b) => (b.disabled = postIntentBusy));
  }
}
async function pollTransaction(id, isBrowser = false, isSapient = false) {
  for (let i = 0; i < 100; i++) {
    const tx = isSapient ? await sapientResult(id) : isBrowser
      ? await browserWallet.transaction(id)
      : await api(`/api/transaction?id=${id}`);
    if (!["New", "Pending"].includes(tx.status)) return tx;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    "Confirmation is taking longer than expected. The transaction is saved; refresh to check its status.",
  );
}
async function sapientResult(id) {
  const row = await api('/api/indexer', {method: 'GET', path: `transactions/${id}/result`});
  if (row.result === 'Pending') return {status: 'Pending'};
  const final = row.result?.Finalized;
  if (!final) return {status: 'Pending'};
  return {status: final.final_decision === 'Commit' && final.execution_result?.finalize?.result?.Accept ? 'Accepted' : 'Rejected', fee: final.execution_result?.finalize?.fee_receipt?.total_fees_paid ?? '0'};
}
async function finishTransaction(pending) {
  if (pending.sapient && !pending.id) {
    let sent;
    try { sent = await walletOptions.adapter.recover(pending); }
    catch (error) {
      if (error.notSubmitted && !pending.sapientAttempted) { localStorage.removeItem('hauntboard-pending'); transactionPending = null; }
      throw error;
    }
    pending.id = sent.transactionId;
    localStorage.setItem('hauntboard-pending', JSON.stringify(pending));
  }
  if (!pending.id) {
    const operation = await api(`/api/operation?id=${pending.operation}`);
    if (!operation.transactionId) {
      if (operation.status === "not_submitted") {
        localStorage.removeItem("hauntboard-pending");
        transactionPending = null;
        throw new Error(
          "The operation was not submitted. Review your preserved draft again.",
        );
      }
      throw new Error(
        "The wallet submission has an unknown outcome. Inspect its history before retrying.",
      );
    }
    pending.id = operation.transactionId;
    transactionPending = { ...pending };
    delete transactionPending.key;
    localStorage.setItem(
      "hauntboard-pending",
      JSON.stringify(transactionPending),
    );
  }
  const tx = await pollTransaction(pending.id, pending.browser, pending.sapient);
  if (pending.browser) await walletView().catch(() => {});
  if (tx.status !== "Accepted") {
    localStorage.removeItem("hauntboard-pending");
    transactionPending = null;
    throw new Error(
      `The network did not publish this message (${tx.status}).${BigInt(tx.fee ?? 0) > 0n ? ` It charged a network fee of ${units(tx.fee)}.` : ''} Your draft remains available in this session.`,
    );
  }
  // Acceptance and provider visibility are separate. Retain the operation until its view resolves.
  pending.accepted = true;
  transactionPending = { ...pending };
  delete transactionPending.key;
  localStorage.setItem(
    "hauntboard-pending",
    JSON.stringify(transactionPending),
  );
  operationState(
    "indexing",
    "Your post was accepted. Loading its confirmed view…",
  );
  if(pending.kind==='registry'){
    await roomManager.finish(config,pending.roomAction,tx);
    await openThread(pending.roomAction.thread);
  } else if (pending.kind === "thread") {
    const latest = await api(`/api/board?address=${pending.board}`);
    const ref = latest.threads.find(
      (t) => JSON.stringify(t.uid) === JSON.stringify(pending.uid),
    );
    if (!ref)
      throw new Error(
        "Transaction confirmed; waiting for the board indexer to catch up. Refresh to reconcile it.",
      );
    if (pending.key) await keepKey(ref.address, pending.key);
    await openThread(ref.address);
    $("compose-form").reset();
    sessionStorage.removeItem("hauntboard-compose-draft");
    $("draft-status").textContent = "";
    if (pending.key)
      flash(
        "Secret thread confirmed. Its key is saved in this browser. Copy the invitation or export a key backup.",
      );
  } else if (pending.kind === "reply") {
    const visible = await openThread(pending.thread);
    if (
      pending.nonce &&
      !visible?.posts.some(
        (post) => JSON.stringify(post.nonce) === JSON.stringify(pending.nonce),
      )
    )
      throw new Error(
        "Your reply was accepted; waiting for this provider to return it. Check its existing submission again.",
      );
    $("reply-body").value = "";
    sessionStorage.removeItem(`hauntboard-reply-${pending.thread}`);
    resetReplyTarget();
    updateSpace("reply");
  }
  localStorage.removeItem("hauntboard-pending");
  transactionPending = null;
  publishContext = null;
  quote = null;
  postingIntents.clear();
  operationState(
    "confirmed",
    pending.kind === 'registry' ? 'Room access updated. Download a fresh access backup from Room access.' : pending.kind === "tip"
      ? "Your private tip was accepted."
      : `Your ${pending.kind === "reply" ? "reply" : "post"} is on Tari. Network fee: ${units(tx.fee ?? "0")}.`,
  );
  if (pending.keyLocator) await deleteKey(pending.keyLocator);
  if (pending.kind === "tip")
    flash(
      `Private tip confirmed. ${units(tx.fee ?? "0")} network fee. The recipient can scan it in the other wallet.`,
    );
  else if (!pending.key)
    flash(`Confirmed on Tari. Network fee: ${units(tx.fee ?? "0")}.`);
  return tx;
}
async function publish() {
  if (busy || transactionPending || !publishContext?.quote) return;
  const existing = readStorage(localStorage, 'hauntboard-pending', null);
  if (existing) { transactionPending = existing; operationError(new Error('Check your existing submission before posting again.')); return; }
  busy = true;
  $("confirm-publish").disabled = true;
  $("review-edit").disabled = true;
  try {
    const context = publishContext;
    const body = context.body;
    const pending = {
      operation: context.quote.operation,
      browser: Boolean(context.quote.browser),
      ...(context.quote.sapient ? {sapient: true, sapientAccount: context.quote.account, sapientNetwork: context.quote.network} : {}),
      kind: body.kind,
      board: body.board,
      uid: body.uid,
      thread: body.thread,
      nonce: body.nonce,
      ...(context.roomAction?{roomAction:context.roomAction}:{}),
    };
    if (context.key) {
      // Keep the pending secret encrypted locally under a temporary canonical locator until its address is known.
      const temporary = `component_${context.quote.operation}`;
      await saveKey(temporary, context.key);
      pending.keyLocator = temporary;
    }
    if(context.managed){
      const state=await api(`/api/key-registry?address=${context.managed.registry}`);
      if(state.revision!==context.managed.revision)throw Error('Room membership changed. Review your reply again before submitting.');
    }
    localStorage.setItem("hauntboard-pending", JSON.stringify(pending));
    transactionPending = pending;
    operationState(
      "submitted",
      context.quote.sapient ? 'Approve your post in Sapient. Check the existing request if approval is interrupted.' : 'Posting your message. You do not need to press Post again.',
    );
    const sent = context.quote.sapient ? await walletOptions.adapter.submit(context.quote, pending, () => localStorage.setItem('hauntboard-pending', JSON.stringify(pending))) : context.quote.browser
      ? await browserWallet.submit(context.quote, prepared => { pending.id = prepared.id; localStorage.setItem('hauntboard-pending', JSON.stringify(pending)); })
      : await api("/api/submit", { quoteId: context.quote.id });
    pending.id = sent.transactionId;
    localStorage.setItem("hauntboard-pending", JSON.stringify(pending));
    $("review-dialog").close();
    if (context.inline === 'compose') $('compose-dialog').close();
    operationState(
      "submitted",
      "Your post was submitted. Waiting for confirmation…",
    );
    const completed = { ...pending, key: context.key };
    await finishTransaction(completed);
  } catch (error) {
    if (error.notSubmitted && transactionPending && (!transactionPending.sapient || !transactionPending.sapientAttempted)) {
      localStorage.removeItem('hauntboard-pending'); transactionPending = null;
    }
    $("review-dialog").close();
    if (publishContext?.inline) showPostingHelp(publishContext.inline, {code:transactionPending ? 'pending-operation' : 'rejected', message:transactionPending ? 'Your submission is still being checked. You do not need to post again.' : error.message, action:transactionPending ? 'status' : 'sync'});
    operationError(error);
  } finally {
    busy = false;
    $("confirm-publish").disabled =
      Boolean(transactionPending) || !publishContext?.quote;
    $("review-edit").disabled = false;
    $("check-operation").hidden = !transactionPending;
  }
}
function preserveDraft() {
  if (document.querySelector("input[name=mode]:checked").value === "1") {
    sessionStorage.removeItem("hauntboard-compose-draft");
    $("draft-status").textContent =
      "Sealed draft is not saved. Keep this tab open.";
    return;
  }
  try {
    sessionStorage.setItem(
      "hauntboard-compose-draft",
      JSON.stringify({
        title: $("thread-title").value,
        category: $("thread-category").value,
        name: $("post-name").value,
        body: $("thread-body").value,
        mode: document.querySelector("input[name=mode]:checked").value,
      }),
    );
    $("draft-status").textContent = "Draft saved for this tab.";
  } catch {
    $("draft-status").textContent =
      "This browser could not save your draft. Keep this tab open.";
  }
}
function composeContent() {
  const content = {
    category: $("thread-category").value,
    title: $("thread-title").value.trim(),
    name: $("post-name").value.trim() || "Ghost",
    body: $("thread-body").value.trim(),
  };
  if ($("include-address").checked) {
    const recipient = browserWallet.active()?.address ?? config?.receiveAddress;
    if (recipient) content.recipient = recipient;
  }
  return content;
}
function updateSpace(kind) {
  const reply = kind === "reply",
    mode = reply
      ? sealedThread(currentThread)
        ? 1
        : 0
      : Number(document.querySelector("input[name=mode]:checked").value);
  const content = reply
    ? {
        title: "",
        name: config?.posterPrivacy ? "Ghost" : (config?.label ?? "Ghost"),
        body: $("reply-body").value.trim(),
      }
    : composeContent();
  const space =
    config?.posterPrivacy && mode === 1
      ? sealedSpace(content)
      : postSpace(content, mode);
  $(`${kind}-space`).textContent =
    space.remaining >= 0
      ? space.remaining < 512 ? 'This message is close to the length limit.' : ''
      : `${(-space.remaining).toLocaleString()} bytes over the ${space.limit.toLocaleString()}-byte limit`;
  $(reply ? "reply-body" : "thread-body").setCustomValidity(
    space.remaining < 0
      ? "Shorten this message to fit its serialized byte limit."
      : "",
  );
}
function fieldError(kind, message) {
  const el = $(`${kind}-error`);
  el.hidden = false;
  el.textContent = message;
  const field = $(
    kind === "reply"
      ? "reply-body"
      : !$("thread-title").value.trim()
        ? "thread-title"
        : "thread-body",
  );
  field.setAttribute("aria-invalid", "true");
  field.focus();
}
function invalidateReview() {
  postingRevision++;
  if (transactionPending) return;
  quote = null;
  if (publishContext?.body) publishContext = null;
  $("confirm-publish").disabled = true;
}
function showPostingHelp(kind, reason) {
  const status = $(`${kind}-posting-status`);
  const held = reason.code === 'change-held' ? lastWalletBalance?.quarantined : null;
  status.textContent = held && BigInt(held) > 0n ? `You have ${units(held)} remaining. ${reason.message}` : reason.message;
  status.dataset.state = reason.code ?? 'checking';
  if (!postIntentBusy && !busy) updatePostingButton(kind);
  $(`${kind}-use-change`).hidden = reason.action !== 'policy';
  $(`${kind}-change-help`).hidden = reason.action !== 'policy';
  const setup = $(`${kind}-open-wallet`);
  setup.hidden = !['wallet','prepare'].includes(reason.action);
  setup.textContent = reason.action === 'prepare' ? 'Prepare my existing tokens' : browserWallet.active() ? 'Open posting setup' : 'Set up posting on this device';
  $(`${kind}-sync-posting`).hidden = reason.action !== 'sync';
  $(`${kind}-check-posting`).hidden = reason.action !== 'status';
  $(`${kind}-prepare-confirm`).hidden = reason.code !== 'preparation-review' && reason.code !== 'preparation-pending';
}
function updatePostingButton(kind) {
  const submit = $(`${kind}-form`).querySelector('button[type=submit]');
  const held = $(`${kind}-posting-status`).dataset.state === 'change-held';
  submit.dataset.useRemaining = String(held);
  submit.textContent = held ? `Use remaining tokens and ${kind === 'reply' ? 'reply' : 'post'}` : kind === 'reply' ? 'Reply' : 'Post';
}
function revealPostingFeedback(kind) {
  const status = $(`${kind}-posting-status`);
  status.scrollIntoView({block:'nearest'});
}
function showPostingWallet(readiness) {
  const sapient = Boolean(walletOptions.adapter.connection);
  if (sapient) $('wallet-balance-button').hidden = true;
  for (const kind of ['compose', 'reply']) {
    if (!sapient && ['preparation-review','preparation-pending'].includes($(`${kind}-posting-status`).dataset.state)) continue;
    if (sapient) {
      $(`${kind}-wallet-balance`).hidden = false;
      $(`${kind}-wallet-balance`).textContent = 'Posting with Sapient. Funds and the fee are checked in the extension; browser-wallet funds are separate.';
      showPostingHelp(kind, {code:'approval-required', message:'Sapient will open for approval when you post.'});
    } else if (readiness) showPostingHelp(kind, readiness);
    else if (lastWalletBalance && browserWallet.active()) showPostingHelp(kind, fundsReadiness(lastWalletBalance, {incomplete:scanIncomplete}));
  }
}
function postingIntent(kind, identity) {
  const fingerprint = JSON.stringify(identity);
  let intent = postingIntents.get(kind);
  if (!intent || intent.fingerprint !== fingerprint) {
    intent = {fingerprint, id:randomId(), key:kind === 'compose' && identity.mode ? newThreadKey() : null};
    postingIntents.set(kind, intent);
  }
  return intent;
}
async function runPostingIntent(kind, action) {
  if (postIntentBusy || busy) { showPostingHelp(kind, {code:'checking', message:'Your previous click is still being processed. No additional submission was started.'}); revealPostingFeedback(kind); return; }
  if (transactionPending) { showPostingHelp(kind, {code:'pending-operation', message:'Your existing submission is still being checked. You do not need to post again.', action:'status'}); return; }
  if (!$(kind === 'reply' ? 'reply-body' : 'thread-body').value.trim()) {
    const message = kind === 'reply' ? 'Write a reply before pressing Reply.' : 'Write your opening post before posting.';
    fieldError(kind, message); showPostingHelp(kind, {code:'invalid-draft', message}); revealPostingFeedback(kind); return;
  }
  // Only the explicitly labelled action consents to changing an existing
  // isolation setting. A generic Reply/Post click never silently changes it.
  const useRemaining = $(`${kind}-form`).querySelector('button[type=submit]').dataset.useRemaining === 'true';
  postIntentBusy = true;
  const buttons = [...document.querySelectorAll('#compose-form button[type=submit],#reply-form button[type=submit]')];
  buttons.forEach(button => { button.disabled = true; button.textContent = button.closest('#compose-form') ? 'Posting…' : 'Replying…'; });
  showPostingHelp(kind, {code:'checking', message:'Checking your post and network fee…'});
  revealPostingFeedback(kind);
  try {
    await navigator.locks.request(`hauntboard-post:${config.network}:${config.resetIdentity}`, {ifAvailable:true}, async lock => {
      if (!lock) throw Object.assign(new Error('Another tab is checking a post. Wait for its result.'), {code:'pending-operation'});
      const existing = readStorage(localStorage, 'hauntboard-pending', null);
      if (existing) { transactionPending = existing; throw Object.assign(new Error('Your previous submission is still being checked. Use Check status before posting again.'), {code:'pending-operation'}); }
      publishContext = null;
      quote = null;
      if (useRemaining && !walletOptions.adapter.connection && browserWallet.active()) {
        await browserWallet.setPostingPolicy('standard');
        invalidateReview();
        await walletView();
      }
      if(!walletOptions.adapter.connection && browserWallet.active() && !browserWallet.needsPhraseConfirmation()) {
        // A cached zero is not a reason to reject a new posting attempt after
        // funding or confirmation. Recheck owned funds before choosing help.
        const address=browserWallet.active().address;
        const balance=await browserWallet.privateBalance();
        if(browserWallet.active()?.address!==address)throw Error('The selected wallet changed. Check posting setup again.');
        showWalletBalance(balance);
      }
      if (!walletOptions.adapter.connection && browserWallet.active() && !browserWallet.needsPhraseConfirmation() && lastWalletIdentity === browserWallet.active().address && lastWalletBalance && !lastWalletBalance.unavailable && Date.now() - lastWalletCheckedAt < 30000 && BigInt(lastWalletBalance.ready ?? 0) === 0n) {
        let reason = fundsReadiness(lastWalletBalance, {incomplete:scanIncomplete});
        if (reason.code === 'funding-needed') reason = {code:'funding-needed', message:'No posting funds have been found yet. Add free test tokens, or check a payment you already received. Your draft is kept.', action:'fund'};
        showPostingHelp(kind, reason);
        renderPostingFunding(); revealPostingFeedback(kind);
        return;
      }
      const revision = postingRevision;
      await action(revision);
      if (publishContext?.inline === kind && publishContext.revision === postingRevision && quote) {
        await publish();
        if (transactionPending) showPostingHelp(kind, {code:'pending-operation', message:'Your post is still being checked. Use Check status; you do not need to post it again.', action:'status'});
        else if (!publishContext) showPostingHelp(kind, {code:'confirmed', message:'Your message is published.'});
      }
    });
  } catch (error) {
    let reason = {code:error.code ?? 'provider-unavailable', message:error.message, action:'sync'};
    if (error.code === 'change-held') reason.action = 'policy';
    else if (error.code === 'preparation-needed') reason.action = 'prepare';
    else if (error.code === 'funding-needed' || error.code === 'insufficient-eligible-funds') reason.action = 'fund';
    else if (error.code === 'pending-operation') reason.action = 'status';
    showPostingHelp(kind, reason);
    revealPostingFeedback(kind);
    operationError(error);
  } finally {
    postIntentBusy = false;
    // The verified balance changes during confirmation while status rendering
    // is paused. Apply it before the next composer is used, not on a later poll.
    if (!transactionPending && lastWalletBalance && $(`${kind}-posting-status`).dataset.state === 'confirmed') {
      const readiness = fundsReadiness(lastWalletBalance, {incomplete:scanIncomplete});
      for (const composer of ['compose','reply']) {
        if (composer !== kind || readiness.action === 'policy') showPostingHelp(composer, readiness);
      }
    }
    buttons.forEach(button => { button.disabled = false; });
    for (const composer of ['compose','reply']) updatePostingButton(composer);
    renderFaucet();
  }
}
for (const kind of ['compose','reply']) {
  $(`${kind}-check-posting`).addEventListener('click', async () => { transactionPending ??= readStorage(localStorage, 'hauntboard-pending', null); if(!transactionPending){await checkPostingFunds({manual:true});return;} if (kind === 'compose') $('compose-dialog').close(); await reconcilePending(); });
  $(`${kind}-open-wallet`).addEventListener('click', async () => {
    if ($(`${kind}-posting-status`).dataset.state === 'preparation-needed' && browserWallet.active()) {
      const button = $(`${kind}-open-wallet`);
      button.disabled = true;
      try {
        const preparation = await browserWallet.reviewPostingPreparation();
        showPostingHelp(kind, {code:preparation.pending ? 'preparation-pending' : 'preparation-review', message:preparation.pending ? 'Your preparation is still being checked. Check the saved request; no new transfer will be created.' : `Move ${units(preparation.amount)} within your wallet to prepare posting funds. This separate transaction costs up to ${units(preparation.fee)}. The rest stays in your account. Confirming does not publish your draft.`});
        $(`${kind}-prepare-confirm`).textContent = preparation.pending ? 'Check preparation status' : 'Confirm preparation';
      } catch (error) { showPostingHelp(kind, {code:'preparation-needed', message:error.message, action:'prepare'}); }
      finally { button.disabled = false; }
      return;
    }
    walletReturn = kind;
    if (kind === 'compose') $('compose-dialog').close();
    await openWallet();
    if (browserWallet.active()) {
      $('browser-wallet-fallback').open = true;
      $('wallet-ready-panel').scrollIntoView({block:'start'});
    }
  });
  $(`${kind}-prepare-confirm`).addEventListener('click', async () => {
    const button = $(`${kind}-prepare-confirm`);
    if (button.disabled || postIntentBusy || transactionPending) return;
    button.disabled = true;
    try {
      await browserWallet.confirmPostingPreparation();
      invalidateReview(); await walletView();
      showPostingHelp(kind, {code:'ready', message:'Posting funds are ready. Your draft is preserved; press Post or Reply when ready.'});
    } catch (error) {
      const pending = browserWallet.postingPreparationStatus().pending;
      showPostingHelp(kind, {code:pending ? 'preparation-pending' : 'preparation-needed', message:error.message, action:pending ? null : 'prepare'});
      button.textContent = 'Check preparation status';
    } finally { button.disabled = false; }
  });
  $(`${kind}-use-change`).addEventListener('click', async () => {
    try { await browserWallet.setPostingPolicy('standard'); invalidateReview(); await walletView(); showPostingWallet(); }
    catch (error) { showPostingHelp(kind, {code:'provider-unavailable', message:error.message, action:'sync'}); }
  });
  const syncPostingFunds = () => checkPostingFunds({manual:true});
  $(`${kind}-sync-posting`).addEventListener('click', syncPostingFunds);
  $(`${kind}-check-funds`).addEventListener('click', syncPostingFunds);
  $(`${kind}-get-funds`).addEventListener('click', () => refreshFaucet(true));
  $(`${kind}-form`).addEventListener('invalid', event => {
    const message = event.target.validity.valueMissing ? kind === 'reply' ? 'Write a reply before pressing Reply.' : event.target.id === 'thread-title' ? 'Give your thread a title before posting.' : 'Write your opening post before posting.' : event.target.validationMessage;
    $(`${kind}-error`).hidden = false;
    $(`${kind}-error`).textContent = message;
    event.target.setAttribute('aria-invalid','true');
    showPostingHelp(kind, {code:'invalid-draft', message});
    revealPostingFeedback(kind);
  }, true);
}
// Drafts are held in this tab. Secret draft persistence is intentionally avoided before encryption.
$("compose-form").addEventListener("input", () => {
  invalidateReview();
  $("compose-error").hidden = true;
  for (const id of ["thread-title", "thread-body"])
    $(id).removeAttribute("aria-invalid");
  updateSpace("compose");
  if (document.querySelector("input[name=mode]:checked").value === "0")
    preserveDraft();
  else {
    sessionStorage.removeItem("hauntboard-compose-draft");
    $("draft-status").textContent =
      "Sealed draft is not saved. Keep this tab open.";
  }
});
$("reply-body").addEventListener("input", () => {
  invalidateReview();
  $("reply-error").hidden = true;
  $("reply-body").removeAttribute("aria-invalid");
  updateSpace("reply");
  if (currentThread && !sealedThread(currentThread)) {
    try {
      sessionStorage.setItem(
        `hauntboard-reply-${currentThread.address}`,
        JSON.stringify($("reply-body").value),
      );
    } catch {}
  }
});
$("compose-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await runPostingIntent('compose', async revision => {
    const mode = Number(
        document.querySelector("input[name=mode]:checked").value,
      );
    const content = composeContent();
    const intent = postingIntent('compose', {board:boardAddress, mode, content});
    const uid = intent.id, key = intent.key;
    if ($("include-address").checked) {
      const destination =
        browserWallet.active()?.address ?? config.receiveAddress;
      if (!destination)
        throw new Error(
          "Unlock your browser wallet to include your receive address.",
        );
      content.recipient = destination;
    }
    if (!content.body || !content.title)
      throw new Error("Give your thread a title and opening post.");
    const context = [boardAddress, uid, uid, null];
    const nativeSealed = config.posterPrivacy && mode === 1;
    const payload = nativeSealed
      ? await sealPost(content, key, config, context, {
          title: content.title,
          category: content.category,
        })
      : await encodePost(content, mode, key, context);
    await review(
      {
        kind: "thread",
        board: boardAddress,
        title: mode && !nativeSealed ? "Sealed thread" : content.title,
        mode: nativeSealed ? 0 : mode,
        uid,
        payload,
      },
      { key, content, inline:'compose', revision },
    );
  });
});
$("reply-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await runPostingIntent('reply', async revision => {
    const intent = postingIntent('reply', {thread:currentThread.address, body:$('reply-body').value, parent:$('reply-form').dataset.parent});
    const nonce = intent.id,
      parent = Number($("reply-form").dataset.parent ?? 0);
    if (currentThread.schema >= 3) {
      const view = new DataView(new Uint8Array(nonce).buffer);
      view.setUint32(0, Math.floor(currentThread.postCount / 16), true);
      nonce.splice(0, 4, ...new Uint8Array(view.buffer).slice(0, 4));
    }
    const content = {
      title: "",
      name: config.posterPrivacy ? "Ghost" : config.label,
      body: $("reply-body").value.trim(),
    };
    if (!content.body) throw new Error("Write a reply first.");
    const context = [currentThread.board, currentThread.uid, nonce, parent];
    const managed=sealedThread(currentThread)?await roomManager.writing(config,currentThread):null;
    const key = managed?.key ?? await keyFor(currentThread.address);
    const payload =
      currentThread.schema === 4 && sealedThread(currentThread)
        ? await sealPost(
            content,
            key,
            config,
            context,
            {...sealedMetadata(currentThread.posts[0].payload),...(managed?{registry:managed.registry,generation:managed.generation}:{})},
          )
        : await encodePost(content, currentThread.mode, key, context);
    await review(
      { kind: "reply", thread: currentThread.address, nonce, parent, payload },
      { content, managed, inline:'reply', revision },
    );
  });
});
$("tip-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy || transactionPending)
    return flash("Finish the pending transaction first.", true);
  try {
    const text = $("tip-amount").value;
    if (!/^\d+(?:\.\d{1,6})?$/.test(text))
      throw new Error("Enter a tip with at most six decimal places.");
    const [whole, fraction = ""] = text.split(".");
    const amount = (
      BigInt(whole) * 1000000n +
      BigInt(fraction.padEnd(6, "0"))
    ).toString();
    await review(
      {
        kind: "tip",
        destination: publishContext.destination,
        amount,
        operation: randomId()
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      },
      {},
    );
  } catch (e) {
    flash(e.message, true);
  }
});
$("confirm-publish").addEventListener("click", () =>
  publish().catch((e) => flash(e.message, true)),
);
function openCompose(restore = true) {
  if (!config) return;
  invalidateReview();
  const draft = restore
    ? readStorage(sessionStorage, "hauntboard-compose-draft", null)
    : null;
  $("thread-category").value = draft ? categoryOf(draft) : category;
  if (draft) {
    $("thread-title").value = draft.title;
    $("post-name").value = draft.name;
    $("thread-body").value = draft.body;
    if (!config.posterPrivacy)
      document.querySelector(
        `input[name=mode][value="${draft.mode === "1" ? "1" : "0"}"]`,
      ).checked = true;
  }
  updateSpace("compose");
  updateComposeVisibility();
  dialog("compose-dialog");
  $("thread-title").focus();
}
$("new-thread").addEventListener("click", () => openCompose());
document
  .querySelectorAll("[data-category]:not(#home-board)")
  .forEach((button) =>
    button.addEventListener("click", () => {
      if (!config) return;
      feedSnapshot = null;
      selectCategory(button.dataset.category);
      showBoard().catch((error) => flash(error.message, true));
    }),
  );
$("thread-category").addEventListener("change", () => {
  invalidateReview();
  updateSpace("compose");
  preserveDraft();
});
$("continue-thread").addEventListener("click", () => {
  const reference = `${location.origin}/?board=${boardAddress}&thread=${currentThread.address}`;
  $("compose-form").reset();
  if (sealedThread(currentThread))
    document.querySelector('input[name=mode][value="1"]').checked = true;
  $("thread-title").value =
    `Continuation: ${$("conversation-title").textContent}`.slice(0, 80);
  $("thread-body").value = `Continuing the conversation: ${reference}\n\n`;
  if (!sealedThread(currentThread)) preserveDraft();
  openCompose(false);
});
$("review-edit").addEventListener("click", () => {
  const kind = publishContext?.body?.kind,
    destination = publishContext?.body?.destination;
  $("review-dialog").close();
  invalidateReview();
  $("operation-panel").hidden = true;
  if (kind === "thread") openCompose(false);
  else if (kind === "tip") {
    publishContext = { destination };
    dialog("tip-dialog");
  } else $("reply-body").focus();
});
$("review-dialog").addEventListener("close", () => {
  if (!busy && !transactionPending) {
    invalidateReview();
    $("operation-panel").hidden = true;
  }
  $("review-content-title").textContent = "";
  $("review-content-body").textContent = "";
});
function updateComposeVisibility() {
  const encrypted=document.querySelector("input[name=mode]:checked").value === "1";
  $('compose-visibility-label').textContent=encrypted?'Encrypted messages · title is public':'Public message · change visibility';
  $("compose-hint").textContent =
    encrypted
      ? config.posterPrivacy
        ? "Public title · encrypted messages · fee up to 1 test TARI"
        : "Encrypted title and messages · fee up to 1 test TARI"
      : "Public · permanent · fee up to 1 test TARI";
}
$("compose-form").addEventListener("change",updateComposeVisibility);
document
  .querySelectorAll("[data-close]")
  .forEach((b) =>
    b.addEventListener("click", () =>
      b.dataset.close === "compose-dialog"
        ? requestComposeClose()
        : $(b.dataset.close).close(),
    ),
  );
document.querySelectorAll("[data-filter]").forEach((b) =>
  b.addEventListener("click", () => {
    setFilter(b.dataset.filter);
    rememberFeed();
    renderRows();
  }),
);
$("refresh").addEventListener("click", () =>
  (currentThread ? openThread(currentThread.address) : refreshBoard()).catch(
    (e) => flash(e.message, true),
  ),
);
$("refresh-thread").addEventListener("click", () =>
  openThread(currentThread.address, { navigate: false, focus: false }).catch(
    (e) => flash(e.message, true),
  ),
);
$("back").addEventListener("click", () =>
  showBoard().catch((e) => flash(e.message, true)),
);
$("home-board").addEventListener("click", () => {
  feedSnapshot = null;
  selectCategory("general");
  showBoard().catch((e) => flash(e.message, true));
});
$("show-hidden").addEventListener("click", () => {
  showHidden = !showHidden;
  $("show-hidden").textContent = showHidden
    ? "Hide filtered threads"
    : "Show hidden threads";
  renderRows();
});
$("reply-order").addEventListener("change", () =>
  renderThread(currentThread).catch((e) => flash(e.message, true)),
);
$("cancel-reply").addEventListener("click", () => {
  resetReplyTarget();
  invalidateReview();
  $("reply-body").focus();
});
window.addEventListener("popstate", async (event) => {
  if (!config) return;
  invalidateReview();
  const params = new URL(location.href).searchParams;
  selectCategory(params.get("category"));
  const target = params.get("thread"),
    nextBoard = params.get("board") ?? config.board;
  if (nextBoard !== boardAddress) threadRows = [];
  boardAddress = nextBoard;
  try {
    if (target) await openThread(target, { navigate: false });
    else {
      setFilter(event.state?.filter ?? "all");
      showHidden = event.state?.showHidden ?? false;
      await showBoard({ navigate: false, restore: event.state });
    }
  } catch (error) {
    flash(error.message, true);
  }
});
$("invite-button").addEventListener("click", async () => {
  const text = invite(currentThread, await keyFor(currentThread.address));
  try {
    await navigator.clipboard.writeText(text);
    flash(
      "Secret invitation copied. Anyone with this link can read the entire thread.",
    );
  } catch {
    info("Your secret invitation.", [
      "Copy this link. Anyone who has it can read the thread.",
    ]);
    const area = node("textarea");
    area.value = text;
    area.rows = 4;
    area.readOnly = true;
    area.id = "invitation-link";
    $("info-content").append(area);
    area.select();
  }
});
$('room-access-button').addEventListener('click',async()=>{
  try{await roomManager.open(currentThread,config);}catch(e){flash(e.message,true);}
});
$('room-vault-button').addEventListener('click',async()=>{
  try{$('keys-dialog').close();await roomManager.open(currentThread&&sealedThread(currentThread)?currentThread:null,config);}catch(e){flash(e.message,true);}
});
window.addEventListener('room-vault-locked',()=>{invalidateReview();roomManager.clearView();if(currentThread)renderThread(currentThread).catch(()=>{});});
$("inspect-button").addEventListener("click", async () => {
  try {
    const raw = await api(`/api/raw?address=${currentThread.address}`);
    const pageIds =
      currentThread.schema >= 3
        ? [
            ...new Set(
              currentThread.posts.map(
                (p) => currentThread.pages[Math.floor(p.index / 16)],
              ),
            ),
          ]
        : [];
    const pages = await Promise.all(
      pageIds.map((address) => api(`/api/raw?address=${address}`)),
    );
    info(
      "What the chain stores.",
      [
        "Verified thread metadata and loaded post-page states from the configured indexer. Secret content remains encrypted; public post bytes contain the full text. Load older replies to inspect earlier pages too.",
      ],
      "REAL ON-CHAIN STATE",
    );
    $("info-content").append(
      node("pre", "", JSON.stringify({ thread: raw, pages }, null, 2)),
    );
  } catch (e) {
    flash(e.message, true);
  }
});
$("wallet-button").addEventListener("click", async () => {
  dialog("wallet-dialog");
  $("wallet-title").textContent = `${config.label}'s demo wallet.`;
  $("wallet-details").textContent = "Scanning local chain…";
  try {
    const w = await api("/api/wallet");
    const grid = node("div", "balance-grid");
    for (const [name, value] of [
      ["Fee reserve", w.revealed],
      ["Private balance", w.concealed],
    ]) {
      const div = node("div");
      div.append(node("span", "", name));
      div.append(
        node(
          "strong",
          "",
          number(value).toLocaleString(undefined, { maximumFractionDigits: 4 }),
        ),
      );
      div.append(node("span", "", "test TARI"));
      grid.append(div);
    }
    $("wallet-details").replaceChildren(grid);
    $("receive-address").value = w.receiveAddress;
    $("received-tips").replaceChildren(
      node(
        "h3",
        "",
        `${w.outputs.length} received candle${w.outputs.length === 1 ? "" : "s"}`,
      ),
    );
    for (const output of w.outputs)
      $("received-tips").append(
        node(
          "p",
          "info-paragraph",
          `${units(output.value)} · ${output.status}`,
        ),
      );
  } catch (e) {
    flash(e.message, true);
  }
});
$("copy-address").addEventListener("click", () =>
  navigator.clipboard
    .writeText(config.receiveAddress)
    .then(() => flash("Receive address copied."))
    .catch(() => $("receive-address").select()),
);
let walletBalanceVersion = 0;
let lastWalletCheckedAt = 0;
let fundsCheck = null;
let walletWorking = false;
let faucetWorking = false;
let faucetUiError = null;
function renderWalletFaucet() {
  const address = browserWallet.active()?.address;
  const enabled = Boolean(config?.faucetEnabled && address && !browserWallet.needsPhraseConfirmation());
  $("wallet-faucet").hidden = !enabled;
  if (!enabled) {
    $("wallet-faucet-status").textContent = config?.faucetEnabled ? "Finish your wallet backup to request test tokens." : "Open the TariTracker faucet to fund your Esmeralda wallet, then check for incoming funds.";
    return;
  }
  try {
    const record = faucetClient.read(config, address);
    const waiting = record?.retryAt > Date.now();
    const cooldown = record && ["confirmed", "failed", "rejected"].includes(record.status) && record.createdAt + 3600000 > Date.now();
    $("wallet-faucet").disabled = walletWorking || faucetWorking || Boolean(waiting) || Boolean(cooldown);
    $("wallet-faucet").textContent = faucetWorking ? "Checking funding request…" : cooldown ? `Next request in ${Math.ceil((record.createdAt + 3600000 - Date.now()) / 60000)} min` : !record || ["confirmed", "failed", "rejected"].includes(record.status) ? "Get 100 test TARI" : record.status === "unknown" ? "Retry saved funding request" : "Check funding request";
    $("wallet-faucet-status").textContent = faucetUiError?.address === address ? faucetUiError.message : faucetMessage(record) + (record?.error && waiting ? ` Try again in ${Math.ceil((record.retryAt - Date.now()) / 1000)} seconds.` : "");
    if (record?.status === 'confirmed' && faucetCredit.state?.address === address && faucetCredit.state.transactionId === record.transactionId) $('wallet-faucet-status').textContent += ` ${faucetCredit.state.note}`;
  } catch (error) {
    $("wallet-faucet").disabled = true;
    $("wallet-faucet-status").textContent = error.message;
  }
}
function renderPostingFunding() {
  const address = browserWallet.active()?.address;
  const browserSelected = Boolean(address && address === lastWalletIdentity && lastWalletBalance?.total !== undefined && !lastWalletBalance.unavailable && !lastWalletBalance.pendingOperation && !walletOptions.adapter.connection && !browserWallet.needsPhraseConfirmation() && !transactionPending);
  for (const kind of ['compose','reply']) {
    const visible = browserSelected && (BigInt(lastWalletBalance.total) === 0n || $(`${kind}-posting-status`).dataset.state === 'insufficient-eligible-funds');
    $(`${kind}-funding`).hidden = !visible;
    const enabled = Boolean(config?.faucetEnabled);
    $(`${kind}-get-funds`).hidden = !enabled;
    $(`${kind}-get-funds`).disabled = $('wallet-faucet').disabled || postIntentBusy || busy;
    $(`${kind}-get-funds`).textContent = $('wallet-faucet').textContent;
    $(`${kind}-funding-link`).hidden = enabled;
    $(`${kind}-funding-status`).textContent = $('wallet-faucet-status').textContent;
  }
}
function renderFaucet() { renderWalletFaucet(); renderPostingFunding(); }
async function refreshFaucet(request = false) {
  const address = browserWallet.active()?.address;
  if (faucetWorking || walletWorking || !config?.faucetEnabled || !address || browserWallet.needsPhraseConfirmation() || (!request && document.hidden)) return;
  faucetWorking = true;
  renderFaucet();
  try {
    const previous = faucetClient.read(config, address);
    const record = await faucetClient.run(config, address, request);
    if (request || record) faucetUiError = null;
    if (browserWallet.active()?.address !== address) return;
    if (record?.status === 'confirmed' && !postIntentBusy && !busy && !transactionPending) {
      const credited=await faucetCredit.reconcile({scope:`${config.network}:${config.resetIdentity}`,address,record,needed:previous?.status !== 'confirmed' || BigInt(lastWalletBalance?.total ?? 0) === 0n,importIncoming:id=>browserWallet.importIncoming(id)});
      if (credited?.complete && credited.checkedNow && browserWallet.active()?.address === address) await walletView();
    }
    if (record?.status === "confirmed" && previous?.status !== "confirmed") {
      lastIncomingBalanceCheck = 0;
      await refreshIncomingFunds();
    }
  } catch (error) {
    if (browserWallet.active()?.address === address) faucetUiError = {address, message: error.message};
  } finally {
    faucetWorking = false;
    renderFaucet();
  }
}
$("wallet-faucet").addEventListener("click", () => refreshFaucet(true));
setInterval(() => { renderFaucet(); refreshFaucet(); }, 4000);
function showWalletBalance(balance, version = ++walletBalanceVersion) {
  if (version !== walletBalanceVersion) return;
  const identity = browserWallet.active()?.address ?? null;
  if (identity !== lastWalletIdentity) { lastWalletBalance = null; lastWalletIdentity = identity; }
  if (balance && !balance.unavailable && balance.total !== undefined) { lastWalletBalance = balance; lastWalletCheckedAt = Date.now(); }
  if (balance?.unavailable && lastWalletBalance) balance = lastWalletBalance = { ...lastWalletBalance, unavailable: true };
  if (!browserWallet.active()) lastWalletBalance = null;
  const unlocked = Boolean(browserWallet.active()),
    visible = unlocked && balance !== null;
  $("wallet-balance-button").hidden = !visible;
  const available = config.posterPrivacy ? balance?.ready : balance?.ready ?? balance?.total;
  const value =
    available !== undefined
      ? units(available)
      : balance?.unavailable
        ? "Balance unavailable"
        : "Checking balance…";
  const totalValue = balance?.total !== undefined ? units(balance.total) : value;
  const heldOnly = !balance?.unavailable && !balance?.pendingOperation && BigInt(balance?.ready ?? 0) === 0n && BigInt(balance?.quarantined ?? 0) > 0n && balance.postingPolicy !== 'standard';
  const postingValue = heldOnly ? `${units(balance.quarantined)} remaining · held by posting setting` : value;
  const readiness = fundsReadiness(balance, {incomplete:scanIncomplete});
  const headline = balance?.unavailable ? 'Balance check unavailable' : readiness.code === 'ready' ? 'Ready to post' : heldOnly ? 'Enable your remaining tokens' : readiness.code === 'checking' ? 'Checking posting funds' : readiness.code === 'pending-operation' ? 'Checking your saved post' : 'Posting setup needed';
  const preparationPending = browserWallet.postingPreparationStatus().pending;
  $("wallet-prepare-panel").hidden = !visible || !config.posterPrivacy || (!preparationPending && BigInt(balance?.revealed ?? 0) < 11000000n);
  $("wallet-prepare").textContent = preparationPending ? "Check conversion status" : "Convert to posting funds";
  $("wallet-balance-value").textContent = visible ? headline : "";
  $('wallet-funds-title').textContent = headline;
  $('wallet-enable-posting').hidden = !visible || !heldOnly || Boolean(transactionPending);
  $('wallet-enable-help').hidden = $('wallet-enable-posting').hidden;
  $("wallet-balance-button").setAttribute("aria-label", visible ? `Wallet total: ${totalValue}. ${heldOnly ? postingValue : `Available for posting: ${value}`}.${balance?.unavailable ? " Last verified amounts; refreshing failed." : scanIncomplete ? " Checking funds; amounts may be incomplete." : ""} Open wallet details.` : "Open wallet details");
  $("wallet-posting-value").textContent = visible ? `Posting: ${postingValue}${balance?.unavailable ? " · Last checked" : scanIncomplete ? " · Checking funds…" : ""}` : "";
  $("wallet-ready-value").textContent = totalValue;
  $("wallet-ready-posting").textContent = value;
  for (const id of ["compose-wallet-balance", "reply-wallet-balance"]) {
    $(id).hidden = !visible;
    $(id).textContent = visible ? heldOnly ? `${postingValue}. Enable remaining tokens below to post.` : readiness.code === 'ready' ? `Ready to post · ${value} available in this browser` : balance?.unavailable ? 'Balance check unavailable. Your last verified funds and draft are kept.' : 'Posting setup needs attention below.' : "";
  }
  $('wallet-posting-policy').value = balance?.postingPolicy ?? browserWallet.getPostingPolicy?.() ?? 'isolated';
  const details = $("wallet-balance-details");
  details.replaceChildren();
  for (const [label, key] of [
    ["Total discovered", "total"],
    ["Available for posting", "ready"],
    ["Reserved for pending operations", "reserved"],
    [balance?.postingPolicy === 'standard' ? "Remaining change (included in available funds)" : "Change held separately", "quarantined"],
    ["Revealed account balance", "revealed"],
  ]) {
    if (balance?.[key] !== undefined)
      details.append(
        node("dt", "", label),
        node("dd", "", units(balance[key])),
      );
  }
  $('wallet-readiness').textContent = (heldOnly ? `You have ${units(balance.quarantined)} remaining. ` : '') + readiness.message + (!balance?.unavailable && scanIncomplete && readiness.code === 'ready' ? ' Incoming-fund discovery is incomplete; known usable funds are verified.' : '');
  if (!postIntentBusy && !busy && !fundsCheck) {
    showPostingWallet(readiness);
  }
  renderPostingFunding();
}
let refreshingIncoming = false;
let lastIncomingBalanceCheck = 0;
function fundsCheckFeedback(message) {
  $('wallet-funds-check-status').textContent = message;
  if(postIntentBusy || busy || transactionPending)return;
  for(const kind of ['compose','reply']) {
    if(['preparation-review','preparation-pending'].includes($(`${kind}-posting-status`).dataset.state))continue;
    showPostingHelp(kind,{code:'checking',message});
  }
}
async function checkPostingFunds({manual=false}={}) {
  const address=browserWallet.active()?.address;
  if(!address || walletOptions.adapter.connection)return;
  if(postIntentBusy || busy || transactionPending){
    const message='Your post is still being checked. Use Check status beside your draft; no extra submission or balance check was started.';
    $('wallet-funds-check-status').textContent=message;
    flash(message);return;
  }
  if(fundsCheck) return fundsCheck.promise;
  const entry={address,promise:null};fundsCheck=entry;
  const buttons=['wallet-sync-funds','compose-sync-posting','reply-sync-posting','compose-check-funds','reply-check-funds'].map($);
  buttons.forEach(button=>{button.disabled=true;button.textContent='Checking posting funds…';});
  fundsCheckFeedback('Checking this device’s posting funds…');
  entry.promise=(async()=>{
    let latest;
    try {
      latest=await browserWallet.privateBalance();
      if(browserWallet.active()?.address!==address)return;
      // A saved confirmed payment is checked before the broader network scan.
      // This reuses its original receipt and can never request another payment.
      const record=config.faucetEnabled && !latest.pendingOperation ? faucetClient.read(config,address) : null;
      if(BigInt(latest.total??0)===0n && record?.status==='confirmed' && /^[a-f0-9]{64}$/.test(record.transactionId??'')) {
        fundsCheckFeedback('Checking the test-token payment you already received…');
        await faucetCredit.reconcile({scope:`${config.network}:${config.resetIdentity}`,address,record,needed:true,force:manual,importIncoming:id=>browserWallet.importIncoming(id)});
        latest=await browserWallet.privateBalance();
      }
      if(browserWallet.active()?.address!==address)return;
      if(!latest.pendingOperation && fundsReadiness(latest,{incomplete:scanIncomplete}).code!=='change-held' && ((BigInt(latest.total??0)===0n && (!latest.discoveryCheckedAt || Date.now()-latest.discoveryCheckedAt>=60000)) || scanIncomplete || manual)) {
        fundsCheckFeedback('Looking for received tokens. This check continues automatically; your draft stays here.');
        try {
          const scan=await browserWallet.syncPrivateFunds({maxPages:1});
          scanIncomplete=scan.complete===false;
        } catch(error) {
          if(BigInt(latest.ready??0)===0n)throw error;
          scanIncomplete=true;
        }
        latest=await browserWallet.privateBalance();
      }
      if(browserWallet.active()?.address!==address)return;
      lastIncomingBalanceCheck=Date.now();
      showWalletBalance(latest);
      const reason=fundsReadiness(latest,{incomplete:scanIncomplete});
      const checked=`Checked ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}.`;
      $('wallet-funds-check-status').textContent=reason.code==='change-held' ? `${checked} Your tokens are already here. Enable your remaining tokens above; another refresh is not needed.` : `${checked} ${reason.message}${scanIncomplete && reason.code!=='ready' ? ' We will keep checking automatically.' : ''}`;
    } catch(error) {
      if(browserWallet.active()?.address!==address)return;
      lastIncomingBalanceCheck=Date.now();
      showWalletBalance({unavailable:true});
      $('wallet-funds-check-status').textContent='The check could not finish. Your existing tokens and draft are kept. Try Check posting funds again.';
      latest={...lastWalletBalance,unavailable:true};
    } finally {
      if(fundsCheck===entry)fundsCheck=null;
      buttons.forEach(button=>{button.disabled=false;button.textContent='Check posting funds';});
      if(browserWallet.active()?.address===address && latest && !postIntentBusy && !busy)showPostingWallet(fundsReadiness(latest,{incomplete:scanIncomplete}));
      renderFaucet();
    }
  })();
  return entry.promise;
}
async function refreshIncomingFunds() {
  if (refreshingIncoming || document.hidden || walletWorking || postIntentBusy || busy || transactionPending || !config?.posterPrivacy || !browserWallet.active() || browserWallet.needsPhraseConfirmation()) return;
  const address = browserWallet.active().address;
  refreshingIncoming = true;
  try {
    if(Date.now()-lastIncomingBalanceCheck < (scanIncomplete && !lastWalletBalance?.unavailable ? 5000 : 30000))return;
    await checkPostingFunds();
  } catch {
    if (browserWallet.active()?.address === address) showWalletBalance({ unavailable: true });
  } finally { refreshingIncoming = false; }
}
setInterval(refreshIncomingFunds, 2000);
window.addEventListener('focus', () => { lastIncomingBalanceCheck = 0; refreshIncomingFunds(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastIncomingBalanceCheck = 0; refreshIncomingFunds(); } });
function setWalletStep(step) {
  const changed = walletStep !== step;
  if (changed) clearWalletCredential();
  if (changed && !walletWorking) $("wallet-message").hidden = true;
  walletStep = step;
  const password = [
    "create",
    "unlock",
    "recover-pin",
    "show-phrase",
    "change-pin",
  ].includes(step);
  $("wallet-entry").hidden = step !== "entry";
  $("wallet-password-panel").hidden = !password;
  $("wallet-create").hidden = step !== "create";
  $("wallet-unlock").hidden = step !== "unlock";
  $("wallet-recover-panel").hidden = step !== "recover";
  $("wallet-recovery-review").hidden = step !== "recover-review";
  $("wallet-forgot-panel").hidden = step !== "forgot";
  $("wallet-seed-panel").hidden = step !== "seed";
  $("wallet-ready-panel").hidden = step !== "ready";
  $("wallet-delete-panel").hidden = step !== "delete";
  $("wallet-settings").hidden = [
    "create",
    "recover",
    "recover-pin",
    "recover-review",
    "forgot",
    "seed",
    "delete",
    "change-pin",
    "show-phrase",
  ].includes(step);
  $("wallet-save-pin").hidden = step !== "change-pin";
  $("wallet-back").hidden = ["entry", "ready", "seed"].includes(step);
  const titles = {
    entry: "Your wallet",
    create: "Create a wallet",
    unlock: "Unlock your wallet",
    recover: "Recover your wallet",
    "recover-pin": "Create a PIN",
    "recover-review": "Review wallet recovery",
    forgot: "Forgot your PIN?",
    seed: "Save your recovery phrase",
    ready: "Your wallet",
    "show-phrase": "View your recovery phrase",
    fund: "Authorize local test funding",
    "change-pin": "Set your six-digit PIN",
    delete: "Delete this browser wallet?",
  };
  $("browser-wallet-title").textContent = titles[step];
  $("wallet-step").textContent =
    step === "seed"
      ? "SAVE → VERIFY → READY"
      : step === "create"
        ? "PIN → BACKUP → READY"
        : "YOUR BROWSER SIGNS";
  const newPin = ["create", "recover-pin", "change-pin"].includes(step);
  const legacyPassword = !newPin && walletUnlockMethod === "password";
  $("wallet-password").autocomplete = newPin
    ? "new-password"
    : "current-password";
  $("wallet-password").required = password;
  $("wallet-password").removeAttribute("minlength");
  $("wallet-password").removeAttribute("maxlength");
  $("wallet-password").maxLength = legacyPassword ? 256 : 6;
  $("wallet-password").minLength = legacyPassword ? 12 : 6;
  $("wallet-password").pattern = legacyPassword ? ".{12,}" : "[0-9]{6}";
  $("wallet-password").inputMode = legacyPassword ? "text" : "numeric";
  $("wallet-keypad").hidden = legacyPassword;
  $("wallet-pin-display").classList.toggle("numeric-pin", !legacyPassword);
  $("wallet-pin-dots").hidden = legacyPassword;
  $("wallet-pin-status").hidden = legacyPassword;
  $("wallet-pin-back").hidden = true;
  $("wallet-password-label").textContent = legacyPassword
    ? "Original device password"
    : newPin
      ? "New device PIN · six digits"
      : "Device PIN · six digits";
  $("wallet-password-help").textContent = legacyPassword
    ? "This wallet uses an older password. Unlock it, then choose Set six-digit PIN in Wallet settings."
    : "Enter six digits using the keypad or keyboard. Your PIN unlocks this device.";
  $("wallet-create").hidden = true;
  $("wallet-save-pin").hidden = true;
  $("wallet-unlock").hidden = step !== "unlock" || !legacyPassword;
  $("wallet-introduction").hidden = !["entry", "ready", "forgot"].includes(step);
  $("wallet-recover-choice").hidden = false;
  // The recovery entry is also available under Unlock, without mixing the forms.
  if (step === "unlock") {
    $("wallet-entry").hidden = false;
    $("wallet-create-choice").hidden = true;
    $('wallet-password-panel').after($('wallet-entry'));
  } else $("wallet-create-choice").hidden = false;
  if(step!=='unlock')$('wallet-password-panel').before($('wallet-entry'));
  $('wallet-entry').querySelector('p').hidden=step==='unlock';
  $("wallet-show-seed").hidden =
    !browserWallet.active() || !["ready", "show-phrase"].includes(step);
  if (step === "show-phrase") {
    $("wallet-ready-panel").hidden = false;
    $("wallet-ready-panel")
      .querySelectorAll(":scope > *")
      .forEach(
        (el) =>
          (el.hidden =
            el.id !== "wallet-show-seed"),
      );
  } else
    $("wallet-ready-panel")
      .querySelectorAll(":scope > h3,:scope > p,:scope > details,:scope > .balance-grid")
      .forEach((el) => (el.hidden = false));
  $("wallet-return").hidden = step !== "ready" || !walletReturn;
  $('wallet-sync-funds').hidden = step === 'show-phrase';
  if (password && !legacyPassword && (changed || !pinEntry.active))
    pinEntry.start({ purpose: step, setup: newPin });
  else if ((!password || legacyPassword) && pinEntry.active) pinEntry.cancel();
  $("browser-wallet-dialog").dataset.step = step;
}
async function walletView() {
  if (!isSecureContext || !crypto.subtle || !navigator.locks) {
    $("wallet-controls").hidden = true;
    $("wallet-secure-context").hidden = false;
    $("identity").textContent = "Wallet needs a secure browser";
    return;
  }
  const wallet = browserWallet.active(),
    has = await browserWallet.exists();
  walletUnlockMethod = has ? await browserWallet.unlockMethod() : "pin";
  const balanceVersion = ++walletBalanceVersion;
  showWalletBalance(wallet ? wallet.address === lastWalletIdentity ? lastWalletBalance ?? {} : {} : null, balanceVersion);
  if (wallet) {
    if (
      !["seed", "show-phrase", "change-pin", "delete", "recover", "recover-pin", "recover-review", "forgot"].includes(
        walletStep,
      )
    )
      setWalletStep("ready");
  } else if (!["create", "recover", "recover-pin", "recover-review", "forgot", "delete"].includes(walletStep))
    setWalletStep(has ? "unlock" : "entry");
  $("identity").textContent = walletOptions.adapter.connection ? 'Sapient connected' : wallet
    ? "Posting on this device"
    : has || config.profile !== "local" || config.posterPrivacy
      ? has ? "Unlock to post" : "Set up posting"
      : `${config.label} · demo wallet`;
  $("browser-wallet-status").textContent = wallet
    ? browserWallet.needsPhraseConfirmation() ? walletStep === "seed" ? "Save your phrase, then confirm the requested word before continuing." : "Finish your recovery backup before publishing. Choose Finish recovery backup below." : "Unlocked. Keys stay on this device."
    : has
      ? walletUnlockMethod === "password"
        ? "Unlock with your original password. You can switch to a PIN in Wallet settings."
        : "Enter your PIN to continue. Your draft is kept."
      : "Set up this device, or restore with your recovery words.";
  $("wallet-lock").hidden = !wallet;
  $("wallet-show-seed").textContent = wallet && browserWallet.needsPhraseConfirmation() ? "Finish recovery backup" : "Show recovery phrase";
  $("wallet-forgot-pin").hidden = !has || walletStep !== "unlock";
  $("wallet-replace-saved-panel").hidden = !has;
  $("wallet-settings").hidden =
    !has || !["entry", "unlock", "ready"].includes(walletStep);
  $("wallet-change-pin").hidden = !wallet;
  $("wallet-change-pin").textContent =
    walletUnlockMethod === "password" ? "Set six-digit PIN" : "Change PIN";
  $("incoming-funds").hidden = !wallet || !config.posterPrivacy;
  $("private-receive-address").value = wallet?.address ?? "";
  renderFaucet();
  walletOptions.present();
  if (!wallet) return;
  if (config.posterPrivacy)
    scanIncomplete = !browserWallet.fundScanStatus().complete;
  try {
    if (config.posterPrivacy) {
      showWalletBalance(await browserWallet.privateBalance(), balanceVersion);
      const funds = browserWallet.privateFunds();
      $("wallet-output-status").textContent =
        `${funds.ready} incoming outputs ready · ${funds.quarantined} change outputs ${browserWallet.getPostingPolicy() === 'standard' ? 'available for posting' : 'held separately'} · ${funds.reserved} pending outputs`;
    } else {
      const value = await browserWallet.balance();
      showWalletBalance({ total: value, ready: value }, balanceVersion);
    }
  } catch (error) {
    showWalletBalance({ unavailable: true }, balanceVersion);
    throw error;
  }
}
async function openWallet() {
  if (!config) return;
  if (walletWorking) { flash("Finishing the local wallet action. Open Wallet again when it finishes."); return; }
  walletDialogGeneration++;
  clearWalletCredential();
  recoveryPlan = null;
  setWalletStep("entry");
  const generation = walletDialogGeneration;
  dialog("browser-wallet-dialog");
  walletOptions.refresh();
  try {
    await walletView();
    walletOptions.present();
    if (generation === walletDialogGeneration && $("browser-wallet-dialog").open && walletStep === "unlock" && $('browser-wallet-fallback').open) $("wallet-password").focus({ preventScroll: true });
  } catch (error) {
    flash(error.message, true);
  }
}
$("wallet-balance-button").addEventListener("click", openWallet);
$("browser-wallet-button").addEventListener("click", openWallet);
$("wallet-create-choice").addEventListener("click", () => {
  setWalletStep("create");
  $("wallet-password").focus();
});
$("wallet-recover-choice").addEventListener("click", () => {
  recoveryPlan = null;
  clearSeed();
  setWalletStep("recover");
  $("wallet-recovery-input").focus();
});
$("wallet-recovery-edit").addEventListener("click", () => {
  recoveryPlan = null;
  setWalletStep("recover");
  $("wallet-recovery-input").focus();
});
$("wallet-back").addEventListener("click", async () => {
  if (["recover-pin", "recover-review"].includes(walletStep)) {
    recoveryPlan = null;
    setWalletStep("recover");
    $("wallet-recovery-input").focus();
    return;
  }
  recoveryPlan = null;
  clearSeed();
  clearWalletCredential();
  walletStep = "entry";
  await walletView().catch((e) => flash(e.message, true));
});
function resumeWalletTask() {
  const target = walletReturn;
  if (!target) return;
  walletReturn = null;
  $("browser-wallet-dialog").close();
  if (target === "compose") openCompose(false);
  else $("reply-body").focus();
}
$("wallet-return").addEventListener("click", resumeWalletTask);
function walletAction(id, action, message) {
  const run = async (credential) => {
    if (walletWorking) return;
    const generation = walletDialogGeneration;
    const isCurrent = () => generation === walletDialogGeneration && $("browser-wallet-dialog").open;
    if (
      ([
        "wallet-create",
        "wallet-unlock",
        "wallet-restore",
        "wallet-save-pin",
      ].includes(id) ||
        (id === "wallet-show-seed" && walletStep === "show-phrase")) &&
      credential === undefined && id !== "wallet-restore" && !$("wallet-password").reportValidity()
    )
      return;
    walletWorking = true;
    document
      .querySelectorAll("#browser-wallet-dialog button")
      .forEach((b) => (b.disabled = true));
    $("wallet-message").hidden = false;
    $("wallet-message").classList.remove("error");
    $("wallet-message").textContent = message;
    try {
      const result = await action(credential ?? $("wallet-password").value, isCurrent);
      if (!isCurrent()) { browserWallet.lock(); return; }
      if (result?.credentialRequired) { $("wallet-message").hidden = true; return; }
      clearWalletCredential();
      if (result?.scan || typeof result?.complete === "boolean")
        scanIncomplete =
          result?.scan?.complete === false || result?.complete === false;
      await walletView();
      if (!isCurrent()) { browserWallet.lock(); return; }
      $("wallet-sync-funds").textContent = 'Check posting funds';
      $("wallet-message").textContent = result?.deleted
        ? "Wallet deleted from this browser." +
          (walletStep === "create"
            ? " Choose a new PIN to create a different wallet."
            : "")
        : id === "wallet-save-pin"
          ? "PIN updated. Your wallet and recovery phrase are unchanged."
          : id === "wallet-lock"
            ? "Wallet locked."
            : walletStep === "seed"
              ? "Save your words, then confirm the requested word before continuing."
              : scanIncomplete
                ? "Your wallet is ready on this device. Incoming funds are still being checked automatically."
                : result?.prepared
                  ? "Posting funds confirmed on Tari. Review your post to check its fee."
                  : walletStep === "seed"
                    ? "Save your words, then confirm the requested word before continuing."
                    : id === "wallet-lock"
                      ? "Wallet locked."
                      : id === "wallet-confirm-seed"
                        ? "Wallet setup complete. You can read now or add test funds when you want to publish."
                        : "Done. Your recovery phrase restores this wallet; your PIN unlocks it here.";
      if (["wallet-unlock", "wallet-confirm-seed", "wallet-restore"].includes(id) && walletReturn && !browserWallet.needsPhraseConfirmation()) resumeWalletTask();
    } catch (error) {
      if (!isCurrent()) return;
      $("wallet-message").textContent = error.message;
      $("wallet-message").classList.add("error");
      if (id === "wallet-restore") $("wallet-recovery-advanced").open = true;
      if (credential !== undefined) throw error;
    } finally {
      walletWorking = false;
      document
        .querySelectorAll("#browser-wallet-dialog button")
        .forEach((b) => (b.disabled = false));
      updateSeedConfirmation();
      updateDeleteConfirmation();
      renderFaucet();
      if (browserWallet.postingPreparationStatus().pending) {
        $("wallet-prepare").textContent = "Check conversion status";
        $("wallet-prepare-confirm").hidden = true;
      }
    }
  };
  walletActions.set(id, run);
  $(id).addEventListener("click", () => run().catch(() => {}));
}
function updateSeedConfirmation() {
  const correct =
    seedCheck &&
    $("wallet-seed-check").value.trim().toLowerCase() === seedCheck.word;
  $("wallet-confirm-seed").disabled =
    walletWorking || !$("wallet-seed-saved").checked || !correct;
}
function showSeed(phrase) {
  const words = phrase.split(" ");
  seedCheck = {
    index: crypto.getRandomValues(new Uint8Array(1))[0] % words.length,
    word: "",
  };
  seedCheck.word = words[seedCheck.index];
  $("wallet-seed-words").replaceChildren(
    ...words.map((word) => node("li", "", word)),
  );
  $("wallet-seed-saved").checked = false;
  $("wallet-seed-check").value = "";
  $("wallet-seed-check-label").textContent =
    `Confirm word ${seedCheck.index + 1} from your saved phrase`;
  $("wallet-confirm-seed").disabled = true;
  setWalletStep("seed");
  $("wallet-seed-panel").scrollIntoView({ block: "start" });
}
function clearSeed() {
  seedCheck = null;
  $("wallet-seed-words").replaceChildren();
  $("wallet-seed-check").value = "";
  $("wallet-seed-panel").hidden = true;
  $("wallet-recovery-input").value = "";
  $("wallet-seed-passphrase").value = "";
  $("wallet-expected-address").value = "";
  $("wallet-account-index").value = "0";
  $("wallet-recovery-address").textContent = "";
}
walletAction("wallet-recovery-next", async (_credential, isCurrent) => {
  if (transactionPending) throw new Error("Check the pending submission before recovering a wallet.");
  if (!$("wallet-account-index").reportValidity()) throw new Error("Enter a valid account index.");
  const details = {
    phrase: $("wallet-recovery-input").value,
    options: {
      format: $("wallet-recovery-format").value,
      seedPassphrase: $("wallet-seed-passphrase").value,
      accountIndex: Number($("wallet-account-index").value),
      expectedAddress: $("wallet-expected-address").value,
    },
  };
  const recovered = await browserWallet.inspectRecovery(details.phrase, details.options);
  const has = await browserWallet.exists();
  if (!isCurrent()) return;
  recoveryPlan = { ...details, address: recovered.address, pin: null };
  $("wallet-recovery-network").textContent = config.network === "esmeralda" ? "Esmeralda testnet" : "Isolated localnet";
  $("wallet-recovery-address").textContent = recovered.address;
  $("wallet-recovery-consequence").textContent = has
    ? "Recovering saves this wallet in place of the wallet currently saved on this browser. Keep the original wallet’s recovery phrase if you need it later."
    : "This saves the recovered wallet on this browser. Its on-chain funds and posts are unchanged.";
  setWalletStep("recover-pin");
  return { credentialRequired: true };
}, "Checking your recovery phrase on this device…");
walletAction(
  "wallet-create",
  async (password, isCurrent) => {
    const value = await browserWallet.create(password);
    scanIncomplete = false;
    if (isCurrent()) showSeed(value.phrase);
  },
  "Creating your wallet on this device…",
);
walletAction(
  "wallet-unlock",
  (password) => browserWallet.unlock(password),
  "Unlocking your wallet…",
);
walletAction("wallet-prepare", async () => {
  if (browserWallet.postingPreparationStatus().pending) {
    const result = await browserWallet.confirmPostingPreparation();
    $("wallet-prepare-confirm").hidden = true;
    $("wallet-prepare-review").textContent = "Posting funds confirmed on Tari.";
    return result;
  }
  const quote = await browserWallet.reviewPostingPreparation();
  if (quote.pending) return quote;
  $("wallet-prepare-review").textContent = `Convert ${units(quote.amount)} from your account into ${quote.outputs} posting outputs. Maximum transaction fee: ${units(quote.fee)}, paid from your account in addition to the amount moved. The rest stays in your account. This uses your existing native test TARI.`;
  $("wallet-prepare-confirm").hidden = false;
  return quote;
}, "Checking the conversion fee on Tari…");
walletAction("wallet-prepare-confirm", async () => {
  const result = await browserWallet.confirmPostingPreparation();
  $("wallet-prepare-confirm").hidden = true;
  $("wallet-prepare-review").textContent = "Posting funds confirmed on Tari.";
  return result;
}, "Converting to posting funds on Tari…");
$('wallet-posting-policy').addEventListener('change', async () => {
  const policy = $('wallet-posting-policy').value;
  try { await browserWallet.setPostingPolicy(policy); invalidateReview(); await walletView(); }
  catch (error) { $('wallet-posting-policy').value = browserWallet.getPostingPolicy(); flash(error.message, true); }
});
walletAction(
  "wallet-find-funds",
  () => browserWallet.importIncoming($("incoming-transaction").value.trim()),
  "Checking the incoming transaction…",
);
walletAction(
  "wallet-lock",
  () => {
    clearSeed();
    browserWallet.lock();
    roomManager.lock();
    walletStep = "entry";
  },
  "Locking your wallet…",
);
walletAction(
  "wallet-show-seed",
  async (password, isCurrent) => {
    if (walletStep !== "show-phrase") {
      setWalletStep("show-phrase");
      $("wallet-password").focus();
      return { credentialRequired: true };
    }
    const phrase = await browserWallet.recoveryPhrase(password);
    if (isCurrent()) showSeed(phrase);
  },
  "Checking your wallet unlock code…",
);
walletAction(
  "wallet-confirm-seed",
  async () => {
    if (
      !$("wallet-seed-saved").checked ||
      !seedCheck ||
      $("wallet-seed-check").value.trim().toLowerCase() !== seedCheck.word
    )
      throw new Error("Confirm the requested word from your saved phrase.");
    await browserWallet.confirmPhrase();
    clearSeed();
    setWalletStep("ready");
  },
  "Confirming your recovery backup locally…",
);
$("wallet-seed-saved").addEventListener("change", updateSeedConfirmation);
$("wallet-seed-check").addEventListener("input", updateSeedConfirmation);
walletAction(
  "wallet-restore",
  async (_password, isCurrent) => {
    if (transactionPending)
      throw new Error(
        "Check the pending submission before recovering a wallet.",
      );
    if (!$("wallet-account-index").reportValidity())
      throw new Error("Enter a valid account index.");
    if (!recoveryPlan?.pin || walletStep !== "recover-review") throw new Error("Check your recovery details and confirm a new PIN first.");
    const result = await browserWallet.recover(recoveryPlan.phrase, recoveryPlan.pin, { ...recoveryPlan.options, expectedAddress: recoveryPlan.address, replaceSavedWallet: true });
    recoveryPlan = null;
    clearSeed();
    if (isCurrent()) setWalletStep("ready");
    return result;
  },
  "Recovering your wallet and checking incoming funds…",
);
$('wallet-sync-funds').addEventListener('click',()=>checkPostingFunds({manual:true}));
$('wallet-enable-posting').addEventListener('click',async()=>{
  const button=$('wallet-enable-posting');button.disabled=true;
  try{await browserWallet.setPostingPolicy('standard');invalidateReview();await walletView();$('wallet-funds-check-status').textContent='Your remaining tokens are enabled. Return to your draft and press Post or Reply.';}
  catch(error){$('wallet-funds-check-status').textContent=error.message;}
  finally{button.disabled=false;}
});
$("browser-wallet-dialog").addEventListener("close", () => {
  walletDialogGeneration++;
  recoveryPlan = null;
  clearSeed();
  clearWalletCredential();
  $("wallet-delete-panel").hidden = true;
  $("wallet-delete-ack").checked = false;
});
function clearWalletCredential() {
  pinEntry.cancel();
  $("wallet-password").value = "";
}
$("wallet-password").addEventListener("keydown", (event) => {
  if (!pinEntry.active && event.key === "Enter") {
    event.preventDefault();
    $(walletStep === "show-phrase" ? "wallet-show-seed" : "wallet-unlock").click();
  }
});
$("wallet-change-pin").addEventListener("click", () => {
  setWalletStep("change-pin");
  $("wallet-password").focus();
});
walletAction(
  "wallet-save-pin",
  async (pin) => {
    await browserWallet.changePin(pin);
    setWalletStep("ready");
  },
  "Saving your PIN locally…",
);
function updateDeleteConfirmation() {
  $("wallet-delete-confirm").disabled =
    walletWorking || !$("wallet-delete-ack").checked;
}
$("wallet-delete-choice").addEventListener("click", () => {
  $("wallet-delete-ack").checked = false;
  setWalletStep("delete");
  updateDeleteConfirmation();
  $("wallet-delete-cancel").focus();
});
$("wallet-forgot-pin").addEventListener("click", () => {
  setWalletStep("forgot");
  $("wallet-forgot-recover").focus();
});
$("wallet-forgot-recover").addEventListener("click", () => $("wallet-recover-choice").click());
$("wallet-forgot-delete").addEventListener("click", () => $("wallet-delete-choice").click());
$("wallet-delete-ack").addEventListener("change", updateDeleteConfirmation);
$("wallet-delete-cancel").addEventListener("click", async () => {
  walletStep = "entry";
  await walletView().catch((e) => flash(e.message, true));
});
walletAction(
  "wallet-delete-confirm",
  async () => {
    if (!$("wallet-delete-ack").checked)
      throw new Error("Confirm that you understand recovery before deleting.");
    if (busy || transactionPending)
      throw new Error(
        "Check the pending submission before deleting this wallet.",
      );
    await browserWallet.deleteWallet();
    clearSeed();
    clearWalletCredential();
    invalidateReview();
    showWalletBalance(null);
    scanIncomplete = false;
    $("wallet-delete-ack").checked = false;
    setWalletStep("entry");
    return { deleted: true };
  },
  "Removing this browser's saved wallet…",
);
window.addEventListener("hauntboard-wallet-changed", () => {
  walletDialogGeneration++;
  recoveryPlan = null;
  clearSeed();
  clearWalletCredential();
  invalidateReview();
  showWalletBalance(null);
  walletStep = "entry";
  if (config) walletView().catch((e) => flash(e.message, true));
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && !walletWorking && !busy) {
    walletDialogGeneration++;
    recoveryPlan = null;
    clearSeed();
    clearWalletCredential();
    browserWallet.lock();
    showWalletBalance(null);
    walletStep = "entry";
    if (config) walletView().catch(() => {});
  }
});
$("keys-button").addEventListener("click", () => {
  $("keys-count").textContent =
    `${savedLocators.size} saved secret key${savedLocators.size === 1 ? "" : "s"} in this browser.`;
  dialog("keys-dialog");
});
$("export-keys").addEventListener("click", async () => {
  try {
    const entries = [];
    for (const thread of savedLocators) {
      const key = await keyFor(thread);
      if (key) entries.push({ thread, key });
    }
    const backup = await exportKeys(entries, $("backup-password").value);
    const link = node("a");
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
    );
    link.href = url;
    link.download = "hauntboard-secret-keys.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("backup-password").value = "";
    flash("Encrypted backup downloaded. Keep its password separately.");
  } catch (e) {
    flash(e.message, true);
  }
});
$("restore-keys").addEventListener("click", async () => {
  try {
    const file = $("restore-file").files[0];
    if (!file || file.size > 100000)
      throw new Error("Select a supported encrypted key backup.");
    const entries = await importKeys(
      JSON.parse(await file.text()),
      $("backup-password").value,
    );
    for (const entry of entries) await keepKey(entry.thread, entry.key);
    $("backup-password").value = "";
    $("keys-dialog").close();
    if (currentThread) await openThread(currentThread.address);
    else await refreshBoard();
    flash(`Restored ${entries.length} secret keys in this browser.`);
  } catch (e) {
    flash(e.message, true);
  }
});
$("privacy-button").addEventListener("click", () => {
  if (config.posterPrivacy) {
    info("What is private here?", [
      "Titles and categories are public. Public threads store readable messages; sealed threads store encrypted bodies. Schema 4 stores no author key. Accepted posts cannot be edited or deleted through Hauntboard. Testnet resets may remove history.",
      "Classic sealed invitations contain a shared key in the URL fragment. Send them through a trusted private channel. Room access adds recipient-specific encrypted invitations, a separate recovery vault and rotation for future messages. Old keys and plaintext cannot be revoked. Wallet recovery words do not restore either kind of room key; keep the appropriate encrypted backup and its recovery credential. Messages do not authenticate individual authors.",
      "Your browser signs posting fees with native one-time stealth spend keys. Your persistent owner signature and named account are omitted.",
      "Fees, spent-output graph, timing, public message clues and network connections remain visible. This does not prove complete anonymity.",
      "Standard posting can reuse remaining tokens, so the output graph may link posts. Reduce links between posts holds change aside instead. Existing wallets keep that setting until you change it. Your recovery phrase restores wallet keys; keep it private.",
    ]);
    return;
  }
  info("Secrets have boundaries.", [
    "Public threads publish the full title and text. Accepted posts cannot be edited or deleted through Hauntboard. Testnet resets may remove history.",
    "Sealed threads encrypt messages in this browser. Classic invitation keys grant history and future access. Managed Room access can rotate keys for future messages after member removal; retained history and copied keys cannot be erased.",
    "Transaction activity, signer linkage, reply relationships and timing remain visible. A display name is a pseudonym, not proof of anonymity.",
    ...(config.profile === "local"
      ? [
          "Private tips use separate demo-wallet stealth transfers. Fees and some metadata remain public. This is an isolated localnet demonstration.",
        ]
      : [
          "This testnet wallet signs locally. Public funding and private-tip compatibility have separate verification gates.",
        ]),
  ]);
});
$("network-button").addEventListener("click", () => {
  info(
    "Choose a doorway.",
    [
      "Paste a compatible board address, or a secret invitation URL. Invitation keys stay in this browser.",
    ],
    "LOCAL CLIENT SETTINGS",
  );
  for (const [i, address] of (config.legacyBoards ?? []).entries())
    $("info-content").append(
      button(`Open previous board ${i + 1}`, "secondary", async () => {
        boardAddress = address;
        $("info-dialog").close();
        try {
          await showBoard();
        } catch (e) {
          flash(e.message, true);
        }
      }),
    );
  const form = node("form");
  const label = node("label", "", "Board address or invitation");
  label.htmlFor = "locator";
  const input = node("input");
  input.id = "locator";
  input.required = true;
  const go = node("button", "primary full", "Open board or invitation");
  go.type = "submit";
  form.append(label, input, go);
  $("info-content").append(form);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const text = input.value.trim();
      if (component.test(text)) {
        boardAddress = text;
        $("info-dialog").close();
        await showBoard();
        return;
      }
      const link = new URL(text);
      const params = new URLSearchParams(link.hash.slice(1));
      const thread = params.get("thread"),
        key = params.get("key"),
        b = params.get("board");
      if (!component.test(thread ?? "") || !component.test(b ?? "") || !key)
        throw new Error("Use a board address or a complete secret invitation.");
      await acceptInvitation(thread, b, key);
      boardAddress = b;
      $("info-dialog").close();
      await openThread(thread);
    } catch (e) {
      flash(e.message, true);
    }
  });
});
function configureShell() {
  const demo = config.profile === "local" && !config.posterPrivacy;
  const network =
    config.network === "esmeralda" ? "Esmeralda testnet" : "Isolated localnet";
  $("network-label").textContent = network;
  $("review-network").textContent = network;
  $("beta-label").hidden = !config.testnetBeta;
  $("beta-label").textContent = "Beta · verification pending";
  $("runtime-label").textContent = config.providerRuntimeVersion
    ? `Runtime ${config.providerRuntimeVersion}`
    : "Test currency · no monetary value";
  $("notice-label").textContent = config.testnetBeta
    ? "TESTNET BETA"
    : demo
      ? "LOCAL DEMO"
      : "TEST NETWORK";
  $("notice-copy").textContent = config.posterPrivacy
    ? "Experimental test forum. Public posts are permanent. Use free test tokens only. Network activity can link posts."
    : demo
      ? "Real local contract transactions. Public text stays on chain; sealed messages are encrypted in your browser."
      : "Public posts are readable on this testnet. Testnet resets can remove history.";
  if (config.testnetBeta)
    $("notice-copy").textContent +=
      " Posting privacy verification is still pending; this does not guarantee anonymity.";
  $("wallet-button").hidden = !demo;
  $("keys-button").hidden = !(demo || config.posterPrivacy);
  $("other-client").hidden = !demo;
  document.querySelector(".mode-picker").hidden = !(
    demo || config.posterPrivacy
  );
  $('compose-visibility').hidden=document.querySelector('.mode-picker').hidden;
  for (const b of document.querySelectorAll(
    '[data-filter="public"],[data-filter="secret"]',
  ))
    b.hidden = !demo;
  $("include-address").checked = false;
  $("include-address").closest("label").hidden = !demo;
  $("post-name").hidden = !demo;
  document.querySelector('label[for="post-name"]').hidden = !demo;
  const sealed = document.querySelector('input[name=mode][value="1"]');
  sealed.disabled = !(demo || config.posterPrivacy);
  if (!demo)
    document.querySelector('input[name=mode][value="0"]').checked = true;
  $("compose-copy").textContent = demo
    ? "A story for everyone, or a secret for a few."
    : "Write your message below. Encrypted messages still have a public title and category.";
  $("wallet-disclosure").textContent = config.posterPrivacy
    ? "Your PIN and recovery words stay on this device. Standard posting reuses remaining tokens; network activity can link posts. Advanced posting settings can hold those tokens aside."
    : "Your wallet words, PIN and keys stay in this browser. Sealed-thread keys have a separate backup.";
  $("provider-label").textContent = config.provider;
  for (const id of [
    "home-board",
    "browser-wallet-button",
    "network-button",
    "refresh",
    "new-thread",
    "privacy-button",
  ])
    $(id).disabled = Boolean(config.preview);
  if (config.preview) {
    $("notice-label").textContent = "READ-ONLY PREVIEW";
    $("notice-copy").textContent =
      "Wallet and posting actions are unavailable in this deployment preview.";
  }
}
async function init() {
  if (transactionPending)
    operationState(
      transactionPending.accepted ? "indexing" : "unknown",
      "A saved submission needs checking. It will not be published again.",
    );
  try {
    config = await api("/api/config");
    browserWallet.configure(config, api);
    walletOptions.refresh();
    boardAddress ??= config.board;
    configureShell();
    await walletView().catch((error) => flash(error.message, true));
    document.body.dataset.ready = "true";
    const secret = new URLSearchParams(location.hash.slice(1));
    const invitedThread = secret.get("thread"),
      invitedKey = secret.get("key");
    const invitedRegistry=secret.get('registry'),invitedAdmin=secret.get('admin');
    if(invitedThread&&invitedRegistry){
      const invitedBoard=secret.get('board');
      if(!component.test(invitedThread)||!component.test(invitedBoard??'')||!component.test(invitedRegistry)||!/^[a-f0-9]{64}$/.test(invitedAdmin??''))throw Error('Invalid managed invitation.');
      history.replaceState({},'',`/?board=${invitedBoard}&thread=${invitedThread}`);
      const thread=await api(`/api/thread?address=${invitedThread}`);
      if(thread.board!==invitedBoard||!sealedThread(thread))throw Error('Invalid managed room binding.');
      boardAddress=invitedBoard;
      await roomManager.accept(thread,config,invitedRegistry,invitedAdmin);
    } else if (invitedThread && invitedKey) {
      if (!component.test(invitedThread))
        throw new Error("Invalid invitation.");
      const invitedBoard = secret.get("board") ?? boardAddress;
      if (!component.test(invitedBoard))
        throw new Error("Invalid invitation board.");
      history.replaceState(
        {},
        "",
        `/?board=${invitedBoard}&thread=${invitedThread}`,
      );
      await acceptInvitation(invitedThread, invitedBoard, invitedKey);
      boardAddress = invitedBoard;
    } else
      history.replaceState(
        { filter, showHidden, scroll: 0 },
        "",
        location.href,
      );
    await refreshBoard();
    const target =
      invitedThread ?? new URL(location.href).searchParams.get("thread");
    if (target) await openThread(target, { navigate: false });
  } catch (error) {
    flash(error.message, true);
    if (!config) {
      $("identity").textContent = "Wallet unavailable";
      $("network-label").textContent = "Network unavailable";
      $("notice-label").textContent = "UNAVAILABLE";
      $("notice-copy").textContent =
        "Configuration could not be loaded. Reload to try again; posting stays disabled.";
    }
    if (!board) {
      $("thread-list").replaceChildren(
        node(
          "div",
          "empty",
          "Could not reach this board. Reload or use Refresh threads when available.",
        ),
      );
      $("thread-list").firstElementChild.append(
        button("Retry loading", "subtle", () => location.reload()),
      );
    }
    $("thread-list").setAttribute("aria-busy", "false");
  }
  // Provider feed failures must not prevent recovery of an existing operation.
  if (config && transactionPending) await reconcilePending();
}
selectCategory(category);
await init();
