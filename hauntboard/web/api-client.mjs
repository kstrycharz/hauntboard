export function createApiClient({getConfig, fetchImpl = fetch}) {
  return async function api(path, body) {
    const serialized = body ? JSON.stringify(body) : undefined;
    async function send() {
      const response = await fetchImpl(path, {
        method: body ? 'POST' : 'GET',
        cache: 'no-store',
        headers: body ? {'Content-Type':'application/json','X-Hauntboard-CSRF':getConfig().csrf} : {},
        body: serialized,
      });
      return {response, data:await response.json()};
    }
    let result = await send();
    // This specific server response is emitted before reading or accepting the
    // request body. Network failures and uncertain submissions are never retried.
    if(body && result.response.status === 403 && result.data.code === 'SESSION_EXPIRED') {
      const previous = getConfig();
      const refreshed = await fetchImpl('/api/config', {cache:'no-store'});
      if(!refreshed.ok) throw new Error('Could not refresh this client session. Reload and check your existing submission.');
      const next = await refreshed.json();
      const identity = ['network','networkByte','resetIdentity','board','template','schema','posterPrivacy','profile'];
      if(identity.some(key => previous[key] !== next[key]) || typeof next.csrf !== 'string' || !next.csrf)
        throw new Error('The network or board configuration changed. Reload before continuing; your saved wallet and pending submission are preserved.');
      previous.csrf = next.csrf;
      result = await send();
    }
    if(!result.response.ok)
      throw Object.assign(new Error(result.data.error ?? 'The client service is unavailable.'), {status:result.response.status});
    return result.data;
  };
}
