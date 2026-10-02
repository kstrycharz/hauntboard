// Read-only local-network readiness probe; allowlisted aggregate output.
import { localNetworkWitness } from './lib/local-network-witness.mjs';
const checks = {};
for (let attempt = 0; attempt < 20; attempt++) {
  for (const service of ['indexer', 'sender', 'receiver']) {
    try {
      const response = await fetch(
        service === 'indexer' ? 'http://indexer:18300/network' : `http://${service}:5100/json_rpc`,
        {
          ...(service !== 'indexer'
            ? {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 1,
                  method: 'wallet.get_info',
                  params: {},
                }),
              }
            : {}),
          signal: AbortSignal.timeout(5000),
          redirect: 'error',
        },
      );
      const body = await response.json();
      const info = service === 'indexer' ? body : body.result;
      checks[service] = {
        ready: response.ok && info?.network === 'localnet',
        network: info?.network,
        networkByte: info?.network_byte,
      };
    } catch {
      checks[service] = { ready: false };
    }
  }
  try {
    await localNetworkWitness();
    checks.validatorAndNativeResource = { ready: true };
  } catch {
    checks.validatorAndNativeResource = { ready: false };
  }
  if (Object.values(checks).every((c) => c.ready)) break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
console.log(
  JSON.stringify({
    status: Object.values(checks).every((c) => c.ready)
      ? 'LOCAL_NETWORK_READY'
      : 'LOCAL_NETWORK_UNAVAILABLE',
    checks,
  }),
);
if (Object.values(checks).some((c) => !c.ready)) process.exitCode = 1;
