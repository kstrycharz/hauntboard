use tari_template_lib::prelude::*;
use tari_template_test_tooling::{TemplateTest, transaction::args};
use tari_template_test_tooling::engine_types::virtual_substate::{VirtualSubstate, VirtualSubstateId};

fn room(test: &mut TemplateTest, capacity: u32, closing: Option<u64>) -> ComponentAddress {
    test.call_function("HauntboxRoom", "new", args![vec![1u8;16], "localnet".to_string(), vec![2u8;32], vec![3u8;32], capacity, closing], vec![])
}
#[test]
fn signed_authority_and_public_read() {
    let mut test = TemplateTest::my_crate();
    let component = room(&mut test, 128, None);
    let receipt: (Vec<u8>, u64) = test.call_method(component, "seal", args![vec![4u8;32], vec![5u8;32]], vec![]);
    assert_eq!(receipt, (vec![5u8;32], 0));
    let (_, _, stranger) = test.create_empty_account();
    let rejection = test.execute_expect_failure(test.transaction().call_method(component, "seal", args![vec![6u8;32], vec![7u8;32]]).build_and_seal(&stranger), vec![]);
    assert!(rejection.to_string().to_lowercase().contains("access denied"));
    test.execute_expect_success(test.transaction().call_method(component, "get_receipt", args![vec![4u8;32]]).build_and_seal(&stranger), vec![]);
    let rejection = test.execute_expect_failure(test.transaction().call_method(component, "close", args![]).build_and_seal(&stranger), vec![]);
    assert!(rejection.to_string().to_lowercase().contains("access denied"));
}
#[test]
fn duplicate_immutable_capacity_close_and_absence() {
    let mut test = TemplateTest::my_crate(); let component = room(&mut test, 1, None);
    let first: (Vec<u8>,u64) = test.call_method(component, "seal", args![vec![4u8;32],vec![5u8;32]], vec![]);
    let repeated: (Vec<u8>,u64) = test.call_method(component, "seal", args![vec![4u8;32],vec![5u8;32]], vec![]); assert_eq!(first,repeated);
    let key = test.secret_key().clone();
    for (id,digest) in [(vec![4u8;32],vec![6u8;32]), (vec![7u8;32],vec![8u8;32])] { test.execute_expect_failure(test.transaction().call_method(component,"seal",args![id,digest]).build_and_seal(&key),vec![]); }
    test.call_method::<()>(component,"close",args![],vec![]);
    let after_close: (Vec<u8>,u64) = test.call_method(component,"seal",args![vec![4u8;32],vec![5u8;32]],vec![]); assert_eq!(first,after_close);
    let absent: Option<(Vec<u8>,u64)> = test.call_method(component,"get_receipt",args![vec![9u8;32]],vec![]); assert!(absent.is_none());
}
#[test]
fn malformed_config_and_entry_reject() {
    let mut test = TemplateTest::my_crate(); let key = test.secret_key().clone();
    for capacity in [0u32,129] { test.execute_expect_failure(test.transaction().call_function(test.get_template_address("HauntboxRoom"),"new",args![vec![1u8;16],"localnet".to_string(),vec![2u8;32],vec![3u8;32],capacity,None::<u64>]).build_and_seal(&key),vec![]); }
    let component = room(&mut test,128,None);
    for (id,digest) in [(vec![1u8;31],vec![2u8;32]),(vec![1u8;32],vec![2u8;33])] { test.execute_expect_failure(test.transaction().call_method(component,"seal",args![id,digest]).build_and_seal(&key),vec![]); }
}
#[test]
fn exact_epoch_boundary_and_immutable_config() {
    let mut test = TemplateTest::my_crate();
    let key = test.secret_key().clone();
    test.set_virtual_substate(VirtualSubstateId::CurrentEpoch, VirtualSubstate::CurrentEpoch(9));
    for closing in [8u64,9] {
        test.execute_expect_failure(test.transaction().call_function(test.get_template_address("HauntboxRoom"),"new",args![vec![1u8;16],"localnet".to_string(),vec![2u8;32],vec![3u8;32],128u32,Some(closing)]).build_and_seal(&key),vec![]);
    }
    let component=room(&mut test,128,Some(10));
    let first:(Vec<u8>,u64)=test.call_method(component,"seal",args![vec![4u8;32],vec![5u8;32]],vec![]);
    assert_eq!(first.1,9);
    test.set_virtual_substate(VirtualSubstateId::CurrentEpoch, VirtualSubstate::CurrentEpoch(10));
    test.execute_expect_failure(test.transaction().call_method(component,"seal",args![vec![6u8;32],vec![7u8;32]]).build_and_seal(&key),vec![]);
    let retry:(Vec<u8>,u64)=test.call_method(component,"seal",args![vec![4u8;32],vec![5u8;32]],vec![]);
    assert_eq!(retry,first);
    let metadata:(Vec<u8>,String,Vec<u8>,Vec<u8>,u32,Option<u64>,bool,u32)=test.call_method(component,"get_room",args![],vec![]);
    assert_eq!(metadata,(vec![1u8;16],"localnet".to_string(),vec![2u8;32],vec![3u8;32],128,Some(10),false,1));
}
