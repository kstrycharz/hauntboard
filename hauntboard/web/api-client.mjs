export function createApiClient({getConfig, fetchImpl = fetch, timeoutMs = 25000}) {
  async function fetchJson(path, options) {
    const controller = new AbortController();
    let timer;
    const timedOut = Object.assign(new Error('The server took too long to respond. Your draft is preserved. Check any saved submission before trying again.'), {code:'REQUEST_TIMEOUT'});
    try {
      return await Promise.race([
        Promise.resolve().then(async () => {
          const response = await fetchImpl(path, {...options, signal:controller.signal});
          return {response, data:await response.json()};
        }),
        new Promise((_,reject) => { timer = setTimeout(() => { controller.abort(); reject(timedOut); }, timeoutMs); }),
      ]);
    } catch (error) { throw controller.signal.aborted ? timedOut : error; }
    finally { clearTimeout(timer); }
  }
  return async function api(path, body) {
    const serialized = body ? JSON.stringify(body) : undefined;
    async function send() {
      return fetchJson(path, {
        method: body ? 'POST' : 'GET',
        cache: 'no-store',
        headers: body ? {'Content-Type':'application/json','X-Hauntboard-CSRF':getConfig().csrf} : {},
        body: serialized,
      });
    }
    let result = await send();
    // This specific server response is emitted before reading or accepting the
    // request body. Network failures and uncertain submissions are never retried.
    if(body && result.response.status === 403 && result.data.code === 'SESSION_EXPIRED') {
      const previous = getConfig();
      const refreshed = await fetchJson('/api/config', {cache:'no-store'});
      if(!refreshed.response.ok) throw new Error('Could not refresh this client session. Reload and check your existing submission.');
      const next = refreshed.data;
      const identity = ['network','networkByte','resetIdentity','board','template','keyRegistryTemplate','schema','posterPrivacy','profile'];
      if(identity.some(key => previous[key] !== next[key]) || typeof next.csrf !== 'string' || !next.csrf)
        throw new Error('The network or board configuration changed. Reload before continuing; your saved wallet and pending submission are preserved.');
      previous.csrf = next.csrf;
      result = await send();
    }
    if(!result.response.ok)
      throw Object.assign(new Error(result.data.error ?? 'The client service is unavailable.'), {status:result.response.status, retryAfter:result.response.headers?.get('Retry-After')});
    return result.data;
  };
}
