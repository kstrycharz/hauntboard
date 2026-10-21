import {createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {mkdir, readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {atomicJson} from './chain.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const terminal = new Set(['confirmed', 'rejected', 'failed']);
const statuses = new Set(['queued', 'prepared', 'pending', 'uncertain', ...terminal]);
const fail = (message, status = 400, retryAfter) => Object.assign(new Error(message), {status, retryAfter});
const digest = value => createHash('sha256').update(value).digest('hex');

// Anonymous browser sessions authenticate receipt access, not wallet ownership.
// The upstream faucet separately enforces the wallet-owner cooldown and quotas.
export class Faucet {
  constructor({key, root = '/companion/faucet', fetchImpl = fetch, now = Date.now} = {}) {
    this.key = key;
    this.root = root;
    this.fetch = fetchImpl;
    this.now = now;
    this.tail = Promise.resolve();
    this.window = 0;
    this.requests = 0;
    this.active = 0;
  }
  session(req, res, secure) {
    const sign = id => createHmac('sha256', this.key).update(`hauntboard-faucet-session:v1:${id}`).digest('hex');
    const token = (req.headers.cookie ?? '').split(';').map(v => v.trim()).find(v => v.startsWith('hauntboard-faucet-session='))?.split('=')[1];
    if (/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(token ?? '')) {
      const [id, signature] = token.split('.');
      if (timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(id), 'hex'))) return digest(id);
    }
    const id = randomBytes(32).toString('hex');
    res.setHeader('Set-Cookie', `hauntboard-faucet-session=${id}.${sign(id)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${secure ? '; Secure' : ''}`);
    return digest(id);
  }
  authenticate(req) {
    return this.session(req, {setHeader() { throw fail('Refresh this page to start a faucet session.', 401); }}, false);
  }
  async serial(action) {
    if (this.now() - this.window >= 60000) { this.window = this.now(); this.requests = 0; }
    // Leave room within the upstream key's 120/minute allowance.
    if (++this.requests > 90) throw fail('Faucet requests are busy. Try again in a minute.', 429, 60);
    if (this.active >= 8) throw fail('Faucet requests are busy. Keep your receipt and try again.', 429, 10);
    this.active++;
    const work = this.tail.then(action).finally(() => { this.active--; });
    this.tail = work.catch(() => {});
    return work;
  }
  async load(path) {
    try { return JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
  }
  directory(scope) { return join(this.root, digest(scope)); }
  async claim(scope, session, {receipt, address, amountTokens}) {
    if (!UUID.test(receipt ?? '') || typeof address !== 'string' || address.length > 300 || !/^otl_esm_[a-z0-9]+$/.test(address) || amountTokens !== 100)
      throw fail('Use an Esmeralda receive address and a 100 tXTR request with a UUID v4 receipt.');
    return this.serial(async () => {
      const dir = this.directory(scope), path = join(dir, `${receipt}.json`);
      await mkdir(dir, {recursive: true, mode: 0o700});
      let record = await this.load(path);
      if (record) {
        if (record.session !== session) throw fail('Funding receipt not found in this browser session.', 404);
        if (record.address !== address || record.amountTokens !== amountTokens) throw fail('This receipt already belongs to a different funding request.', 409);
        if (record.result) return this.public(record);
      } else {
        const sessionPath = join(dir, `session-${session}.json`), previous = await this.load(sessionPath);
        if (previous && previous.receipt !== receipt && this.now() - previous.createdAt < 3600000)
          throw fail('One funding request per browser session per hour. Check your existing request or try later.', 429, Math.ceil((previous.createdAt + 3600000 - this.now()) / 1000));
        if ((await readdir(dir)).length >= 10000) throw fail('Funding request storage is full. Use the linked faucet or contact the operator.', 503, 60);
        record = {receipt, address, amountTokens, session, createdAt: this.now()};
        // Save the session gate and exact payload before any network request.
        await atomicJson(sessionPath, {receipt, createdAt: record.createdAt});
        await atomicJson(path, record);
      }
      if (record.retryAt > this.now()) throw fail('Wait before checking this funding request again.', 429, Math.ceil((record.retryAt - this.now()) / 1000));
      return this.send(path, record);
    });
  }
  async status(scope, session, receipt) {
    if (!UUID.test(receipt ?? '')) throw fail('Invalid funding receipt.');
    return this.serial(async () => {
      const path = join(this.directory(scope), `${receipt}.json`), record = await this.load(path);
      if (!record || record.session !== session) throw fail('Funding receipt not found in this browser session.', 404);
      if (terminal.has(record.result?.status) || this.now() - (record.checkedAt ?? 0) < 3000) return this.public(record);
      if (record.retryAt > this.now()) throw fail('Wait before checking this funding request again.', 429, Math.ceil((record.retryAt - this.now()) / 1000));
      return this.send(path, record, true);
    });
  }
  public(record) { return record.result ?? {receipt: record.receipt, status: 'unknown', transactionId: null, amountMicrotari: '100000000'}; }
  async send(path, record, lookup = false) {
    let response, data;
    try {
      response = await this.fetch(`https://testnet-faucet.taritracker.com/api/v1/claims${lookup ? `/${record.receipt}` : ''}`, {
        method: lookup ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: {Authorization: `Bearer ${this.key}`, ...(lookup ? {} : {'Content-Type': 'application/json'})},
        body: lookup ? undefined : JSON.stringify({receipt: record.receipt, address: record.address, amountTokens: record.amountTokens}),
      });
      data = await response.json();
    } catch {
      record.retryAt = this.now() + 10000;
      await atomicJson(path, record);
      throw fail('The faucet response was interrupted. Your receipt is saved; retry this same request.', 503, 10);
    }
    if (!response.ok) {
      if (lookup && response.status === 404) {
        record.checkedAt = this.now();
        await atomicJson(path, record);
        return this.public(record);
      }
      const header = response.headers.get('Retry-After');
      const retry = header && /^\d+$/.test(header) ? Number(header) : header && Number.isFinite(Date.parse(header)) ? Math.ceil((Date.parse(header) - this.now()) / 1000) : 10;
      const retryAfter = Math.min(86400, Math.max(3, retry));
      record.retryAt = this.now() + retryAfter * 1000;
      await atomicJson(path, record);
      const message = [401, 403].includes(response.status) ? 'Faucet authorization is unavailable. Use the linked faucet or contact the operator.' : typeof data.error === 'string' ? data.error.replaceAll(this.key, '[redacted]').slice(0, 240) : 'The faucet is unavailable. Keep this receipt and try again.';
      throw fail(message, [400, 409, 429, 503].includes(response.status) ? response.status : 503, retryAfter);
    }
    if (data.receipt !== record.receipt || !statuses.has(data.status) || (data.transactionId !== null && !/^[a-f0-9]{64}$/.test(data.transactionId ?? '')) || data.amountMicrotari !== '100000000')
      throw fail('The faucet returned an unexpected response. Keep this receipt and check again.', 503, 10);
    record.result = {receipt: data.receipt, status: data.status, transactionId: data.transactionId, amountMicrotari: data.amountMicrotari};
    record.checkedAt = this.now();
    record.retryAt = 0;
    await atomicJson(path, record);
    return this.public(record);
  }
}
