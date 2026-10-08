// Separate fixed refill intent; preserve every earlier proof, receipt and private journal.
export function faucetRefillProfile(argv=process.argv){
 const second=argv.includes('--refill-7000');
 return {amount:second?7000000000:2000000000,burnFile:second?'/private/minotari-faucet-burn-7000.json':'/private/minotari-faucet-burn.json',claimStage:second?'faucet7000BurnClaim':'faucetBurnClaim',depositStage:second?'faucet7000Deposit':'faucetDeposit',evidence:second?'esmeralda-faucet-7000':'esmeralda-faucet',flags:second?['--refill-7000']:[]};
}
