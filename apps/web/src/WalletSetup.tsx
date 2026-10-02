import { ParticipantSignIn } from './ParticipantSignIn';
import { EmbeddedWallet } from './EmbeddedWallet';
export interface FundingStatus {
  operatorWalletsConnected: boolean;
  receiptFundingReady: boolean;
  rewardFundingReady: boolean;
  reason: string | null;
  faucetBalance?: string;
  receiptRevealed?: string;
  rewardConcealed?: string;
  receiptReserve?: string;
}
export function WalletSetup({
  network,
  onReturn,
  funding,
  onRefresh,
  onOperator,
  onUseAddress,
}: {
  network: string;
  onReturn: () => void;
  funding: FundingStatus | null;
  onRefresh: () => void;
  onOperator: () => void;
  onUseAddress: (address: string) => void;
}) {
  return (
    <>
      <section className="live-card">
        <h1>Your wallet</h1>
        <p>
          A wallet gives you an address for optional story rewards. You can submit a story without
          one.
        </p>
        <button className="secondary" onClick={onReturn}>
          Return to submission form
        </button>
      </section>
      <EmbeddedWallet network={network} onUseAddress={onUseAddress} />
      <details className="live-card">
        <summary>Existing app account / passkey sign-in</summary>
        <p>Only use this if you previously created a separate Hauntbox app account.</p>
        <ParticipantSignIn network={network} onUseAddress={onUseAddress} />
      </details>
      <details className="live-card">
        <summary>Host tools and funding</summary>
        <p>
          Running a room? Sign in as the host to create rooms, open stories and choose rewards. The
          host pays receipt fees and funds rewards from separate testnet wallets.
        </p>
        <a className="secondary" href="/admin">
          Host sign-in and setup
        </a>
        <details>
          <summary>Host funding status</summary>
          <p>
            Receipt fees: {funding?.receiptFundingReady ? 'Ready' : 'Setup or funding pending'} ·
            Rewards: {funding?.rewardFundingReady ? 'Ready' : 'Setup or funding pending'}
          </p>
          <p>
            {funding?.operatorWalletsConnected
              ? 'Host wallet services are connected.'
              : 'The host still needs to connect private wallet service credentials.'}
          </p>
          <button className="secondary" onClick={onRefresh}>
            Check host funding
          </button>
          {funding?.receiptRevealed !== undefined && (
            <p>
              Private host view: receipt balance {funding.receiptRevealed}; receipt reserve{' '}
              {funding.receiptReserve}; concealed reward balance {funding.rewardConcealed}, in base
              units.
            </p>
          )}
        </details>
      </details>
      <details className="live-card">
        <summary>About this testnet wallet</summary>
        <p>
          This is the <strong>{network}</strong> test network. Tokens have no real monetary value.
          Balance scanning and sending from this wallet are still in development. Testnet wallets
          will not be automatically moved to mainnet.
        </p>
      </details>
    </>
  );
}
