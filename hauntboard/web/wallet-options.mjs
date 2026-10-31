import { SapientWallet, discoverTariProviders, postingReadiness, providerLabel } from './sapient-wallet.mjs';

export function setupWalletOptions({ surface = window, document, getConfig, useBrowserWallet, pending }) {
  const $ = id => document.getElementById(id);
  const select = $('sapient-provider');
  let providers = [], busy = false, notice = '';
  const adapter = new SapientWallet({ changed: render });

  function render() {
    const connection = adapter.connection;
    $('sapient-connect').disabled = busy || !providers.length || !surface.isSecureContext;
    select.disabled = busy || Boolean(connection);
    $('sapient-refresh').disabled = busy;
    $('sapient-disconnect').hidden = !connection;
    $('sapient-disconnect').disabled = busy;
    $('sapient-use-browser').disabled = busy;
    $('sapient-status').textContent = notice || (connection
      ? `Connected for compatibility checks on ${connection.network}. Private balances remain hidden. Posting uses the browser wallet.`
      : providers.length ? 'An injected wallet is available. Connecting shares its public account with this site. Posting stays in the browser wallet.'
      : 'No injected Tari wallet found. Install Sapient in a supported desktop browser, then check again. The browser wallet is available here.');
    const config = getConfig();
    const list = $('sapient-gates');
    list.replaceChildren();
    if (config) for (const message of postingReadiness(config, connection).blockers) {
      const li = document.createElement('li'); li.textContent = message; list.append(li);
    }
  }

  function refresh() {
    const selected = providers[Number(select.value)];
    providers = discoverTariProviders(surface);
    if (adapter.provider && !providers.includes(adapter.provider)) adapter.clear();
    select.replaceChildren();
    providers.forEach((provider, i) => {
      const option = document.createElement('option');
      option.value = String(i); option.textContent = providerLabel(provider, i); select.append(option);
    });
    const index = providers.indexOf(adapter.provider ?? selected);
    select.value = String(index < 0 ? 0 : index);
    notice = '';
    render();
  }

  async function action(callback) {
    if (busy) return;
    busy = true; notice = ''; render();
    try { await callback(); }
    catch (error) { notice = error?.code === 4001 ? 'Connection declined. You can continue with the browser wallet.' : 'Wallet check did not complete. Check the extension and its network, then try again.'; }
    finally { busy = false; render(); }
  }
  $('sapient-connect').addEventListener('click', () => action(async () => {
    const config = getConfig();
    if (!config) throw new Error('Configuration unavailable.');
    await adapter.connect(providers[Number(select.value)], config);
  }));
  $('sapient-disconnect').addEventListener('click', () => action(() => adapter.disconnect()));
  $('sapient-refresh').addEventListener('click', refresh);
  $('sapient-use-browser').addEventListener('click', () => {
    // This never resubmits, clears, or changes a pending operation.
    notice = pending() ? 'Your existing submission still needs checking. Opening the browser wallet does not publish it again.' : '';
    render(); useBrowserWallet();
  });
  // Re-enumerate the actual registry; an event detail is not trusted as a provider.
  surface.addEventListener('tari:announceProvider', refresh);
  surface.addEventListener('tari#initialized', refresh);
  surface.addEventListener('pagehide', () => adapter.clear());
  refresh();
  return { refresh };
}
