import { ParticipantSignIn } from './ParticipantSignIn';
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
        <h1>Your account and the host</h1>
        <p>
          Hauntbox runs on <strong>{network}</strong> testnet. Participants submit stories. The host
          chooses optional rewards and pays the network fees.
        </p>
      </section>
      <ParticipantSignIn network={network} onUseAddress={onUseAddress} />
      <section className="live-card">
        <h2>Who is the operator?</h2>
        <p>
          The operator is the person running this Hauntbox installation — initially you, Kyle. In
          this release the operator is also the curator: the host who creates rooms, opens submitted
          stories and decides which entries receive a reward.
        </p>
        <p>
          The participant’s payout wallet belongs to the participant. The host’s receipt-fee wallet
          pays for inclusion receipts, and the separate reward wallet holds the testnet tokens used
          for optional rewards. Participants never need access to either host wallet.
        </p>
        <button className="secondary" onClick={onOperator}>
          Host sign-in and setup
        </button>
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
      </section>
      <section className="live-card">
        <h2>Testnet now, mainnet later</h2>
        <p>
          PIN and passkey sign-in are app access methods. They do not authorize wallet spending. A
          mainnet release will require a reviewed wallet connection or encrypted embedded wallet,
          separate spending approval and tested recovery. Testnet accounts, credentials and funds
          will not be silently migrated to mainnet.
        </p>
        <button className="secondary" onClick={onReturn}>
          Return to submission form
        </button>
      </section>
    </>
  );
}
