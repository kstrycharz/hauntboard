const outputPattern = /^utxo_0101010101010101010101010101010101010101010101010101010101010101_[a-f0-9]{64}$/;
const bytes = (value, length) => {
  if (typeof value !== 'string' || !/^(?:[a-f0-9]{2})+$/.test(value) || (length && value.length !== length * 2)) throw new Error('Invalid encrypted faucet discovery.');
  return Uint8Array.from(value.match(/../g), x => parseInt(x, 16));
};
export async function decryptFaucetDiscovery({ capsule, address, viewSecret, deriveAeadKey, network, resetIdentity }) {
  if (capsule?.version !== 1 || typeof capsule.ciphertext !== 'string' || capsule.ciphertext.length > 160000) throw new Error('Invalid encrypted faucet discovery.');
  const shared = await deriveAeadKey(viewSecret, bytes(capsule.publicNonce, 32));
  let plaintext;
  try {
    const key = await crypto.subtle.importKey('raw', shared, 'AES-GCM', false, ['decrypt']);
    plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(capsule.iv, 12), additionalData: new TextEncoder().encode(`tari-faucet-discovery:v1:${address}`) }, key, bytes(capsule.ciphertext)));
    const payload = JSON.parse(new TextDecoder().decode(plaintext));
    if (payload.version !== 1 || payload.network !== network || payload.resetIdentity !== resetIdentity || !Array.isArray(payload.outputs) || payload.outputs.length > 1024 || payload.outputs.some(id => !outputPattern.test(id)) || new Set(payload.outputs).size !== payload.outputs.length || typeof payload.historyComplete !== 'boolean') throw new Error('Faucet discovery network or output identity mismatch.');
    return payload;
  } finally { shared.fill(0); plaintext?.fill(0); }
}

// Hints never authorize funds. The caller must reread the verified native
// substate and decrypt ownership before activating an incoming output.
export async function discoverFaucetOutputs({ coins, outputs, verifyOwned, checkpoint = async () => {}, capacity = 32 }) {
  const ledger = coins.filter(c => c.state !== 'used').map(c => ({ ...c }));
  const spent = new Set(coins.filter(c => c.state === 'used').map(c => c.id));
  let found = 0, unavailable = false;
  if (ledger.length > capacity || new Set(ledger.map(c => c.id)).size !== ledger.length) throw new Error('Invalid wallet output ledger.');
  for (const id of outputs) {
    if (!outputPattern.test(id)) throw new Error('Invalid faucet output hint.');
    if (spent.has(id) || ledger.some(c => c.id === id)) continue;
    if (ledger.length >= capacity) return { coins: ledger, found, capacityReached: true, unavailable };
    let owned;
    try { owned = await verifyOwned(id); }
    catch (error) { if (error.status === 404) { unavailable = true; continue; } throw error; }
    if (!owned) continue;
    ledger.push({ id, state: owned.change ? 'quarantined' : 'ready' });
    found++;
    await checkpoint(ledger);
  }
  return { coins: ledger, found, capacityReached: false, unavailable };
}
