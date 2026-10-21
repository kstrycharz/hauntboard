use tari_template_lib::prelude::*;
use tari_template_test_tooling::{TemplateTest, transaction::args, byte_type::ToByteType};
fn entries(seed:u8)->Vec<(Vec<u8>,Vec<u8>)>{vec![(vec![seed;32],vec![seed;128])]}
fn registry(t:&mut TemplateTest)->ComponentAddress{
    let pk=t.public_key().to_byte_type();
    t.call_function("KeyRegistry","new",args!["synthetic-scope".to_string(),format!("component_{}","aa".repeat(32)),format!("component_{}","bb".repeat(32)),pk,entries(1)],vec![])
}
type State=(u32,String,String,String,RistrettoPublicKeyBytes,u32,u32,Vec<Vec<(Vec<u8>,Vec<u8>)>>);
fn state(t:&mut TemplateTest,c:ComponentAddress)->State{t.call_method(c,"get_state",args![],vec![])}
#[test]
fn strangers_cannot_grant_or_rotate_but_can_read_ciphertext(){
    let mut t=TemplateTest::my_crate();let c=registry(&mut t);let (_,_,stranger)=t.create_empty_account();
    t.execute_expect_failure(t.transaction().call_method(c,"grant",args![0u32,vec![2u8;32],vec![2u8;128]]).build_and_seal(&stranger),vec![]);
    t.execute_expect_failure(t.transaction().call_method(c,"rotate",args![0u32,entries(2)]).build_and_seal(&stranger),vec![]);
    t.execute_expect_success(t.transaction().call_method(c,"get_state",args![]).build_and_seal(&stranger),vec![]);
    assert_eq!(state(&mut t,c).6,0);
}
#[test]
fn grant_rotation_and_historical_envelopes_are_atomic(){
    let mut t=TemplateTest::my_crate();let c=registry(&mut t);
    let _:()=t.call_method(c,"grant",args![0u32,vec![2u8;32],vec![2u8;128]],vec![]);
    let _:()=t.call_method(c,"rotate",args![1u32,entries(1)],vec![]);
    let s=state(&mut t,c);assert_eq!(s.5,1);assert_eq!(s.6,2);assert_eq!(s.7[0].len(),2);assert_eq!(s.7[1].len(),1);
    let key=t.secret_key().clone();
    t.execute_expect_failure(t.transaction().call_method(c,"rotate",args![1u32,entries(3)]).build_and_seal(&key),vec![]);
    t.execute_expect_failure(t.transaction().call_method(c,"grant",args![1u32,vec![3u8;32],vec![3u8;128]]).build_and_seal(&key),vec![]);
    assert_eq!(state(&mut t,c).6,2);
}
#[test]
fn invalid_members_do_not_change_state_and_generations_are_bounded(){
    let mut t=TemplateTest::my_crate();let c=registry(&mut t);let key=t.secret_key().clone();
    for bad in [vec![],vec![(vec![2u8;31],vec![1u8])],vec![(vec![2u8;32],vec![])],vec![(vec![2u8;32],vec![1u8;3073])],vec![(vec![2u8;32],vec![1u8]),(vec![2u8;32],vec![2u8])],(0..17).map(|i|(vec![i;32],vec![i;128])).collect()] {
        t.execute_expect_failure(t.transaction().call_method(c,"rotate",args![0u32,bad]).build_and_seal(&key),vec![]);
    }
    assert_eq!(state(&mut t,c).6,0);
    t.execute_expect_failure(t.transaction().call_method(c,"grant",args![0u32,vec![1u8;32],vec![2u8]]).build_and_seal(&key),vec![]);
    for revision in 0..15u32{let _:()=t.call_method(c,"rotate",args![revision,entries((revision+2)as u8)],vec![]);}
    t.execute_expect_failure(t.transaction().call_method(c,"rotate",args![15u32,entries(50)]).build_and_seal(&key),vec![]);
    assert_eq!(state(&mut t,c).5,15);
}
#[test]
fn constructor_requires_possession_of_the_claimed_admin_key(){
    let mut t=TemplateTest::my_crate();let pk=t.public_key().to_byte_type();let (_,_,stranger)=t.create_empty_account();let template=t.get_template_address("KeyRegistry");
    t.execute_expect_failure(t.transaction().call_function(template,"new",args!["scope".to_string(),format!("component_{}","aa".repeat(32)),format!("component_{}","bb".repeat(32)),pk,entries(1)]).build_and_seal(&stranger),vec![]);
}
