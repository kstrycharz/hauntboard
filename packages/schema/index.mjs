import { z } from 'zod';

export const hex32 = z.string().regex(/^[a-f0-9]{64}$/);
export const capability = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const roomId = z.string().uuid();
export const publicKey = z
  .object({
    kty: z.literal('RSA'),
    n: z.string().regex(/^[A-Za-z0-9_-]{512}$/),
    e: z.literal('AQAB'),
  })
  .strict();
export const createRoom = z
  .object({
    title: z.string().trim().min(1).max(80),
    prompt: z.string().trim().min(1).max(500),
    publicJwk: publicKey,
    keyThumbprint: capability,
    capacity: z.number().int().min(1).max(128),
    recoveryVerified: z.literal(true),
  })
  .strict();
export const submitEnvelope = z
  .object({
    submissionId: hex32,
    envelope: z.string().max(8192),
    digest: hex32,
    challenge: capability,
    lookupCapability: capability,
  })
  .strict();
export const quoteReward = z
  .object({
    submissionId: hex32,
    recipient: z.string().min(1).max(512),
    amount: z.string().regex(/^[1-9][0-9]{0,18}$/),
    disclosureAccepted: z.literal(true),
  })
  .strict();
export const confirmReward = z
  .object({ quoteId: z.string().uuid(), confirmation: z.literal('SEND PRIVATE TESTNET REWARD') })
  .strict();
export const bootstrapRegistration = z.object({ bootstrapCode: capability }).strict();
export const authResponse = z
  .object({ ceremonyId: z.string().uuid(), response: z.record(z.string(), z.unknown()) })
  .strict();
export const network = z.enum(['localnet', 'esmeralda']);
