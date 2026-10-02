import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { vaultGet, vaultPut } from './browser-vault';

export interface Recovery {
  ownerPhrase: string;
  viewPhrase: string;
  address: string;
}
interface StoredWallet {
  version: 1;
  network: string;
  address: string;
  deviceKey: CryptoKey;
  salt: Uint8Array;
  pinIv: Uint8Array;
  deviceIv: Uint8Array;
  encrypted: ArrayBuffer;
  failures: number;
  lockedUntil: number;
}
function networkByte(network: string) {
  if (network === 'localnet') return 0x10;
  if (network === 'esmeralda') return 0x26;
  throw new Error('WALLET_TESTNET_ONLY');
}
const id = (network: string) => `participant-wallet:v1:${network}`;
export const walletTabId = crypto.randomUUID();
// Web Locks coordinate the entire read/crypto/write operation across same-origin tabs.
// Do not fall back to a per-tab mutex when cross-tab coordination is unavailable.
async function walletLock<T>(network: string, action: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new Error('WALLET_COORDINATION_UNAVAILABLE');
  return navigator.locks.request(id(network), action);
}
const bytes = (value: Uint8Array) => new Uint8Array(value).buffer;
function validatePin(pin: string) {
  if (!/^[0-9]{8,12}$/.test(pin)) throw new Error('WALLET_PIN_LENGTH');
}
async function pinKey(pin: string, salt: Uint8Array) {
  validatePin(pin);
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: bytes(salt), iterations: 600000 },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function walletInfo(network: string) {
  networkByte(network);
  const stored = await vaultGet<StoredWallet>(id(network));
  return stored ? { address: stored.address } : null;
}
export async function recoverWallet(
  ownerPhrase: string,
  viewPhrase: string,
  network: string,
): Promise<Recovery> {
  const byte = networkByte(network);
  const normalize = (phrase: string) => phrase.trim().toLowerCase().replace(/\s+/g, ' ');
  const owner = mnemonicToEntropy(normalize(ownerPhrase), wordlist);
  const view = mnemonicToEntropy(normalize(viewPhrase), wordlist);
  try {
    if (owner.length !== 32 || view.length !== 32) throw new Error('WALLET_RECOVERY_INVALID');
    const sdk = await import('@tari-project/ootle-wasm').catch(() => {
      throw new Error('WALLET_SDK_UNAVAILABLE');
    });
    const publicKeys = sdk.ootlePublicKeyFromSecretKey(owner, view);
    try {
      return {
        ownerPhrase: normalize(ownerPhrase),
        viewPhrase: normalize(viewPhrase),
        address: sdk.generateOotleAddress(publicKeys.owner_key, publicKeys.view_key, byte),
      };
    } finally {
      publicKeys.free();
    }
  } finally {
    owner.fill(0);
    view.fill(0);
  }
}
export async function generateWallet(network: string): Promise<Recovery> {
  networkByte(network);
  const sdk = await import('@tari-project/ootle-wasm');
  const keys = sdk.generateOotleSecretKey();
  const owner = keys.owner_key,
    view = keys.view_key;
  try {
    return await recoverWallet(
      entropyToMnemonic(owner, wordlist),
      entropyToMnemonic(view, wordlist),
      network,
    );
  } finally {
    owner.fill(0);
    view.fill(0);
    keys.free();
  }
}
export async function saveWallet(
  recovery: Recovery,
  pin: string,
  network: string,
  restoring = false,
) {
  networkByte(network);
  validatePin(pin);
  return walletLock(network, async () => {
    const current = await walletInfo(network);
    if (current && !restoring) throw new Error('WALLET_EXISTS');
    if (current && current.address !== recovery.address) throw new Error('WALLET_CONFLICT');
    const verified = await recoverWallet(recovery.ownerPhrase, recovery.viewPhrase, network);
    if (verified.address !== recovery.address) throw new Error('WALLET_RECOVERY_INVALID');
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const pinIv = crypto.getRandomValues(new Uint8Array(12));
    const deviceIv = crypto.getRandomValues(new Uint8Array(12));
    const aad = new TextEncoder().encode(
      `hauntbox:participant-wallet:v1:${network}:${recovery.address}`,
    );
    const key = await pinKey(pin, salt);
    const deviceKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const plain = new TextEncoder().encode(
      JSON.stringify({ ownerPhrase: recovery.ownerPhrase, viewPhrase: recovery.viewPhrase }),
    );
    try {
      const inner = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: bytes(pinIv), additionalData: aad },
        key,
        plain,
      );
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: bytes(deviceIv), additionalData: aad },
        deviceKey,
        inner,
      );
      await vaultPut(id(network), {
        version: 1,
        network,
        address: recovery.address,
        deviceKey,
        salt,
        pinIv,
        deviceIv,
        encrypted,
        failures: 0,
        lockedUntil: 0,
      } satisfies StoredWallet);
      const channel = new BroadcastChannel('hauntbox-wallet-updates');
      channel.postMessage({ network, source: walletTabId });
      channel.close();
    } finally {
      plain.fill(0);
    }
  });
}
export async function unlockWallet(pin: string, network: string): Promise<string> {
  networkByte(network);
  validatePin(pin);
  return walletLock(network, async () => {
    const stored = await vaultGet<StoredWallet>(id(network));
    if (!stored) throw new Error('WALLET_NOT_FOUND');
    if (
      stored.version !== 1 ||
      stored.network !== network ||
      typeof stored.address !== 'string' ||
      !(stored.deviceKey instanceof CryptoKey) ||
      !(stored.salt instanceof Uint8Array) ||
      stored.salt.length !== 32 ||
      !(stored.pinIv instanceof Uint8Array) ||
      stored.pinIv.length !== 12 ||
      !(stored.deviceIv instanceof Uint8Array) ||
      stored.deviceIv.length !== 12 ||
      !(stored.encrypted instanceof ArrayBuffer) ||
      !Number.isInteger(stored.failures) ||
      stored.failures < 0 ||
      !Number.isFinite(stored.lockedUntil)
    )
      throw new Error('WALLET_DATA_INVALID');
    if (stored.lockedUntil > Date.now()) throw new Error('WALLET_LOCKED');
    if (stored.lockedUntil) {
      stored.failures = 0;
      stored.lockedUntil = 0;
    }
    const aad = new TextEncoder().encode(
      `hauntbox:participant-wallet:v1:${network}:${stored.address}`,
    );
    let plain: Uint8Array | undefined;
    try {
      const key = await pinKey(pin, stored.salt);
      let inner: ArrayBuffer;
      try {
        inner = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: bytes(stored.deviceIv), additionalData: aad },
          stored.deviceKey,
          stored.encrypted,
        );
      } catch {
        throw new Error('WALLET_DATA_INVALID');
      }
      try {
        plain = new Uint8Array(
          await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: bytes(stored.pinIv), additionalData: aad },
            key,
            inner,
          ),
        );
      } catch {
        stored.failures++;
        if (stored.failures >= 5) stored.lockedUntil = Date.now() + 15 * 60 * 1000;
        await vaultPut(id(network), stored);
        throw new Error('WALLET_PIN_INCORRECT');
      }
      let verified: Recovery;
      try {
        const recovery = JSON.parse(new TextDecoder().decode(plain));
        verified = await recoverWallet(recovery.ownerPhrase, recovery.viewPhrase, network);
        if (verified.address !== stored.address) throw new Error('WALLET_DATA_INVALID');
      } catch (error) {
        if (error instanceof Error && error.message === 'WALLET_SDK_UNAVAILABLE') throw error;
        throw new Error('WALLET_DATA_INVALID');
      }
      stored.failures = 0;
      stored.lockedUntil = 0;
      await vaultPut(id(network), stored);
      return verified.address;
    } finally {
      plain?.fill(0);
    }
  });
}
