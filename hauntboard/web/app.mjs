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
import { PinEntry } from "./pin-entry.mjs";
import { createApiClient } from "./api-client.mjs";
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
let config,
  board,
  currentThread,
  filter = "all",
  showHidden = false,
  quote,
  publishContext,
  busy = false;
let threadRows = [];
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
      await keyFor(thread.address),
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
  const key = currentThread ? keys.get(currentThread.address) : null;
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
      $("refresh").disabled = !config;
      $("thread-list").setAttribute("aria-busy", "false");
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
    const loading = threadRows.some((row) => row.loading);
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
  boardAddress = thread.board;
  const key = await keyFor(thread.address);
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
          $("reply-form").dataset.parent = String(post.index);
          $("reply-context").textContent = `Replying to post ${post.index + 1}`;
          $("reply-target").hidden = false;
          $("reply-excerpt").textContent =
            content?.body.slice(0, 180) ?? "Sealed post";
          $("reply-body").focus();
        }),
      );
    }
    article.append(footer);
    posts.append(article);
  }
  $("invite-button").hidden = !(sealedThread(thread) && key);
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
  if (
    ((config.profile !== "local" || config.posterPrivacy) &&
      !browserWallet.active()) ||
    browserWallet.needsPhraseConfirmation()
  ) {
    walletReturn = body.kind === "thread" ? "compose" : "reply";
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
    await openWallet();
    $("wallet-message").hidden = false;
    $("wallet-message").textContent = browserWallet.needsPhraseConfirmation()
      ? "Save and confirm your recovery phrase before publishing. Use Show recovery phrase, then return to your post."
      : "Set up or unlock your wallet, then return to your preserved post to review its fee.";
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
      browserWallet.active() && body.kind !== "tip"
        ? await browserWallet.review(body)
        : await api("/api/quote", body);
    publishContext = { ...context, body, quote };
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
    $("review-wallet").textContent = quote.privateFee
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
    $("review-signing").textContent = quote.privateFee
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
    operationState(
      "review",
      "Review the exact content and fee before publishing.",
    );
    dialog("review-dialog");
  } finally {
    busy = false;
    buttons.forEach((b) => (b.disabled = false));
  }
}
async function pollTransaction(id, isBrowser = false) {
  for (let i = 0; i < 100; i++) {
    const tx = isBrowser
      ? await browserWallet.transaction(id)
      : await api(`/api/transaction?id=${id}`);
    if (!["New", "Pending"].includes(tx.status)) return tx;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    "Confirmation is taking longer than expected. The transaction is saved; refresh to check its status.",
  );
}
async function finishTransaction(pending) {
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
  const tx = await pollTransaction(pending.id, pending.browser);
  if (pending.browser) await walletView().catch(() => {});
  if (tx.status !== "Accepted") {
    localStorage.removeItem("hauntboard-pending");
    transactionPending = null;
    throw new Error(
      `The chain rejected this transaction (${tx.status}). Your draft remains available in this session.`,
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
  if (pending.kind === "thread") {
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
  operationState(
    "confirmed",
    pending.kind === "tip"
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
  busy = true;
  $("confirm-publish").disabled = true;
  $("review-edit").disabled = true;
  try {
    const context = publishContext;
    const body = context.body;
    const pending = {
      operation: context.quote.operation,
      browser: Boolean(context.quote.browser),
      kind: body.kind,
      board: body.board,
      uid: body.uid,
      thread: body.thread,
      nonce: body.nonce,
    };
    if (context.key) {
      // Keep the pending secret encrypted locally under a temporary canonical locator until its address is known.
      const temporary = `component_${context.quote.operation}`;
      await saveKey(temporary, context.key);
      pending.keyLocator = temporary;
    }
    localStorage.setItem("hauntboard-pending", JSON.stringify(pending));
    transactionPending = pending;
    operationState(
      "submitted",
      "Authorizing your reviewed submission. Do not publish it again.",
    );
    const sent = context.quote.browser
      ? await browserWallet.submit(context.quote)
      : await api("/api/submit", { quoteId: context.quote.id });
    pending.id = sent.transactionId;
    localStorage.setItem("hauntboard-pending", JSON.stringify(pending));
    $("review-dialog").close();
    operationState(
      "submitted",
      "Your post was submitted. Waiting for confirmation…",
    );
    const completed = { ...pending, key: context.key };
    await finishTransaction(completed);
  } catch (error) {
    $("review-dialog").close();
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
      ? `${space.remaining.toLocaleString()} bytes available · includes message formatting`
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
  if (transactionPending) return;
  quote = null;
  if (publishContext?.body) publishContext = null;
  $("confirm-publish").disabled = true;
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
  if (busy || transactionPending)
    return flash(
      "Finish the pending transaction before posting another message.",
      true,
    );
  try {
    const mode = Number(
        document.querySelector("input[name=mode]:checked").value,
      ),
      uid = randomId(),
      key = mode ? newThreadKey() : null;
    const content = composeContent();
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
      { key, content },
    );
  } catch (e) {
    fieldError("compose", e.message);
    operationError(e);
  }
});
$("reply-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy || transactionPending)
    return flash("Finish the pending transaction first.", true);
  try {
    const nonce = randomId(),
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
    const key = await keyFor(currentThread.address);
    const payload =
      currentThread.schema === 4 && sealedThread(currentThread)
        ? await sealPost(
            content,
            key,
            config,
            context,
            sealedMetadata(currentThread.posts[0].payload),
          )
        : await encodePost(content, currentThread.mode, key, context);
    await review(
      { kind: "reply", thread: currentThread.address, nonce, parent, payload },
      { content },
    );
  } catch (e) {
    fieldError("reply", e.message);
    operationError(e);
  }
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
$("compose-form").addEventListener("change", () => {
  $("compose-hint").textContent =
    document.querySelector("input[name=mode]:checked").value === "1"
      ? config.posterPrivacy
        ? "Title and category are public. Message body is encrypted locally."
        : "Secret title and body are encrypted locally."
      : "Public text is visible on chain.";
});
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
let walletWorking = false;
function showWalletBalance(balance, version = ++walletBalanceVersion) {
  if (version !== walletBalanceVersion) return;
  const identity = browserWallet.active()?.address ?? null;
  if (identity !== lastWalletIdentity) { lastWalletBalance = null; lastWalletIdentity = identity; }
  if (balance && !balance.unavailable && balance.total !== undefined) lastWalletBalance = balance;
  if (balance?.unavailable && lastWalletBalance) balance = { ...lastWalletBalance, unavailable: true };
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
  const preparationPending = browserWallet.postingPreparationStatus().pending;
  $("wallet-prepare-panel").hidden = !visible || !config.posterPrivacy || (!preparationPending && BigInt(balance?.revealed ?? 0) < 11000000n);
  $("wallet-prepare").textContent = preparationPending ? "Check conversion status" : "Convert to posting funds";
  $("wallet-balance-value").textContent = visible ? totalValue : "";
  $("wallet-balance-button").setAttribute("aria-label", visible ? `Wallet total: ${totalValue}. Available for posting: ${value}.${balance?.unavailable ? " Last verified amounts; refreshing failed." : scanIncomplete ? " Checking funds; amounts may be incomplete." : ""} Open wallet details.` : "Open wallet details");
  $("wallet-posting-value").textContent = visible ? `Posting: ${value}${balance?.unavailable ? " · Last checked" : scanIncomplete ? " · Checking funds…" : ""}` : "";
  $("wallet-ready-value").textContent = totalValue;
  $("wallet-ready-posting").textContent = value;
  for (const id of ["compose-wallet-balance", "reply-wallet-balance"]) {
    $(id).hidden = !visible;
    $(id).textContent = visible ? `Wallet balance: ${totalValue} · Available for posting: ${value}` : "";
  }
  const details = $("wallet-balance-details");
  details.replaceChildren();
  for (const [label, key] of [
    ["Total discovered", "total"],
    ["Available for posting", "ready"],
    ["Reserved for pending operations", "reserved"],
    ["Change held separately", "quarantined"],
    ["Revealed account balance", "revealed"],
  ]) {
    if (balance?.[key] !== undefined)
      details.append(
        node("dt", "", label),
        node("dd", "", units(balance[key])),
      );
  }
  $("wallet-readiness").textContent = balance?.unavailable
    ? "Funds could not be checked. Any displayed amounts are from the last successful check. Retry syncing before posting."
    : balance?.discoveryUnavailable
      ? "Known funds are verified. Incoming faucet funds could not be checked; retrying automatically."
    : balance?.discoveryCapacityReached
      ? "Known funds are verified. The wallet output limit prevents importing more incoming funds."
    : balance?.discoveryHistoryIncomplete
      ? "Available funds are verified. Some older faucet receipts are unavailable; older incoming funds may be missing."
    : scanIncomplete
      ? "Wallet recovered. Still checking for funds; this balance may be incomplete."
      : available === undefined
        ? "Checking available funds…"
        : BigInt(available) > 0n
          ? "Funds are available. Review a post to check its exact fee."
          : BigInt(balance?.revealed ?? 0) > 0n
            ? "Your funds are in a standard Tari account. Choose Convert to posting funds to make 10 test TARI available for posting."
            : "No funds are available for posting. Use Need test tokens? or check for incoming funds.";
}
let refreshingIncoming = false;
let lastIncomingBalanceCheck = 0;
async function refreshIncomingFunds() {
  if (refreshingIncoming || document.hidden || walletWorking || transactionPending || !config?.posterPrivacy || !browserWallet.active()) return;
  const address = browserWallet.active().address;
  refreshingIncoming = true;
  try {
    // Poll the small receipt feed every two seconds; a full verified balance
    // read is needed only on a new deposit or every thirty seconds.
    if (Date.now() - lastIncomingBalanceCheck < 30000) {
      const incoming = await browserWallet.syncFaucetFunds();
      if (!incoming.found) return;
    }
    const balance = await browserWallet.privateBalance();
    lastIncomingBalanceCheck = Date.now();
    if (browserWallet.active()?.address === address) showWalletBalance(balance);
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
    : "Use the keypad, keyboard or number pad. Six digits advance automatically. Your PIN unlocks this browser.";
  $("wallet-create").hidden = true;
  $("wallet-save-pin").hidden = true;
  $("wallet-unlock").hidden = step !== "unlock" || !legacyPassword;
  $("wallet-introduction").hidden = !["entry", "ready", "forgot"].includes(step);
  $("wallet-recover-choice").hidden = false;
  // The recovery entry is also available under Unlock, without mixing the forms.
  if (step === "unlock") {
    $("wallet-entry").hidden = false;
    $("wallet-create-choice").hidden = true;
  } else $("wallet-create-choice").hidden = false;
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
  $("identity").textContent = wallet
    ? "Browser wallet unlocked"
    : has || config.profile !== "local" || config.posterPrivacy
      ? "Browser wallet locked"
      : `${config.label} · demo wallet`;
  $("browser-wallet-status").textContent = wallet
    ? browserWallet.needsPhraseConfirmation() ? walletStep === "seed" ? "Save your phrase, then confirm the requested word before continuing." : "Finish your recovery backup before publishing. Choose Finish recovery backup below." : "Unlocked. Keys stay on this device."
    : has
      ? walletUnlockMethod === "password"
        ? "Unlock with your original password. You can switch to a PIN in Wallet settings."
        : "Your PIN unlocks this browser. Publishing always has a separate review."
      : "Create a wallet or recover with your Tari L2 seed phrase.";
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
  if (!wallet) return;
  if (config.posterPrivacy)
    scanIncomplete = !browserWallet.fundScanStatus().complete;
  try {
    if (config.posterPrivacy) {
      showWalletBalance(await browserWallet.privateBalance(), balanceVersion);
      const funds = browserWallet.privateFunds();
      $("wallet-output-status").textContent =
        `${funds.ready} incoming outputs ready · ${funds.quarantined} change outputs held separately · ${funds.reserved} pending outputs`;
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
  try {
    await walletView();
    if (generation === walletDialogGeneration && $("browser-wallet-dialog").open && walletStep === "unlock") $("wallet-password").focus({ preventScroll: true });
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
      $("wallet-sync-funds").textContent = scanIncomplete
        ? "Continue syncing"
        : "Check for incoming funds";
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
                ? "Wallet recovered. Still checking for funds. Choose Continue syncing."
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
walletAction(
  "wallet-sync-funds",
  () => browserWallet.syncPrivateFunds(),
  "Checking for incoming funds…",
);
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
      "Sealed invitations contain a shared key in the URL fragment. Send it through a trusted private channel. Every key holder can read past and future messages and share the key. There is no revocation or author authentication. Wallet recovery words do not restore invitation keys; use the separate key backup.",
      "Your browser signs posting fees with native one-time stealth spend keys. Your persistent owner signature and named account are omitted.",
      "Fees, spent-output graph, timing, public message clues and network connections remain visible. This does not prove complete anonymity.",
      "Each separately received output funds one post. Change stays held separately to avoid linking another post. Your recovery phrase restores wallet keys; keep it private.",
    ]);
    return;
  }
  info("Secrets have boundaries.", [
    "Public threads publish the full title and text. Accepted posts cannot be edited or deleted through Hauntboard. Testnet resets may remove history.",
    "Sealed threads encrypt messages in this browser. Every invitation-key holder can read the full history and future messages. There is no member revocation.",
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
    ? "Public content, private wallet keys. Fees, spent-output links, timing and network connections remain visible."
    : demo
      ? "Real local contract transactions. Public text stays on chain; sealed messages are encrypted in your browser."
      : "Public posts are readable on this testnet. Testnet resets can remove history.";
  if (config.testnetBeta)
    $("notice-copy").textContent +=
      " Public posting privacy verification remains pending.";
  $("wallet-button").hidden = !demo;
  $("keys-button").hidden = !(demo || config.posterPrivacy);
  $("other-client").hidden = !demo;
  document.querySelector(".mode-picker").hidden = !(
    demo || config.posterPrivacy
  );
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
    : "Choose a public message or an encrypted body. Thread titles and categories are always public.";
  $("wallet-disclosure").textContent = config.posterPrivacy
    ? "One incoming output funds one post. Change stays held separately to avoid linking another post. Your words, PIN and keys never go to the relay."
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
    boardAddress ??= config.board;
    configureShell();
    await walletView().catch((error) => flash(error.message, true));
    document.body.dataset.ready = "true";
    const secret = new URLSearchParams(location.hash.slice(1));
    const invitedThread = secret.get("thread"),
      invitedKey = secret.get("key");
    if (invitedThread && invitedKey) {
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
