import { SapientWallet, discoverTariProviders, postingReadiness, providerLabel } from './sapient-wallet.mjs';

export function setupWalletOptions({ surface = window, document, getConfig, useBrowserWallet, pending, connected = () => {}, selectionChanged = () => {} }) {
  const $ = id => document.getElementById(id);
  const select = $('sapient-provider');
  let providers = [], busy = false, notice = '';
  const adapter = new SapientWallet({ changed: () => { render(); selectionChanged(adapter.connection); } });
  function present() {
    if (!$('browser-wallet-fallback').open) {
      $('browser-wallet-title').textContent = adapter.connection ? 'Ready to post' : 'Connect your wallet';
      $('wallet-step').textContent = adapter.connection ? 'CONNECTED TO HAUNTBOARD' : 'JOIN THE CONVERSATION';
    }
  }

  function render() {
    const connection = adapter.connection;
    $('sapient-provider-picker').hidden = providers.length < 2;
    $('sapient-connect').hidden = Boolean(connection) || !providers.length;
    $('sapient-connect').textContent = busy ? 'Connecting…' : 'Connect Sapient';
    $('sapient-refresh').hidden = Boolean(connection) || providers.length > 0;
    $('sapient-install').hidden = providers.length > 0;
    $('sapient-account').hidden = !connection;
    $('sapient-account').textContent = connection ? `${connection.account.slice(0, 16)}…${connection.account.slice(-6)} · ${connection.network}` : '';
    $('sapient-connect').disabled = busy || !providers.length || !surface.isSecureContext;
    select.disabled = busy || Boolean(connection);
    $('sapient-refresh').disabled = busy;
    $('sapient-disconnect').hidden = !connection;
    $('sapient-disconnect').disabled = busy;
    $('sapient-use-browser').disabled = busy;
    $('sapient-status').textContent = notice || (connection
      ? `Posts will use Sapient. Approve each transaction in the extension.`
      : providers.length ? 'Sapient is ready. Connect to start posting.'
      : 'Sapient isn’t detected. Install it in your desktop browser to get started.');
    const config = getConfig();
    const list = $('sapient-gates');
    list.replaceChildren();
    if (config) for (const message of postingReadiness(config, connection).blockers) {
      const li = document.createElement('li'); li.textContent = message; list.append(li);
    }
    present();
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
    connected();
  }));
  $('sapient-disconnect').addEventListener('click', () => action(() => adapter.disconnect()));
  $('sapient-refresh').addEventListener('click', refresh);
  $('sapient-use-browser').addEventListener('click', () => {
    adapter.clear();
    // This never resubmits, clears, or changes a pending operation.
    notice = pending() ? 'Your existing submission still needs checking. Opening the browser wallet does not publish it again.' : '';
    $('browser-wallet-fallback').open = true;
    render(); useBrowserWallet();
  });
  $('browser-wallet-fallback').addEventListener('toggle', () => { if ($('browser-wallet-fallback').open) $('browser-wallet-title').textContent = 'Your browser wallet'; else present(); });
  // Re-enumerate the actual registry; an event detail is not trusted as a provider.
  surface.addEventListener('tari:announceProvider', refresh);
  surface.addEventListener('tari#initialized', refresh);
  surface.addEventListener('pagehide', () => adapter.clear());
  refresh();
  return { refresh, adapter, present, browser: () => $('sapient-use-browser').click() };
}
