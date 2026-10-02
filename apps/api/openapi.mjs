import { z } from 'zod';
import * as schemas from '../../packages/schema/index.mjs';
const json = (schema) => z.toJSONSchema(schema, { target: 'openapi-3.0' });
const body = (schema) => ({
  required: true,
  content: { 'application/json': { schema: json(schema) } },
});
const result = (description, status = '200') => ({ [status]: { description } });
const id = (name) => ({ name, in: 'path', required: true, schema: { type: 'string' } });
export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Hauntbox application API',
    version: '0.2.0',
    description:
      'Ciphertext-only uploads and chain-verified inclusion receipts. Selected rewards disclose the recipient and amount to the authenticated operator wallet service.',
  },
  components: {
    securitySchemes: {
      curatorSession: { type: 'apiKey', in: 'cookie', name: 'hauntbox_session' },
      lookupCapability: {
        type: 'http',
        scheme: 'bearer',
        description: 'Separate 256-bit receipt lookup capability. Never send in a URL.',
      },
    },
  },
  paths: {
    '/api/rooms': { get: { responses: result('Public bounded room metadata') } },
    '/api/rooms/{id}': {
      get: {
        parameters: [id('id')],
        responses: result('Public key, immutable context and actual room state'),
      },
    },
    '/api/rooms/{id}/challenge': {
      post: {
        parameters: [id('id')],
        responses: result('Short-lived, single-use upload challenge'),
      },
    },
    '/api/rooms/{id}/envelopes': {
      post: {
        parameters: [
          id('id'),
          { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } },
        ],
        requestBody: body(schemas.submitEnvelope),
        responses: result('Durably stored ciphertext and outbox; anchoring remains pending', '202'),
      },
    },
    '/api/envelopes/{id}/status': {
      get: {
        parameters: [id('id')],
        security: [{ lookupCapability: [] }],
        responses: result(
          'Private processing state; excludes ciphertext, address and reward amount',
        ),
      },
    },
    '/api/receipts/{id}': {
      get: {
        parameters: [id('id')],
        responses: result('Authoritatively verified inclusion data, or 404 when not anchored'),
      },
    },
    '/api/curator/rooms': {
      post: {
        security: [{ curatorSession: [] }],
        requestBody: body(schemas.createRoom),
        responses: result('Room creation queued; fresh passkey and CSRF required', '202'),
      },
    },
    '/api/curator/rooms/{id}/envelopes': {
      get: {
        security: [{ curatorSession: [] }],
        parameters: [id('id'), { name: 'after', in: 'query', schema: { type: 'string' } }],
        responses: result('Page of at most 25 ciphertext envelopes and private reward states'),
      },
    },
    '/api/curator/rooms/{id}/close': {
      post: {
        security: [{ curatorSession: [] }],
        parameters: [id('id')],
        responses: result('Intake closed; chain close queued behind pending anchors'),
      },
    },
    '/api/curator/rewards/quote': {
      post: {
        security: [{ curatorSession: [] }],
        requestBody: body(schemas.quoteReward),
        responses: result(
          'Expiring quote bound to exact recipient, amount, network and maximum fee',
        ),
      },
    },
    '/api/curator/rewards/{id}/confirm': {
      post: {
        security: [{ curatorSession: [] }],
        parameters: [id('id')],
        requestBody: body(schemas.confirmReward.omit({ quoteId: true })),
        responses: result(
          'One durable reward intent queued; fresh passkey and CSRF required',
          '202',
        ),
      },
    },
    '/api/curator/rewards/{id}': {
      get: {
        security: [{ curatorSession: [] }],
        parameters: [id('id')],
        responses: result('Durable actual reward state; unknown outcomes never retry signing'),
      },
    },
    '/api/auth/register/options': {
      post: {
        requestBody: body(schemas.bootstrapRegistration),
        responses: result('First operator registration challenge; setup code required'),
      },
    },
    '/api/auth/register/verify': {
      post: {
        requestBody: body(schemas.authResponse),
        responses: result('Verified passkey, HTTP-only session and CSRF token'),
      },
    },
    '/api/auth/login/options': { post: { responses: result('Expiring authentication challenge') } },
    '/api/auth/login/verify': {
      post: {
        requestBody: body(schemas.authResponse),
        responses: result('Fresh passkey-verified session'),
      },
    },
    '/api/auth/session': {
      get: {
        security: [{ curatorSession: [] }],
        responses: result('Authenticated session and rotated CSRF token'),
      },
    },
    '/api/auth/logout': {
      post: { security: [{ curatorSession: [] }], responses: result('Durable session revoked') },
    },
    '/api/status': {
      get: { responses: result('Actual network and separate intake, anchor and payout switches') },
    },
    '/api/funding/status': {
      get: {
        responses: result(
          'Public readiness flags only; excludes operator balances and account identities',
        ),
      },
    },
    '/api/curator/funding/status': {
      get: {
        security: [{ curatorSession: [] }],
        responses: result(
          'Private operator fee reserves, concealed reward balance and current faucet availability',
        ),
      },
    },
    '/health/live': { get: { responses: result('Minimal process liveness') } },
    '/health/ready': {
      get: { responses: result('Database readiness, without credentials or internal hosts') },
    },
  },
};
