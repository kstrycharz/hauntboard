use tari_template_test_tooling::transaction::args;
use tari_template_lib::prelude::*;
use tari_template_test_tooling::{TemplateTest, xtr_faucet_component};
use tari_template_test_tooling::{
    byte_type::ToByteType,
    crypto::{PublicKey, RistrettoPublicKey},
    support::{
        spec::{OutputAuthSpec, OutputSpec},
        stealth,
    },
};

#[test]
fn receipt_roundtrip_with_faucet_funded_account() {
    let mut test = TemplateTest::my_crate();
    let (_account, _proof, _key) = test.create_funded_account();
    let vaults = test
        .read_only_state_store()
        .get_vaults_for_account(_account)
        .unwrap();
    assert_eq!(
        vaults[&TARI_TOKEN].balance(),
        Amount::from(TemplateTest::FUNDED_ACCOUNT_INITIAL_BALANCE)
    );
    let digest = vec![7u8; 32];
    let component: ComponentAddress =
        test.call_function("HauntboxReceiptSpike", "new", args![digest.clone()], vec![]);
    let receipt: (Vec<u8>, u64) = test.call_method(component, "get_receipt", args![], vec![]);
    assert_eq!(receipt, (digest, 0));
}

#[test]
fn faucet_funds_independent_receiver_then_receiver_spends() {
    let mut test = TemplateTest::my_crate();
    let (sender, _, sender_key) = test.create_funded_account();
    let (receiver, _, receiver_key) = test.create_empty_account();
    assert_ne!(sender, receiver);
    test.execute_expect_success(
        test.transaction()
            .call_method(sender, "withdraw", args![TARI_TOKEN, 100u64])
            .put_last_instruction_output_on_workspace("funds")
            .call_method(receiver, "deposit", args![Workspace("funds")])
            .build_and_seal(&sender_key),
        vec![],
    );
    test.execute_expect_success(
        test.transaction()
            .call_method(receiver, "withdraw", args![TARI_TOKEN, 40u64])
            .put_last_instruction_output_on_workspace("funds")
            .call_method(sender, "deposit", args![Workspace("funds")])
            .build_and_seal(&receiver_key),
        vec![],
    );
    let vaults = test
        .read_only_state_store()
        .get_vaults_for_account(receiver)
        .unwrap();
    assert_eq!(vaults[&TARI_TOKEN].balance(), Amount::from(60u64));
    let reason = test.execute_expect_failure(
        test.transaction()
            .call_method(receiver, "withdraw", args![TARI_TOKEN, 1u64])
            .build_and_seal(&sender_key),
        vec![],
    );
    assert!(reason.to_string().to_lowercase().contains("access denied"));
}

#[test]
fn faucet_rejects_second_claim_for_same_account() {
    let mut test = TemplateTest::my_crate();
    let (account, _, key) = test.create_funded_account();
    let before = test
        .read_only_state_store()
        .get_vaults_for_account(account)
        .unwrap()[&TARI_TOKEN]
        .balance();
    let reason = test.execute_expect_failure(
        test.transaction()
            .call_method(
                xtr_faucet_component(),
                "take",
                args![ComponentManager::get(account)],
            )
            .build_and_seal(&key),
        vec![],
    );
    assert!(reason.to_string().contains("Duplicate"));
    assert_eq!(
        test.read_only_state_store()
            .get_vaults_for_account(account)
            .unwrap()[&TARI_TOKEN]
            .balance(),
        before
    );
}

#[test]
fn native_concealed_transfer_change_and_receiver_spend() {
    let mut test = TemplateTest::my_crate();
    let (sender, _, sender_key) = test.create_funded_account();
    let (_, _, receiver_key) = test.create_empty_account();
    let sender_pk = RistrettoPublicKey::from_secret_key(&sender_key).to_byte_type();
    let receiver_pk = RistrettoPublicKey::from_secret_key(&receiver_key).to_byte_type();
    // Faucet acquisition is revealed. Convert once, then spend from an existing concealed input.
    // The official harness generates proofs; its synthetic encrypted_data does not prove memo recovery.
    let initial = stealth::generate_transfer_data(
        stealth::NO_INPUTS,
        Amount::from(1000u64),
        [OutputSpec::new(1000, OutputAuthSpec::KeyPath(sender_pk))],
        Amount::zero(),
    );
    test.execute_expect_success(
        test.transaction()
            .call_method(sender, "withdraw", args![TARI_TOKEN, 1000u64])
            .put_last_instruction_output_on_workspace("input")
            .stealth_transfer_with_input_bucket(TARI_TOKEN, initial.statement.clone(), "input")
            .build_and_seal(&sender_key),
        vec![],
    );
    let transfer = stealth::generate_transfer_data(
        [initial.input_spec_for(0, 1000)],
        Amount::zero(),
        [
            OutputSpec::new(600, OutputAuthSpec::KeyPath(receiver_pk)),
            OutputSpec::new(400, OutputAuthSpec::KeyPath(sender_pk)),
        ],
        Amount::zero(),
    );
    assert_eq!(
        transfer.statement.inputs_statement.revealed_amount,
        Amount::zero()
    );
    assert!(
        transfer
            .statement
            .outputs_statement
            .revealed_output
            .is_none()
    );
    let result = test.execute_expect_success(
        test.transaction()
            .stealth_transfer(TARI_TOKEN, transfer.statement.clone())
            .build_and_seal(&sender_key),
        vec![],
    );
    assert_eq!(
        result
            .finalize
            .any_accept()
            .unwrap()
            .up_iter()
            .filter(|(_, substate)| substate
                .substate_value()
                .as_utxo()
                .and_then(|u| u.output())
                .is_some())
            .count(),
        2
    );
    let onward = stealth::generate_transfer_data(
        [transfer.input_spec_for(0, 600)],
        Amount::zero(),
        [OutputSpec::new(600, OutputAuthSpec::KeyPath(receiver_pk))],
        Amount::zero(),
    );
    let rejected = test.execute_expect_failure(
        test.transaction()
            .stealth_transfer(TARI_TOKEN, onward.statement.clone())
            .build_and_seal(&sender_key),
        vec![],
    );
    assert!(rejected.to_string().contains("InvalidProof"));
    assert!(
        rejected
            .to_string()
            .contains("was not provided or is not in scope")
    );
    test.execute_expect_success(
        test.transaction()
            .stealth_transfer(TARI_TOKEN, onward.statement)
            .build_and_seal(&receiver_key),
        vec![],
    );
}

#[test]
fn faucet_bootstrap_pays_fees_from_claimed_funds() {
    let mut test = TemplateTest::my_crate();
    let (account, _, key) = test.create_empty_account();
    test.enable_fees();
    let result = test.execute_expect_success(
        test.transaction()
            .with_fee_instructions_builder(|builder| {
                builder
                    .call_method(
                        xtr_faucet_component(),
                        "take",
                        args![ComponentManager::get(account)],
                    )
                    .call_method(account, "pay_fee", args![100_000u64])
            })
            .build_and_seal(&key),
        vec![],
    );
    assert!(result.finalize.fee_receipt.is_paid_in_full());
    assert!(result.finalize.fee_receipt.total_fees_charged() > 0);
    let balance = test
        .read_only_state_store()
        .get_vaults_for_account(account)
        .unwrap()[&TARI_TOKEN]
        .balance();
    assert_eq!(
        balance,
        Amount::from(TemplateTest::FUNDED_ACCOUNT_INITIAL_BALANCE)
            - result.finalize.fee_receipt.total_fees_charged()
    );
}

#[test]
fn invalid_digest_is_rejected_by_engine() {
    let mut test = TemplateTest::my_crate();
    let template = test.get_template_address("HauntboxReceiptSpike");
    let reason = test.execute_expect_failure(
        test.transaction()
            .call_function(template, "new", args![vec![0u8; 31]])
            .build_and_seal(test.secret_key()),
        vec![],
    );
    assert!(
        reason
            .to_string()
            .contains("Digest must contain exactly 32 bytes")
    );
}
