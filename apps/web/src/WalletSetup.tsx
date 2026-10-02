import { useState } from 'react';
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
}: {
  network: string;
  onReturn: () => void;
  funding: FundingStatus | null;
  onRefresh: () => void;
}) {
  const [role, setRole] = useState<'participant' | 'operator'>('participant');
  return (
    <section className="live-card">
      <h1>Create or open a Tari wallet</h1>
      <p>
        Hauntbox uses <strong>{network}</strong>. Choose the same network in your wallet. These are
        testnet tokens.
      </p>
      <div className="hero-actions">
        <button
          className={role === 'participant' ? 'primary' : 'secondary'}
          onClick={() => setRole('participant')}
        >
          Participant wallet
        </button>
        <button
          className={role === 'operator' ? 'primary' : 'secondary'}
          onClick={() => setRole('operator')}
        >
          Operator wallets
        </button>
      </div>
      {role === 'participant' ? (
        <>
          <h2>A payout wallet you control</h2>
          <p>
            Your Tari wallet creates and stores its own keys. Hauntbox accepts its receive address;
            it does not receive your seed, password, passkey, or spending keys.
          </p>
          <ol>
            <li>
              Run a Tari Ootle wallet on your own computer for this network. The optional Hauntbox
              wallet companion runs in Docker on your computer.
            </li>
            <li>
              Open its wallet page in your regular browser, register your wallet passkey, and create
              an account.
            </li>
            <li>
              In the wallet, open <strong>Account details → Address</strong>. Copy your receive
              address into the submission form.
            </li>
            <li>
              Keep the wallet’s persistent data and unlock material backed up. The room’s encryption
              recovery file is separate from wallet recovery.
            </li>
          </ol>
          <div className="hero-actions">
            <a
              className="primary"
              href="http://localhost:5103/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open my local wallet companion
            </a>
            <a
              className="secondary"
              href="https://ootle.tari.com/guides/setup-a-wallet/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Tari wallet setup guide
            </a>
          </div>
          <p>
            The companion link refers to your own computer. If it is not installed, follow the setup
            guide or ask the operator for the Docker companion instructions. Receiving an optional
            reward does not require paying an entry fee.
          </p>
        </>
      ) : (
        <>
          <h2>Separate receipt and reward wallets</h2>
          <div role="status">
            <p>
              Receipt fees: {funding?.receiptFundingReady ? 'Ready' : 'Setup or funding pending'} ·
              Private rewards: {funding?.rewardFundingReady ? 'Ready' : 'Setup or funding pending'}
            </p>
            <p>
              {funding?.operatorWalletsConnected
                ? 'Operator wallet services are connected.'
                : 'Operator wallet service credentials have not been connected to the application.'}
            </p>
            <button className="secondary" onClick={onRefresh}>
              Check wallet funding
            </button>
            {funding?.faucetBalance !== undefined && (
              <p>
                Current faucet balance: {funding.faucetBalance} base units. A zero balance means the
                public faucet cannot supply a claim now.
              </p>
            )}
            {funding?.receiptRevealed !== undefined && (
              <p>
                Private operator view — receipt wallet: {funding.receiptRevealed} revealed base
                units; required fee reserve: {funding.receiptReserve}. Reward wallet:{' '}
                {funding.rewardConcealed} concealed base units.
              </p>
            )}
          </div>
          <p>
            The operator manages sponsor-custodied testnet funds. Keep receipt fees and private
            rewards in independent wallets, with separate unlock files, credentials, and budgets.
          </p>
          <ol>
            <li>
              Open each wallet’s administration page in your regular browser and register its
              passkey.
            </li>
            <li>
              Create a receipt-fee account in the receipt wallet and a funding account in the reward
              wallet.
            </li>
            <li>
              Request faucet-origin testnet funds when the public faucet has a balance. If it is
              empty, show funding as unavailable and leave intake and payouts paused.
            </li>
            <li>
              Prepare the template publication and funding/conversion operations with exact targets
              and fee limits for review. Store service credentials in private mounted files.
            </li>
          </ol>
          <div className="hero-actions">
            <a
              className="secondary"
              href="http://localhost:5101/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Receipt wallet administration
            </a>
            <a
              className="secondary"
              href="http://localhost:5102/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Reward wallet administration
            </a>
          </div>
          <p>
            These links are for the operator’s local installation. Never share an operator wallet
            account with participants or expose these wallet RPC ports publicly.
          </p>
        </>
      )}
      <button className="secondary" onClick={onReturn}>
        Return to submission form
      </button>
    </section>
  );
}
