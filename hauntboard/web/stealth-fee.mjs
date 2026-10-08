// Tari's WASM creates commitments, range/balance proofs and one-time spend signatures.
import * as sdk from './vendor/wallet-sdk.mjs';
export const NATIVE=`resource_${'01'.repeat(32)}`;
export async function prepareStealthFee({provider,signer,coinId,networkByte,maxFee,mainInstructions,mainInputs,dryRun=false}){
  const crypto=new sdk.WasmStealthCrypto(networkByte),commitment=sdk.commitmentOf(coinId);
  if(!commitment||coinId!==sdk.stealthUtxoSubstateId(NATIVE,commitment))throw new Error('Select a native stealth fee output.');
  const row=await provider.getSubstate(coinId);
  if(row.verified!==true)throw new Error('Unverified stealth output.');
  const owned=await sdk.decryptOwnedUtxo(crypto,await signer.getViewSecret(),row,coinId);
  const fee=BigInt(maxFee);
  if(fee<=0n||fee>1000000n)throw new Error('Stealth fee exceeds the permitted ceiling.');
  if(!owned||owned.value<=fee)throw new Error(`An owned stealth output with enough private funds is required (${owned?'insufficient private balance':'output not owned'}).`);
  const address=await signer.getAddress(),ephemeral=sdk.EphemeralKeySigner.generate(networkByte),receiver=await ephemeral.getPublicKey();
  const output=sdk.createOutput({destination:address,amount:owned.value-fee,resourceAddress:NATIVE,memo:{Message:'hauntboard:posting-change:v1'}});
  const outputs=await crypto.generateOutputsStatement([output],{amount:fee,receiver});
  const input=new sdk.StealthInput(commitment),inputsStatement=await crypto.buildInputsStatement([input],0n);
  const statement=new sdk.StealthTransferStatement(inputsStatement,outputs.statement);
  const builder=new sdk.TransactionBuilder(networkByte,(await provider.getCurrentEpoch())+5)
    .addInstruction(sdk.stealthTransferInstruction({resourceAddress:NATIVE,revealedInputBucket:null,statement},()=>{throw new Error('No revealed input allowed.');}))
    .saveVar('private-fee')
    .addInstruction({PayFeeFromBucket:{bucket:{id:0,offset:null}}})
    .withInputs([{substate_id:coinId,version:row.version,is_write:true},...mainInputs]);
  const unsignedTx=await sdk.resolveTransaction(provider,builder.buildUnsignedTransaction());
  const wallet=new sdk.OotleWallet().registerKeyProvider(address,signer).setDefaultSigner(address);
  const spec={unsignedTx,statement,outputMask:outputs.outputMask,state:{resource:NATIVE,revealedInput:null,inputsToSpend:new Map([[coinId,{input,owner:address}]]),outputs:[output],revealedOutput:{amount:fee,receiver}},requiredSigners:[address],inputs:[{input,owner:address}]};
  const authorized=await sdk.WalletStealthAuthorizer.fromSpec(wallet,spec,{crypto,mustSignWithAccountKey:false}).prepare(provider);
  // SDK 0.7.0 hydrates a main-instruction stealth statement. Move the completed fee
  // program before generating ANY transaction signatures; fee/main workspaces differ.
  const transaction=authorized.getSpec().unsignedTx;
  transaction.fee_instructions=transaction.instructions;
  transaction.instructions=mainInstructions;
  transaction.dry_run=dryRun;
  const signatures=await ephemeral.signTransaction(transaction,authorized.getSealPublicKey());
  for(const signature of signatures)authorized.addSignature(signature);
  const envelope=await authorized.seal();
  return {envelope,transaction,coinId,feeStatement:JSON.parse(authorized.getSpec().statement.toCompactJson()),maxFee:fee.toString(),changePolicy:'Do not automatically spend change for the next post: the UTXO graph would link those posts.'};
}
