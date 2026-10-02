// Read-only operator config validation; never calls a wallet or displays private policy values.
import { policyFromEnv } from './lib/funding.mjs';
try {
  policyFromEnv(process.env);
  console.log(JSON.stringify({ status: 'FUNDING_CONFIG_VALID', execution: 'NOT_SUBMITTED' }));
} catch {
  console.error(JSON.stringify({ status: 'FUNDING_CONFIG_INVALID', execution: 'NOT_SUBMITTED' }));
  process.exitCode = 1;
}
