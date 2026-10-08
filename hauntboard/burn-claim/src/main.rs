// Native operator adapter; all proof validation, decryption and signing use Tari libraries.
mod l1_proof;
use anyhow::{ensure, Result};
use base64::Engine;
use ootle_byte_type::{ConvertFromByteType, ToByteType};
use ootle_network::Network;
use tari_crypto::{keys::PublicKey, ristretto::{RistrettoPublicKey, RistrettoSecretKey}};
use tari_engine_types::confidential::ClaimBurnOutputData;
use tari_ootle_common_types::{Epoch, InputDeclaration};
use tari_ootle_transaction::Transaction;
use tari_ootle_wallet_crypto::{StealthCryptoApi, StealthInputWitness};
use tari_sidechain::CompleteClaimBurnProof;
use tari_template_lib_types::{Amount, EncryptedData, constants::TARI_TOKEN, stealth::RevealedOutput};
use tari_utilities::hex::Hex;

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    ensure!((5..=7).contains(&args.len()), "Expected proof path, fee, max epoch, dry-run flag, optional expected amount and declared inputs");
    let expected_value: u64 = if args.len() >= 6 { args[5].parse()? } else { 10_000_000 };
    ensure!(expected_value == 10_000_000 || expected_value == 2_000_000_000 || expected_value == 7_000_000_000, "Unexpected authorized conversion amount");
    let inputs: Vec<InputDeclaration> = if args.len() == 7 {
        ensure!(args[6] == "/private/burn-claim-inputs.json", "Unexpected input manifest path");
        serde_json::from_slice(&std::fs::read(&args[6])?)?
    } else { Vec::new() };
    let fee: u64 = args[2].parse()?;
    ensure!(fee > 0 && fee <= 1_000_000, "Claim fee ceiling exceeded");
    let journal: serde_json::Value = serde_json::from_slice(&std::fs::read("/private/esmeralda-deployment.json")?)?;
    let owner = RistrettoSecretKey::from_hex(journal["owner"].as_str().ok_or_else(|| anyhow::anyhow!("Missing owner"))?).map_err(|_| anyhow::anyhow!("Invalid owner key"))?;
    let owner_pk = RistrettoPublicKey::from_secret_key(&owner).to_byte_type();
    ensure!(owner_pk.to_string() == journal["publicKey"].as_str().unwrap_or(""), "Wallet key mismatch");
    let complete: CompleteClaimBurnProof = serde_json::from_slice(&std::fs::read(&args[1])?)?;
    let claim = l1_proof::claim_proof_from_l1(&complete.claim_proof).map_err(anyhow::Error::msg)?;
    ensure!(claim.value == expected_value && claim.output.features.sidechain_id.is_none(), "Unexpected burn target or amount");
    let crypto = StealthCryptoApi::new();
    let sender = RistrettoPublicKey::convert_from_byte_type(&claim.output.sender_offset_public_key).map_err(|_| anyhow::anyhow!("Invalid burn sender key"))?;
    let secret = crypto.derive_burn_claim_stealth_secret(&owner, &sender);
    let pk = RistrettoPublicKey::from_secret_key(&secret).to_byte_type();
    ensure!(pk == claim.output.features.claim_public_key, "Burn belongs to another wallet");
    ensure!(crypto.validate_burn_claim_ownership_proof(Network::Esmeralda, &claim.ownership_proof, &claim.commitment, claim.value, &pk), "Invalid ownership proof");
    let encrypted_data = EncryptedData::try_from(complete.encrypted_data).map_err(|_| anyhow::anyhow!("Invalid encrypted data"))?;
    let decrypted = crypto.decrypt_utxo_data(&encrypted_data, &claim.commitment, &owner, &sender, true)?;
    ensure!(decrypted.value() == claim.value, "Burn value mismatch");
    // Operator deployment funds are revealed into its account. Visitor posting funds use the separate stealth wallet flow.
    let statement = crypto.generate_transfer_statement(std::iter::once(StealthInputWitness::new(decrypted.into_mask_and_value())), Amount::zero(), std::iter::empty(), Some(RevealedOutput::new(Amount::from(claim.value), pk)))?;
    let tx = Transaction::builder(Network::Esmeralda.as_byte(), Epoch(args[3].parse()?))
        .with_inputs(inputs)
        .with_fee_instructions_builder(|f| f.claim_burn(claim, ClaimBurnOutputData { encrypted_data })
            .stealth_transfer(TARI_TOKEN, statement).put_last_instruction_output_on_workspace("burn")
            .take_from_bucket("burn", Amount::from(fee), "fee").pay_fee_from_bucket("fee")
            .create_account_with_bucket(owner_pk, "burn"))
        .with_dry_run(args[4] == "true").build_and_seal(&secret);
    println!("{}", serde_json::json!({"transaction":base64::engine::general_purpose::STANDARD.encode(tari_bor::encode(&tx)?),"transactionId":tx.calculate_id().to_string(),"maxFee":fee.to_string()}));
    Ok(())
}
