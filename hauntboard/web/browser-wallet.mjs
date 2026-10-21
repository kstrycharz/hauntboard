// Test-network wallet. Tari owns all key/signature/BOR operations; WebCrypto protects local storage.
import * as sdk from "./vendor/wallet-sdk.mjs";
import { networkProfile, networkKey } from "./network-profile.mjs";
import { prepareStealthFee, NATIVE } from "./stealth-fee.mjs";
import {
  transactionIdentity,
  transactionMetadata,
} from "./transaction-identity.mjs";
import { scanOutputLedger } from "./output-ledger.mjs";
import { decryptFaucetDiscovery, discoverFaucetOutputs } from "./faucet-discovery.mjs";
import { envelopeEntries } from './key-registry.mjs';
import {providerState} from './provider-state.mjs';
import {
  newPhrase,
  keysFromPhrase,
  RECOVERY_FORMAT,
  accountFromPublicKey,
} from "./wallet-recovery.mjs";
let config, api, material, signer, signingOwner, signingView;
let storageSession;
const dbName = "hauntboard-browser-wallet-v1";
const hex = (bytes) =>
  Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (text) => {
  if (!/^[a-f0-9]{64}$/.test(text))
    throw new Error("Invalid wallet recovery key.");
  return Uint8Array.from(text.match(/../g), (x) => parseInt(x, 16));
};
function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(dbName, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("wallet");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function stored(value) {
  const d = await db();
  try {
    return await new Promise((resolve, reject) => {
      const tx = d.transaction(
          "wallet",
          value === undefined ? "readonly" : "readwrite",
        ),
        store = tx.objectStore("wallet");
      let request =
        value === undefined
          ? store.get(networkKey(config))
          : store.put(value, networkKey(config));
      let result;
      request.onsuccess = () => {
        result = request.result;
        if (value === undefined && !result && config.network === "localnet") {
          request = store.get("localnet");
          request.onsuccess = () => {
            result = request.result;
          };
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    d.close();
  }
}
const coordinated = (action) =>
  navigator.locks.request(`${dbName}:${networkKey(config)}`, action);
const fundingKey = () =>
  config.network === "localnet"
    ? "hauntboard-wallet-funding"
    : `hauntboard-wallet-funding:${networkKey(config)}`;
const metadata = () => ({ v: 2, ...networkProfile(config) });
const aad = (value) =>
  new TextEncoder().encode(
    value.v === 1
      ? dbName
      : `${dbName}|${networkKey(value)}|${value.networkByte}${value.walletAddress ? `|${value.walletAddress}` : ``}${value.unlockMethod ? `|${value.unlockMethod}` : ``}`,
  );
async function passwordKey(password, salt) {
  if (!/^\d{6}$/.test(password) && password.length < 12)
    throw new Error(
      "Enter a six-digit PIN, or the original password for an older wallet.",
    );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", iterations: 600000, salt },
    key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
async function encrypt(value, password) {
  const salt = crypto.getRandomValues(new Uint8Array(32)),
    iv = crypto.getRandomValues(new Uint8Array(12)),
    header = {
      ...metadata(),
      walletAddress: value.address,
      unlockMethod: /^\d{6}$/.test(password) ? "pin" : "password",
    };
  const plain = new TextEncoder().encode(
    JSON.stringify({ ...value, ...header }),
  );
  try {
    return {
      ...header,
      salt: [...salt],
      iv: [...iv],
      ct: [
        ...new Uint8Array(
          await crypto.subtle.encrypt(
            { name: "AES-GCM", iv, additionalData: aad(header) },
            await passwordKey(password, salt),
            plain,
          ),
        ),
      ],
    };
  } finally {
    plain.fill(0);
  }
}
async function decrypt(value, password) {
  const bytes = (v, min, max) =>
    Array.isArray(v) &&
    v.length >= min &&
    v.length <= max &&
    v.every((x) => Number.isInteger(x) && x >= 0 && x <= 255);
  if (
    !value ||
    ![1, 2].includes(value.v) ||
    value.network !== config.network ||
    (value.v === 1 && config.network !== "localnet") ||
    (value.v === 2 &&
      networkKey(networkProfile(value)) !== networkKey(config)) ||
    !bytes(value.salt, 32, 32) ||
    !bytes(value.iv, 12, 12) ||
    !bytes(value.ct, 16, 10000)
  )
    throw new Error(
      "Use an intact Hauntboard wallet backup for this network and reset.",
    );
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Uint8Array.from(value.iv),
        additionalData: aad(value),
      },
      await passwordKey(password, Uint8Array.from(value.salt)),
      Uint8Array.from(value.ct),
    ),
  );
  try {
    const recovered = JSON.parse(new TextDecoder().decode(plain));
    if (
      recovered.network !== config.network ||
      (value.v === 2 &&
        (networkKey(recovered) !== networkKey(value) ||
          recovered.networkByte !== value.networkByte))
    )
      throw new Error("Wallet network metadata mismatch.");
    if (value.walletAddress && value.walletAddress !== recovered.address)
      throw new Error("Wallet address metadata mismatch.");
    return recovered;
  } finally {
    plain.fill(0);
  }
}
function activate(value) {
  const owner = unhex(value.owner),
    view = unhex(value.view);
  try {
    const pub = sdk.ootlePublicKeyFromSecretKey(owner, view);
    try {
      const address = sdk.generateOotleAddress(
        pub.owner_key,
        pub.view_key,
        config.networkByte,
      );
      if (value.address !== address)
        throw new Error("Wallet recovery address does not match its keys.");
      if (value.publicKey !== hex(pub.owner_key))
        throw new Error("Wallet public key does not match its recovery keys.");
      lock();
      material = value;
      signingOwner = new Uint8Array(owner);
      signingView = new Uint8Array(view);
      signer = sdk.SecretKeyWallet.fromSecretKey(
        signingOwner,
        config.networkByte,
        signingView,
      );
    } finally {
      pub.free();
    }
  } finally {
    owner.fill(0);
    view.fill(0);
  }
}
export function configure(c, call) {
  const p = networkProfile(c);
  if (config && networkKey(config) !== networkKey(p)) lock();
  config = { ...c, ...p };
  api = call;
}
export function active() {
  return material
    ? {
        address: material.address,
        account: material.account,
        publicKey: material.publicKey,
      }
    : null;
}
export async function exists() {
  return Boolean(await stored());
}
export async function unlockMethod() {
  return (await stored())?.unlockMethod === "pin" ? "pin" : "password";
}
async function enablePersistence(password) {
  const record = await stored();
  storageSession = {
    salt: record.salt,
    unlockMethod: record.unlockMethod,
    key: await passwordKey(password, Uint8Array.from(record.salt)),
  };
}
async function refreshPrivateMaterial() {
  if (!privateMode() || !material || !storageSession) return;
  const record = await stored();
  if (
    !record ||
    JSON.stringify(record.salt) !== JSON.stringify(storageSession.salt) ||
    networkKey(record) !== networkKey(config)
  )
    throw new Error("Wallet storage changed in another tab. Unlock it again.");
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Uint8Array.from(record.iv),
        additionalData: aad(record),
      },
      storageSession.key,
      Uint8Array.from(record.ct),
    ),
  );
  try {
    const latest = JSON.parse(new TextDecoder().decode(plain));
    validateMaterial(latest);
    if (latest.address !== material.address)
      throw new Error("Wallet identity changed. Unlock it again.");
    material.coins = latest.coins ?? [];
    material.scanCursor = latest.scanCursor ?? null;
    material.scanComplete = latest.scanComplete ?? false;
    material.faucetClaimed = latest.faucetClaimed ?? false;
  } finally {
    plain.fill(0);
  }
}
async function persistMaterial() {
  if (!storageSession || !material)
    throw new Error("Unlock this wallet before updating private funds.");
  const header = {
      ...metadata(),
      walletAddress: material.address,
      ...(storageSession.unlockMethod
        ? { unlockMethod: storageSession.unlockMethod }
        : {}),
    },
    iv = crypto.getRandomValues(new Uint8Array(12)),
    plain = new TextEncoder().encode(
      JSON.stringify({ ...material, ...header }),
    );
  try {
    await stored({
      ...header,
      salt: storageSession.salt,
      iv: [...iv],
      ct: [
        ...new Uint8Array(
          await crypto.subtle.encrypt(
            { name: "AES-GCM", iv, additionalData: aad(header) },
            storageSession.key,
            plain,
          ),
        ),
      ],
    });
  } finally {
    plain.fill(0);
  }
}
async function phraseMaterial(phrase, options) {
  const keys = await keysFromPhrase(phrase, options);
  try {
    const pub = sdk.ootlePublicKeyFromSecretKey(keys.owner, keys.view);
    try {
      return {
        ...metadata(),
        owner: hex(keys.owner),
        view: hex(keys.view),
        publicKey: hex(pub.owner_key),
        address: sdk.generateOotleAddress(
          pub.owner_key,
          pub.view_key,
          config.networkByte,
        ),
        account: null,
        candidateAccount: await accountFromPublicKey(pub.owner_key),
        phrase: keys.phrase,
        recoveryFormat: keys.recoveryFormat,
        accountIndex: keys.accountIndex,
        recoveryConfirmed: false,
        coins: [],
      };
    } finally {
      pub.free();
    }
  } finally {
    keys.owner.fill(0);
    keys.view.fill(0);
  }
}
export async function create(password) {
  return coordinated(async () => {
    if (await stored())
      throw new Error(
        "A wallet already exists in this browser. Unlock or recover it.",
      );
    const value = await phraseMaterial(await newPhrase(), { format: "native" });
    await stored(await encrypt(value, password));
    activate(value);
    await enablePersistence(password);
    return { ...active(), phrase: value.phrase };
  });
}
export function needsPhraseConfirmation() {
  return Boolean(material?.phrase) && !material.recoveryConfirmed;
}
export async function confirmPhrase() {
  return coordinated(async () => {
    requireSigner();
    await refreshPrivateMaterial();
    if (!material.phrase)
      throw new Error(
        "This older wallet has no seed phrase. Its original keys are preserved.",
      );
    material.recoveryConfirmed = true;
    await persistMaterial();
  });
}
export async function recoveryPhrase(password) {
  return coordinated(async () => {
    const value = await unlockStored(password);
    if (!value.phrase)
      throw new Error(
        "This older wallet predates seed recovery. Its keys are preserved; it cannot be converted without changing its identity.",
      );
    return value.phrase;
  });
}
export async function recover(phrase, password, options = {}) {
  return coordinated(async () => {
    const value = await phraseMaterial(phrase, {
      format: "native",
      ...options,
    });
    if (
      options.expectedAddress?.trim() &&
      options.expectedAddress.trim() !== value.address
    )
      throw new Error(
        "The recovered address does not match. Check the seed format, passphrase, account index and network. Your saved wallet was not changed.",
      );
    const saved = await stored();
    if (saved && options.replaceSavedWallet === true) assertNoPendingWalletOperations();
    if (saved && !(options.replaceSavedWallet === true && saved.walletAddress !== value.address)) {
      if (saved.walletAddress && saved.walletAddress !== value.address)
        throw new Error(
          "Tick Replace saved wallet to recover this seed phrase on this device.",
        );
      let existing;
      try {
        existing = await decrypt(saved, password);
      } catch {
        if (saved.walletAddress !== value.address)
          throw new Error(
            "Tick Replace saved wallet to recover this phrase with a new PIN.",
          );
      }
      if (existing) {
        if (existing.address !== value.address)
          throw new Error(
            "Tick Replace saved wallet to recover this seed phrase on this device.",
          );
        value.account = existing.account;
        value.coins = existing.coins ?? [];
        value.faucetClaimed = existing.faucetClaimed ?? false;
      }
    }
    value.recoveryConfirmed = true;
    await stored(await encrypt(value, password));
    activate(value);
    await enablePersistence(password);
    notifyWalletChange();
    await reconcilePrivatePending();
    let scan;
    try {
      scan = privateMode() ? await scanOwnedOutputs() : null;
    } catch {
      scan = { complete: false, unavailable: true };
    }
    return { ...active(), scan };
  });
}
// Validate recovery locally without replacing, activating, or persisting a wallet.
export async function inspectRecovery(phrase, options = {}) {
  const keys = await keysFromPhrase(phrase, { format: "native", ...options });
  try {
    const pub = sdk.ootlePublicKeyFromSecretKey(keys.owner, keys.view);
    try {
      const address = sdk.generateOotleAddress(pub.owner_key, pub.view_key, config.networkByte);
      if (options.expectedAddress?.trim() && options.expectedAddress.trim() !== address)
        throw new Error("The recovered address does not match. Check the phrase, passphrase, account index and network. Your saved wallet was not changed.");
      return { address, accountIndex: keys.accountIndex };
    } finally { pub.free(); }
  } finally { keys.owner.fill(0); keys.view.fill(0); }
}
export async function unlock(password) {
  return coordinated(async () => {
    const recovered = await unlockStored(password);
    validateMaterial(recovered);
    await validateAccount(recovered);
    activate(recovered);
    await enablePersistence(password);
    await reconcilePrivatePending();
    return active();
  });
}
async function unlockStored(password) {
  const record = await stored();
  try { return await decrypt(record, password); }
  catch (error) {
    if (error.name === "OperationError")
      throw new Error(record?.unlockMethod === "pin" ? "Incorrect PIN. Try again." : "Incorrect password. Try again.");
    throw error;
  }
}
export async function verifyCredential(password) {
  return coordinated(async () => { await unlockStored(password); });
}
export function lock() {
  preparationQuote = null;
  signingOwner?.fill(0);
  signingView?.fill(0);
  signingOwner = null;
  signingView = null;
  material = null;
  signer = null;
  storageSession = null;
}
const walletChangeKey = () => `hauntboard-wallet-changed:${networkKey(config)}`;
function notifyWalletChange() {
  localStorage.setItem(walletChangeKey(), crypto.randomUUID());
}
window.addEventListener("storage", (event) => {
  if (config && event.key === walletChangeKey()) {
    lock();
    window.dispatchEvent(new Event("hauntboard-wallet-changed"));
  }
});
export async function changePin(pin) {
  return coordinated(async () => {
    if (!/^\d{6}$/.test(pin)) throw new Error("Choose a six-digit PIN.");
    requireSigner();
    await refreshPrivateMaterial();
    await stored(await encrypt(material, pin));
    await enablePersistence(pin);
    notifyWalletChange();
  });
}
function assertNoPendingWalletOperations() {
    if (
      localStorage.getItem("hauntboard-pending") ||
      localStorage.getItem(fundingKey()) ||
      localStorage.getItem(`${fundingKey()}:prepare`) ||
      localStorage.getItem(`${fundingKey()}:stealth`)
    )
      throw new Error(
        "Check pending posting or funding before deleting this wallet.",
      );
    const prefix = `hauntboard-private-post:${networkKey(config)}:`;
    for (let i = 0; i < localStorage.length; i++)
      if (localStorage.key(i)?.startsWith(prefix))
        throw new Error(
          "Reconcile pending wallet submissions before deleting this wallet.",
        );
}
export async function deleteWallet() {
  return coordinated(async () => {
    assertNoPendingWalletOperations();
    const d = await db();
    try {
      await new Promise((resolve, reject) => {
        const tx = d.transaction("wallet", "readwrite"),
          store = tx.objectStore("wallet");
        store.delete(networkKey(config));
        if (config.network === "localnet") store.delete("localnet");
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      d.close();
    }
    lock();
    notifyWalletChange();
  });
}
export async function backup(password) {
  return coordinated(async () => {
    if (!material) throw new Error("Unlock the wallet first.");
    await refreshPrivateMaterial();
    return encrypt(material, password);
  });
}
export async function restore(value, password) {
  return coordinated(async () => {
    const recovered = await decrypt(value, password);
    validateMaterial(recovered);
    const saved = await stored();
    if (saved) {
      const existing = await decrypt(saved, password);
      if (existing.address !== recovered.address)
        throw new Error(
          "A different wallet is saved here. Export it and use a separate browser profile to recover another identity.",
        );
      if (existing.account && !recovered.account)
        recovered.account = existing.account;
      const merged = new Map((recovered.coins ?? []).map((c) => [c.id, c]));
      for (const coin of existing.coins ?? []) {
        if (coin.state !== "ready" || !merged.has(coin.id))
          merged.set(coin.id, coin);
      }
      recovered.coins = [...merged.values()];
    }
    await validateAccount(recovered);
    await stored(await encrypt(recovered, password));
    activate(recovered);
    await enablePersistence(password);
    await reconcilePrivatePending();
    return active();
  });
}
function validateMaterial(value) {
  if (
    value.coins !== undefined &&
    (!Array.isArray(value.coins) ||
      value.coins.length > 32 ||
      value.coins.some(
        (c) =>
          !/^utxo_0101010101010101010101010101010101010101010101010101010101010101_[a-f0-9]{64}$/.test(
            c.id,
          ) || !["ready", "reserved", "used", "quarantined"].includes(c.state),
      ))
  )
    throw new Error("Invalid wallet fee outputs.");
  const owner = unhex(value.owner),
    view = unhex(value.view);
  try {
    const pub = sdk.ootlePublicKeyFromSecretKey(owner, view);
    try {
      if (
        value.address !==
          sdk.generateOotleAddress(
            pub.owner_key,
            pub.view_key,
            config.networkByte,
          ) ||
        value.publicKey !== hex(pub.owner_key)
      )
        throw new Error("Wallet recovery keys do not match its identity.");
      if (
        value.account !== null &&
        !/^component_[a-f0-9]{64}$/.test(value.account)
      )
        throw new Error("Invalid recovered account.");
    } finally {
      pub.free();
    }
  } finally {
    owner.fill(0);
    view.fill(0);
  }
}
async function validateAccount(value) {
  if (!value.account) return;
  const state = await provider.getSubstate(value.account);
  if (
    state.verified !== true ||
    state.substate?.Component?.header.owner_rule?.ByPublicKey !==
      value.publicKey
  )
    throw new Error("The recovered account does not belong to this wallet.");
}
const provider = {
  network: () => config.networkByte,
  getCurrentEpoch: async () =>
    (await api("/api/indexer", { method: "GET", path: "epoch-manager/stats" }))
      .current_epoch,
  getSubstate: async (id) =>
    providerState(await api("/api/indexer", { method: "GET", path: `substates/${id}` })),
  getStealthUtxo: async (resource, commitment) =>
    provider.getSubstate(sdk.stealthUtxoSubstateId(resource, commitment)),
  resolveInputs: async (inputs) =>
    Promise.all(
      inputs.map(async (i) => ({
        ...i,
        version:
          i.version ?? (await provider.getSubstate(i.substate_id)).version,
      })),
    ),
  submitTransaction: async (transaction) =>
    api("/api/indexer", {
      method: "POST",
      path: "transactions",
      body: { transaction },
    }),
  getTransactionResult: async (id) =>
    api("/api/indexer", { method: "GET", path: `transactions/${id}/result` }),
};
function requireSigner() {
  if (!signer) throw new Error("Unlock your browser wallet first.");
}
async function requireNetwork() {
  const identity = await api("/api/indexer", {
    method: "GET",
    path: "network",
  });
  if (
    identity.network !== config.network ||
    identity.network_byte !== config.networkByte
  )
    throw new Error("Provider changed network. Signing is disabled.");
}
function input(id) {
  return { substate_id: id, version: null, is_write: true };
}
const nonce = () => BigInt(crypto.getRandomValues(new Uint32Array(1))[0]);
async function ownedInputs() {
  const state = await provider.getSubstate(material.account);
  if (
    state.verified !== true ||
    state.substate?.Component?.header.owner_rule?.ByPublicKey !==
      material.publicKey
  )
    throw new Error("The recovered account does not belong to this wallet.");
  return [
    input(material.account),
    ...[...sdk.iterVaultIdsInState(state.substate.Component.body.state)].map(
      input,
    ),
  ];
}
export async function balance() {
  if (!material?.account) return "0";
  const inputs = await ownedInputs();
  let total = 0n;
  for (const i of inputs.filter((i) => i.substate_id.startsWith("vault_"))) {
    const row = await provider.getSubstate(i.substate_id);
    if (row.verified !== true) throw new Error("Unverified wallet balance.");
    const vault = row.substate.Vault.resource_container.Stealth;
    if (vault?.address === `resource_${"01".repeat(32)}`)
      total += BigInt(vault.revealed_amount);
  }
  return total.toString();
}
const privateMode = () => config.posterPrivacy === "stealth-fee-v1";
const privatePendingKey = () =>
  `hauntboard-private-post:${networkKey(config)}:${material.publicKey}`;
async function reconcilePrivatePending() {
  if (!privateMode() || !material) return;
  const pending = JSON.parse(
    localStorage.getItem(privatePendingKey()) ?? "null",
  );
  if (!pending) return;
  try {
    const operation = await api(`/api/operation?id=${pending.operation}`),
      id = pending.id ?? operation.transactionId;
    if (id) await transactionResult(id);
  } catch {
    /* Preserve the exact pending intent during an outage; unlocking remains possible. */
  }
}
export function fundScanStatus() {
  return { complete: material?.scanComplete === true };
}
export function privateFunds() {
  return {
    ready: (material?.coins ?? []).filter((c) => c.state === "ready").length,
    quarantined: (material?.coins ?? []).filter(
      (c) => c.state === "quarantined",
    ).length,
    reserved: (material?.coins ?? []).filter((c) => c.state === "reserved")
      .length,
  };
}
export async function privateBalance() {
  return coordinated(async () => {
  requireSigner();
  await refreshPrivateMaterial();
  await requireNetwork();
  await discoverExistingAccount();
  let discovery;
  try { discovery = await discoverFaucetFunds(); }
  catch { discovery = { unavailable: true }; }
  const native = new sdk.WasmStealthCrypto(config.networkByte),
    totals = { ready: 0n, quarantined: 0n, reserved: 0n };
  for (const coin of material.coins ?? []) {
    if (!Object.hasOwn(totals, coin.state)) continue;
    let row;
    try {
      row = await provider.getSubstate(coin.id);
    } catch (e) {
      if (String(e.message) === `Input substate ${coin.id} (v0) is down`)
        continue;
      throw e;
    }
    if (row.verified !== true)
      throw new Error("Wallet balance could not be verified.");
    const owned = await sdk.decryptOwnedUtxo(
      native,
      await signer.getViewSecret(),
      row,
      coin.id,
    );
    if (owned) totals[coin.state] += owned.value;
  }
  const revealed = BigInt(await balance());
  return { ...Object.fromEntries(
    Object.entries({
      ...totals,
      revealed,
      total: totals.ready + totals.quarantined + totals.reserved + revealed,
    }).map(([key, value]) => [key, value.toString()]),
  ), discoveryUnavailable: discovery.unavailable === true, discoveryCapacityReached: discovery.capacityReached === true, discoveryHistoryIncomplete: discovery.historyComplete === false };
  });
}
async function discoverExistingAccount() {
  if(material.account)return;
  const candidate=material.candidateAccount ?? await accountFromPublicKey(unhex(material.publicKey));
  let row;
  try{row=await provider.getSubstate(candidate);}catch(error){if(error.status===404)return;throw error;}
  if(row.verified!==true||row.substate?.Component?.header?.owner_rule?.ByPublicKey!==material.publicKey)
    throw new Error('Recovered account ownership could not be verified.');
  material.account=candidate;
  await persistMaterial();
}
const isPostingChange = (owned) => {
  try {
    return (
      JSON.parse(owned.memo ?? "null")?.Message ===
      "hauntboard:posting-change:v1"
    );
  } catch {
    return false;
  }
};
export async function syncPrivateFunds() {
  return coordinated(() => scanOwnedOutputs());
}
export async function syncFaucetFunds() {
  return coordinated(async () => {
    requireSigner();
    await refreshPrivateMaterial();
    await requireNetwork();
    return discoverFaucetFunds();
  });
}
async function scanOwnedOutputs() {
  requireSigner();
  if (!privateMode())
    throw new Error(
      "Native output scanning belongs to the public privacy wallet.",
    );
  await refreshPrivateMaterial();
  await requireNetwork();
  await discoverExistingAccount();
  const faucet = await discoverFaucetFunds();
  const native = new sdk.WasmStealthCrypto(config.networkByte);
  const result = await scanOutputLedger({
    coins: material.coins ?? [],
    cursor: material.scanComplete ? null : (material.scanCursor ?? null),
    readPage: (cursor) =>
      api("/api/indexer", {
        method: "GET",
        path:
          "utxos?resource_address=" +
          NATIVE +
          "&limit=100" +
          (cursor ? "&from_id=" + cursor : ""),
      }),
    verifyOwned: async (id, utxo) => {
      if (
        !(await sdk.decryptOwnedUtxo(
          native,
          await signer.getViewSecret(),
          { substate: { Utxo: utxo } },
          id,
        ))
      )
        return null;
      let row;
      try {
        row = await provider.getSubstate(id);
      } catch (error) {
        if (String(error.message) === "Input substate " + id + " (v0) is down")
          return null;
        throw error;
      }
      if (row.verified !== true)
        throw new Error("Recovered output is not verified.");
      const owned = await sdk.decryptOwnedUtxo(
        native,
        await signer.getViewSecret(),
        row,
        id,
      );
      if (!owned) throw new Error("Recovered output changed. Retry sync.");
      try {
        if (
          JSON.parse(owned.memo ?? "null")?.Message === "hauntboard:faucet:v1"
        )
          material.faucetClaimed = true;
      } catch {}
      return { change: isPostingChange(owned) };
    },
    checkpoint: async (state) => {
      material.coins = state.coins;
      material.scanCursor = state.cursor;
      material.scanComplete = state.complete;
      await persistMaterial();
    },
  });
  return {
    found: result.found + faucet.found,
    complete: result.complete,
    capacityReached: result.capacityReached,
    ...privateFunds(),
  };
}
async function discoverFaucetFunds() {
  if (config.network !== 'esmeralda') return { found: 0 };
  const native = new sdk.WasmStealthCrypto(config.networkByte);
  const capsule = await api('/api/faucet-outputs', { address: material.address });
  const payload = await decryptFaucetDiscovery({ capsule, address: material.address, viewSecret: await signer.getViewSecret(), deriveAeadKey: (secret, nonce) => native.deriveAeadKey(secret, nonce), network: config.network, resetIdentity: config.resetIdentity });
  const result = await discoverFaucetOutputs({ coins: material.coins ?? [], outputs: payload.outputs,
    verifyOwned: async id => {
      let row;
      try { row = await provider.getSubstate(id); }
      catch (error) { if (String(error.message) === `Input substate ${id} (v0) is down`) return null; throw error; }
      if (row.verified !== true) throw new Error('Incoming faucet output is not verified.');
      const owned = await sdk.decryptOwnedUtxo(native, await signer.getViewSecret(), row, id);
      return owned ? { change: isPostingChange(owned) } : null;
    },
    checkpoint: async coins => { material.coins = coins; await persistMaterial(); },
  });
  return { ...result, historyComplete: payload.historyComplete };
}
export async function importIncoming(transactionId) {
  return coordinated(async () => {
    requireSigner();
    if (!privateMode())
      throw new Error(
        "Incoming stealth funds are for the public privacy board.",
      );
    await refreshPrivateMaterial();
    await requireNetwork();
    if (!/^[a-f0-9]{64}$/.test(transactionId))
      throw new Error("Enter the confirmed incoming transaction ID.");
    const result = await provider.getTransactionResult(transactionId),
      final = result.result?.Finalized;
    if (
      final?.final_decision !== "Commit" ||
      !final.execution_result?.finalize?.result?.Accept
    )
      throw new Error("Incoming transaction is not confirmed.");
    const crypto = new sdk.WasmStealthCrypto(config.networkByte),
      coins = [...(material.coins ?? [])];
    let found = 0;
    const knownSpend =
      final.execution_result.finalize.result.Accept.down_substates.some(
        ([id]) => coins.some((c) => c.id === id),
      );
    for (const [id] of final.execution_result.finalize.result.Accept
      .up_substates) {
      if (
        !id.startsWith(`utxo_${NATIVE.slice(9)}_`) ||
        coins.some((c) => c.id === id)
      )
        continue;
      const row = await provider.getSubstate(id);
      if (row.verified !== true)
        throw new Error("Incoming output is not verified.");
      const owned = await sdk.decryptOwnedUtxo(
        crypto,
        await signer.getViewSecret(),
        row,
        id,
      );
      if (owned) {
        coins.push({
          id,
          state: knownSpend || isPostingChange(owned) ? "quarantined" : "ready",
        });
        found++;
      }
    }
    if (coins.length > 32) throw new Error("Wallet coin capacity reached.");
    material.coins = coins;
    await persistMaterial();
    return { found, ...privateFunds() };
  });
}
async function privateReview(body, registrySigner) {
  if (needsPhraseConfirmation())
    throw new Error("Save and confirm your recovery phrase before posting.");
  await refreshPrivateMaterial();
  if (body.kind === "tip" || body.mode === 1)
    throw new Error("Use schema-4 byte payloads and native posting fees for this board.");
  const target = body.kind==='registry' ? (body.registry ?? body.board) : body.board ?? body.thread,
    state = await api(
      body.kind === 'registry' && body.registry ? `/api/key-registry?address=${target}` : body.kind === "thread" || body.kind==='registry'
        ? `/api/board?address=${target}`
        : `/api/thread?address=${target}`,
    );
  if (body.kind!=='registry' && state.schema !== 4)
    throw new Error(
      "Use the public privacy contract; legacy boards retain signer identities.",
    );
  const existing = JSON.parse(
    localStorage.getItem(privatePendingKey()) ?? "null",
  );
  if (existing)
    throw new Error(
      "Reconcile the previous private fee submission before posting again.",
    );
  if ((material.coins ?? []).length >= 32)
    throw new Error(
      "This wallet reached its tracked-output limit. Keep its recovery phrase and use a separate browser profile with a fresh wallet.",
    );
  let coin;
  const native = new sdk.WasmStealthCrypto(config.networkByte);
  for (const candidate of material.coins ?? []) {
    if (candidate.state !== "ready") continue;
    let row;
    try {
      row = await provider.getSubstate(candidate.id);
    } catch (e) {
      if (
        String(e.message) ===
        "Input substate " + candidate.id + " (v0) is down"
      ) {
        candidate.state = "used";
        await persistMaterial();
        continue;
      }
      throw e;
    }
    if (row.verified !== true)
      throw new Error("Ready fee output is not verified. Retry sync.");
    const owned = await sdk.decryptOwnedUtxo(
      native,
      await signer.getViewSecret(),
      row,
      candidate.id,
    );
    if (!owned)
      throw new Error("Ready fee output does not belong to this wallet.");
    if (owned.value > 1000000n) {
      coin = candidate;
      break;
    }
  }
  if (!coin)
    throw new Error(
      "Receive a native stealth output larger than 1 test TARI for fee simulation. Change is held separately to avoid linking your next post.",
    );
  const builder = new sdk.TransactionBuilder(config.networkByte, 0),
    extra = [];
  if (body.kind === 'registry') {
    if(!registrySigner || !/^[a-f0-9]{64}$/.test(config.keyRegistryTemplate??'')) throw Error('Key registry is not enabled on this network.');
    const entries=envelopeEntries(body.envelopes);
    if(!entries.length || entries.length>16) throw Error('Invalid room member count.');
    // vectorLiteral encodes nested arrays as BOR, not as a byte string.
    if(body.action==='new') builder.callFunction({templateAddress:config.keyRegistryTemplate,functionName:'new'},[
      sdk.literalArg(body.scope),sdk.literalArg(body.board),sdk.literalArg(body.thread),
      sdk.bytesLiteral(unhex(body.admin)),sdk.vectorLiteral(entries),
    ]);
    else if(body.action==='rotate') builder.callMethod({componentAddress:target,methodName:'rotate'},[sdk.intLiteral(BigInt(body.revision)),sdk.vectorLiteral(entries)]);
    else if(body.action==='grant' && entries.length===1) builder.callMethod({componentAddress:target,methodName:'grant'},[sdk.intLiteral(BigInt(body.revision)),sdk.vectorLiteral(entries[0][0]),sdk.vectorLiteral(entries[0][1])]);
    else throw Error('Invalid registry action.');
  } else if (body.kind === "thread")
    builder.callMethod(
      { componentAddress: body.board, methodName: "create_thread" },
      [
        sdk.literalArg(body.title),
        sdk.intLiteral(0n),
        sdk.vectorLiteral(body.uid),
        sdk.vectorLiteral(body.payload),
      ],
    );
  else {
    builder.callMethod(
      { componentAddress: body.thread, methodName: "append" },
      [
        sdk.vectorLiteral(body.nonce),
        sdk.intLiteral(BigInt(body.parent ?? -1)),
        sdk.vectorLiteral(body.payload),
      ],
    );
    const hint = new DataView(new Uint8Array(body.nonce).buffer).getUint32(
      0,
      true,
    );
    if (state.pages[hint]) extra.push(state.pages[hint]);
  }
  const args = {
    provider,
    signer,
    coinId: coin.id,
    networkByte: config.networkByte,
    mainInstructions: builder.buildUnsignedTransaction().instructions,
    mainInputs: [input(target), ...extra.map(input)],
    extraSigners: registrySigner ? [registrySigner] : [],
  };
  const simulated = await api("/api/indexer", {
    method: "POST",
    path: "transactions/dry-run",
    body: {
      transaction: (
        await prepareStealthFee({ ...args, maxFee: 1000000n, dryRun: true })
      ).envelope,
    },
  });
  if (!simulated.result?.finalize?.result?.Accept)
    throw new Error(
      "Tari rejected the posting fee check. Your post has not been submitted.",
    );
  const receipt = simulated.result.finalize.fee_receipt,
    paid =
      BigInt(receipt.total_fees_paid) -
      BigInt(receipt.total_fee_overcharge ?? "0"),
    maximum = paid + (paid + 4n) / 5n + 1000n;
  const checked = await api("/api/indexer", {
    method: "POST",
    path: "transactions/dry-run",
    body: {
      transaction: (
        await prepareStealthFee({ ...args, maxFee: maximum, dryRun: true })
      ).envelope,
    },
  });
  if (!checked.result?.finalize?.result?.Accept)
    throw new Error(
      "Tari could not accept this post within the displayed fee limit. Refresh the board and review again.",
    );
  const ready = await prepareStealthFee({ ...args, maxFee: maximum });
  return {
    browser: true,
    privateFee: true,
    publicKey: material.publicKey,
    network: networkKey(config),
    expiresAt: Date.now() + 120000,
    mode: 0,
    estimatedFee: paid.toString(),
    maxFee: maximum.toString(),
    operation: hex(crypto.getRandomValues(new Uint8Array(32))),
    coinId: coin.id,
    envelope: ready.envelope,
    args,
  };
}
async function privateSubmit(quote) {
  await refreshPrivateMaterial();
  if (
    quote.args.signer !== signer ||
    quote.publicKey !== material.publicKey ||
    quote.network !== networkKey(config) ||
    quote.expiresAt < Date.now()
  )
    throw new Error("Wallet, network or fee review changed. Review again.");
  const coin = material.coins.find((c) => c.id === quote.coinId);
  if (coin?.state !== "ready" || localStorage.getItem(privatePendingKey()))
    throw new Error("This fee output is already reserved. Reconcile it first.");
  const check = await api("/api/indexer", {
    method: "POST",
    path: "transactions/dry-run",
    body: {
      transaction: (
        await prepareStealthFee({
          ...quote.args,
          maxFee: BigInt(quote.maxFee),
          dryRun: true,
        })
      ).envelope,
    },
  });
  if (!check.result?.finalize?.result?.Accept)
    throw new Error(
      "Post state or fee changed. Review again; the maximum was not increased.",
    );
  const identity = await transactionMetadata(quote.envelope);
  const pending = {
    operation: quote.operation,
    coinId: quote.coinId,
    envelope: quote.envelope,
    id: identity.id,
    maxEpoch: identity.maxEpoch,
  };
  localStorage.setItem(privatePendingKey(), JSON.stringify(pending));
  coin.state = "reserved";
  await persistMaterial();
  const sent = await api("/api/browser-submit", {
    transaction: pending.envelope,
    operation: pending.operation,
  });
  if (sent.transaction_id !== pending.id)
    throw new Error(
      "Provider acknowledged a different transaction. Reconcile the saved transaction.",
    );
  return { transactionId: pending.id };
}
const preparationKey = () => `${fundingKey()}:prepare`;
let preparationQuote;
export function postingPreparationStatus() {
  return { pending: Boolean(localStorage.getItem(preparationKey())) };
}
export async function reviewPostingPreparation() {
  return coordinated(async () => {
    requireSigner();
    await refreshPrivateMaterial();
    await requireNetwork();
    if (!privateMode()) throw new Error("Private posting is not enabled.");
    if (needsPhraseConfirmation()) throw new Error("Confirm your recovery phrase first.");
    if (localStorage.getItem(preparationKey())) return { pending: true };
    await discoverExistingAccount();
    const amount = 10000000n, available = BigInt(await balance());
    if (available < amount + 1000000n) throw new Error("Keep at least 11 test TARI in your account to prepare 10 for posting.");
    if ((material.coins ?? []).length > 28) throw new Error("Wallet output limit reached. Use existing posting funds first.");
    const native = new sdk.WasmStealthCrypto(config.networkByte);
    const generated = await native.generateOutputsStatement(Array.from({length:4}, () => sdk.createOutput({
      destination: material.address, amount: amount / 4n, resourceAddress: NATIVE,
      memo: {Message: "hauntboard:posting-funds:v1"},
    })), null);
    const inputs = await native.buildInputsStatement([], amount);
    const statement = new sdk.StealthTransferStatement(inputs, generated.statement,
      await sdk.signBalanceProof(native, sdk.Mask.zero(), generated.outputMask, inputs, generated.statement));
    const account = material.account, address = material.address;
    const build = async fee => {
      const b = new sdk.TransactionBuilder(config.networkByte, (await provider.getCurrentEpoch()) + 5).withNonce(nonce());
      b.withFeeInstructionsBuilder(f => f.callMethod({componentAddress:account,methodName:"pay_fee"},[sdk.amountLiteral(fee)]));
      b.callMethod({componentAddress:account,methodName:"withdraw"},[sdk.resourceAddressLiteral(NATIVE),sdk.amountLiteral(amount)])
        .saveVar("posting-funds").addInstruction(sdk.stealthTransferInstruction({resourceAddress:NATIVE,revealedInputBucket:"posting-funds",statement}, () => ({id:0,offset:null})));
      b.withInputs(await ownedInputs());
      return sdk.resolveTransaction(provider,b.buildUnsignedTransaction());
    };
    const dryRun = async unsigned => api("/api/indexer", {method:"POST",path:"transactions/dry-run",body:{transaction:sdk.sealTransaction(await sdk.signTransaction([signer],{...unsigned,dry_run:true}))}});
    const dry = await dryRun(await build(1000000n));
    if (!dry.result?.finalize?.result?.Accept) throw new Error("Tari rejected posting-funds preparation. No funds were moved.");
    const required = BigInt(dry.result.finalize.total_fees_required ?? 0), fee = required + (required + 4n)/5n + 1000n;
    if(required<=0n || fee>1000000n) throw new Error("Preparation fee exceeds the 1 test TARI limit.");
    const unsigned = await build(fee), final = await dryRun(unsigned);
    if(!final.result?.finalize?.result?.Accept) throw new Error("Tari rejected the final preparation check. No funds were moved.");
    preparationQuote = {address, account, unsigned, amount:amount.toString(), fee:fee.toString(), expires:Date.now()+60000};
    return {amount:amount.toString(), fee:fee.toString(), outputs:4};
  });
}
export async function confirmPostingPreparation() {
  return coordinated(async () => {
    requireSigner();
    await refreshPrivateMaterial();
    await requireNetwork();
    const key = preparationKey();
    let pending = JSON.parse(localStorage.getItem(key) ?? "null");
    if(!pending){
      const q = preparationQuote;
      if(!q || q.address!==material.address || q.account!==material.account || q.expires<Date.now()) throw new Error("Review posting preparation again before confirming.");
      if((material.coins ?? []).length>28) throw new Error("Wallet output limit reached.");
      pending={address:material.address, envelope:sdk.sealTransaction(await sdk.signTransaction([signer],q.unsigned)), operation:hex(crypto.getRandomValues(new Uint8Array(32)))};
      localStorage.setItem(key,JSON.stringify(pending));
      preparationQuote=null;
    }
    if(pending.address!==material.address) throw new Error("Reconcile the previous wallet preparation first.");
    if(!pending.id){
      const status=await api(`/api/operation?id=${pending.operation}`);
      if(status.transactionId) pending.id=status.transactionId;
      else pending.id=(await api("/api/browser-submit",{transaction:pending.envelope,operation:pending.operation})).transaction_id;
      localStorage.setItem(key,JSON.stringify(pending));
    }
    const receipt=await sdk.watchTransaction(provider,pending.id,{timeoutMs:90000});
    const finalized=receipt.result?.Finalized, accepted=finalized?.execution_result?.finalize?.result?.Accept;
    if(finalized?.final_decision!=="Commit" || !accepted) {
      if(finalized?.final_decision==="Abort") {localStorage.removeItem(key);throw new Error("Tari rejected preparation. Sync your balance before reviewing again.");}
      throw new Error("Preparation is pending. Check its status; the original signed request is saved.");
    }
    const native=new sdk.WasmStealthCrypto(config.networkByte);
    for(const [id] of accepted.up_substates){
      if(!id.startsWith(`utxo_${NATIVE.slice(9)}_`) || material.coins.some(c=>c.id===id))continue;
      const row=await provider.getSubstate(id);
      if(row.verified!==true) throw new Error("Posting output verification is pending. Check preparation status again.");
      if(await sdk.decryptOwnedUtxo(native,await signer.getViewSecret(),row,id)) material.coins.push({id,state:"ready"});
    }
    await persistMaterial();
    localStorage.removeItem(key);
    return {prepared:true,id:pending.id};
  });
}
export async function review(body) {
  requireSigner();
  await requireNetwork();
  if (privateMode()) return privateReview(body);
  if (!material.account)
    throw new Error("Fund your browser wallet before posting.");
  if (body.kind === "tip")
    throw new Error(
      "Browser wallets currently sign board posts. Use a companion demo wallet for private tips.",
    );
  const b = new sdk.TransactionBuilder(
    config.networkByte,
    (await provider.getCurrentEpoch()) + 5,
  )
    .withNonce(nonce())
    .feeTransactionPayFromComponent(material.account, 1000000n);
  if (body.kind === "thread")
    b.callMethod(
      { componentAddress: body.board, methodName: "create_thread" },
      [
        sdk.literalArg(body.title),
        sdk.intLiteral(BigInt(body.mode)),
        sdk.vectorLiteral(body.uid),
        sdk.vectorLiteral(body.payload),
      ],
    );
  else
    b.callMethod({ componentAddress: body.thread, methodName: "append" }, [
      sdk.vectorLiteral(body.nonce),
      sdk.intLiteral(BigInt(body.parent ?? -1)),
      sdk.vectorLiteral(body.payload),
    ]);
  const extra = [];
  if (body.kind === "reply") {
    const thread = await api(`/api/thread?address=${body.thread}`);
    if (thread.schema === 3) {
      const hint = body.nonce.every((n, i) => n === thread.uid[i])
        ? 0
        : new DataView(new Uint8Array(body.nonce).buffer).getUint32(0, true);
      if (thread.pages[hint]) extra.push(thread.pages[hint]);
    }
  } else {
    const board = await api(`/api/board?address=${body.board}`),
      existing = board.threads.find((t) =>
        t.uid.every((n, i) => n === body.uid[i]),
      );
    if (existing) {
      extra.push(existing.address);
      const thread = await api(`/api/thread?address=${existing.address}`);
      if (thread.pages[0]) extra.push(thread.pages[0]);
    }
  }
  b.withInputs([
    ...(await ownedInputs()),
    input(body.board ?? body.thread),
    ...extra.map(input),
  ]);
  let unsigned = await sdk.resolveTransaction(
    provider,
    b.buildUnsignedTransaction(),
  );
  // Dry-run transactions are signed in the browser as well; no server wallet participates.
  const dryEnvelope = sdk.sealTransaction(
    await sdk.signTransaction([signer], { ...unsigned, dry_run: true }),
  );
  const dry = await api("/api/indexer", {
    method: "POST",
    path: "transactions/dry-run",
    body: { transaction: dryEnvelope },
  });
  if (!dry.result?.finalize?.result?.Accept) {
    const failure =
      dry.result?.finalize?.result?.AcceptFeeRejectRest?.[1] ??
      dry.result?.finalize?.result?.Reject;
    throw new Error(
      `Browser transaction simulation rejected: ${failure?.ExecutionFailure?.message ?? "The contract rejected the operation."}`,
    );
  }
  const paid = String(dry.result.finalize.fee_receipt?.total_fees_paid ?? "");
  if (!/^[0-9]+$/.test(paid))
    throw new Error("Provider did not return a usable fee estimate.");
  const estimated = BigInt(paid),
    maximum = estimated + (estimated + 4n) / 5n + 1000n;
  if (maximum > 1000000n)
    throw new Error(
      "Estimated fee exceeds this client’s testnet safety ceiling.",
    );
  const fee = new sdk.TransactionBuilder(config.networkByte, 0)
    .feeTransactionPayFromComponent(material.account, maximum)
    .buildUnsignedTransaction();
  unsigned = { ...unsigned, fee_instructions: fee.fee_instructions };
  const finalDry = sdk.sealTransaction(
    await sdk.signTransaction([signer], { ...unsigned, dry_run: true }),
  );
  const finalResult = await api("/api/indexer", {
    method: "POST",
    path: "transactions/dry-run",
    body: { transaction: finalDry },
  });
  if (!finalResult.result?.finalize?.result?.Accept)
    throw new Error(
      "State or fee changed during review. Sync and review again.",
    );
  return {
    browser: true,
    account: material.account,
    publicKey: material.publicKey,
    network: networkKey(config),
    expiresAt: Date.now() + 120000,
    unsigned,
    mode: body.mode,
    estimatedFee: estimated.toString(),
    maxFee: maximum.toString(),
    operation: hex(crypto.getRandomValues(new Uint8Array(32))),
  };
}
// Registry admin is a separate per-room Tari key, never the persistent wallet key.
export async function reviewRegistry(body, admin) {
  requireSigner(); await requireNetwork();
  if(!privateMode() || body.kind!=='registry') throw Error('Registry changes require native stealth fees.');
  const owner=unhex(admin.owner), view=unhex(admin.view);
  const registrySigner=sdk.SecretKeyWallet.fromSecretKey(new Uint8Array(owner),config.networkByte,new Uint8Array(view));
  try { return await privateReview(body,registrySigner); }
  finally { owner.fill(0);view.fill(0); }
}
export function newRoomAdmin() {
  const keys=sdk.generateOotleSecretKey();
  try {
    const pub=sdk.ootlePublicKeyFromSecretKey(keys.owner_key,keys.view_key);
    try { return {owner:hex(keys.owner_key),view:hex(keys.view_key),publicKey:hex(pub.owner_key)}; }
    finally {pub.free();}
  } finally {keys.free();}
}
export async function submit(quote) {
  return coordinated(async () => {
    requireSigner();
    await requireNetwork();
    if (quote.privateFee) return privateSubmit(quote);
    if (
      quote.account !== material.account ||
      quote.publicKey !== material.publicKey ||
      quote.network !== networkKey(config)
    )
      throw new Error("Wallet or network changed. Review the post again.");
    if (quote.expiresAt < Date.now())
      throw new Error("Fee review expired. Review the post again.");
    await ownedInputs();
    const check = sdk.sealTransaction(
      await sdk.signTransaction([signer], { ...quote.unsigned, dry_run: true }),
    );
    const simulation = await api("/api/indexer", {
      method: "POST",
      path: "transactions/dry-run",
      body: { transaction: check },
    });
    if (!simulation.result?.finalize?.result?.Accept)
      throw new Error(
        "State or fee changed. Review the post again; your authorized maximum was not increased.",
      );
    const transaction = sdk.sealTransaction(
      await sdk.signTransaction([signer], quote.unsigned),
    );
    const result = await api("/api/browser-submit", {
      transaction,
      operation: quote.operation,
    });
    return { transactionId: result.transaction_id };
  });
}
export async function transaction(id) {
  return coordinated(() => transactionResult(id));
}
async function transactionResult(id) {
  let row;try{row=await provider.getTransactionResult(id);}catch(e){if(e.status===404)return {status:'Pending'};throw e;}
  if (row.result === "Pending") return { status: "Pending" };
  const final = row.result.Finalized;
  await refreshPrivateMaterial();
  if (material && storageSession && privateMode()) {
    const pending = JSON.parse(
      localStorage.getItem(privatePendingKey()) ?? "null",
    );
    const expected =
      pending?.id ??
      (pending
        ? (await api(`/api/operation?id=${pending.operation}`)).transactionId
        : null);
    if (pending && expected === id) {
      // Once any fee intent commits, the input may be spent even when the post fails.
      const accepted = final.execution_result?.finalize?.result?.Accept,
        feeOnly = final.execution_result?.finalize?.result?.AcceptFeeRejectRest;
      const diff = accepted ?? feeOnly?.[0];
      const coin = material.coins.find((c) => c.id === pending.coinId);
      if (coin) coin.state = diff ? "used" : "ready";
      for (const [out] of diff?.up_substates ?? []) {
        if (
          !out.startsWith(`utxo_${NATIVE.slice(9)}_`) ||
          material.coins.some((c) => c.id === out)
        )
          continue;
        const state = await provider.getSubstate(out);
        if (
          state.verified === true &&
          (await sdk.decryptOwnedUtxo(
            new sdk.WasmStealthCrypto(config.networkByte),
            await signer.getViewSecret(),
            state,
            out,
          ))
        )
          material.coins.push({ id: out, state: "quarantined" });
      }
      await persistMaterial();
      localStorage.removeItem(privatePendingKey());
    }
  }
  return {
    status:
      final.final_decision === "Commit" &&
      final.execution_result?.finalize?.result?.Accept
        ? "Accepted"
        : "Rejected",
    fee: final.execution_result?.finalize?.fee_receipt?.total_fees_paid,
    components: (final.execution_result?.finalize?.result?.Accept?.up_substates??[]).map(([id])=>id).filter(id=>id.startsWith('component_')),
  };
}
