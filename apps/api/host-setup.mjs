import { hash, same, problem } from './security.mjs';

// Enabled only on the operator's explicitly configured loopback deployment.
// Origin and Host are checked independently to reject CSRF and DNS rebinding.
export function localHostSetup(req, config) {
  const origin = new URL(config.origin);
  return (
    config.localHostSetup === true &&
    ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) &&
    req.headers.origin === origin.origin &&
    req.headers.host === origin.host &&
    (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin')
  );
}
export function authorizeHostSetup(req, config, suppliedCode) {
  if (suppliedCode === undefined && localHostSetup(req, config)) return;
  if (
    typeof suppliedCode !== 'string' ||
    !config.bootstrapCode ||
    !same(hash(suppliedCode), hash(config.bootstrapCode))
  )
    throw problem('REGISTRATION_NOT_AVAILABLE', 403);
}
