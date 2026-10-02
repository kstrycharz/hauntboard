const decode = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const encode = (b: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(b)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
export async function passkeyCeremony(
  kind: 'register' | 'login',
  options: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!window.isSecureContext || !window.PublicKeyCredential)
    throw new Error('PASSKEY_BROWSER_UNAVAILABLE');
  const publicKey = { ...options, challenge: decode(options.challenge as string) };
  let credential: PublicKeyCredential | null;
  if (kind === 'register') {
    const user = options.user as Record<string, unknown>;
    credential = (await navigator.credentials.create({
      publicKey: {
        ...publicKey,
        user: { ...user, id: decode(user.id as string) },
      } as unknown as PublicKeyCredentialCreationOptions,
    })) as PublicKeyCredential | null;
  } else {
    const allow = ((options.allowCredentials as Array<Record<string, unknown>>) ?? []).map(
      (row) => ({ ...row, id: decode(row.id as string) }),
    );
    credential = (await navigator.credentials.get({
      publicKey: {
        ...publicKey,
        allowCredentials: allow,
      } as unknown as PublicKeyCredentialRequestOptions,
    })) as PublicKeyCredential | null;
  }
  if (!credential) throw new Error('PASSKEY_CANCELLED');
  const response = credential.response;
  const serialized: Record<string, unknown> = { clientDataJSON: encode(response.clientDataJSON) };
  if (response instanceof AuthenticatorAttestationResponse) {
    serialized.attestationObject = encode(response.attestationObject);
    serialized.transports = response.getTransports();
  } else {
    const assertion = response as AuthenticatorAssertionResponse;
    serialized.authenticatorData = encode(assertion.authenticatorData);
    serialized.signature = encode(assertion.signature);
    serialized.userHandle = assertion.userHandle ? encode(assertion.userHandle) : null;
  }
  return {
    id: credential.id,
    rawId: encode(credential.rawId),
    type: credential.type,
    response: serialized,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment,
  };
}
