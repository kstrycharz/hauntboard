use tari_template_lib::prelude::*;
use tari_template_test_tooling::{TemplateTest, transaction::args};

fn nonce(page: u32, seed: u32) -> Vec<u8> { let mut n=vec![0u8;16]; n[..4].copy_from_slice(&page.to_le_bytes()); n[4..8].copy_from_slice(&seed.to_le_bytes()); n }

fn board(t: &mut TemplateTest) -> ComponentAddress {
    t.call_function("Hauntboard", "new", args!["The Crypt".to_string()], vec![])
}
fn thread(t: &mut TemplateTest, board: ComponentAddress) -> ComponentAddress {
    t.call_method(board, "create_thread", args!["A haunting".to_string(), 0u8, vec![1u8;16], b"Full on-chain text".to_vec()], vec![])
}
#[test]
fn full_bytes_independent_signer_and_retry() {
    let mut t = TemplateTest::my_crate(); let b = board(&mut t); let c = thread(&mut t, b);
    let repeated: ComponentAddress = t.call_method(b,"create_thread",args!["A haunting".to_string(),0u8,vec![1u8;16],b"Full on-chain text".to_vec()],vec![]);
    assert_eq!(c, repeated);
    let (n,_): (u32,u32) = t.call_method(b,"get_counts",args![],vec![]); assert_eq!(n,1);
    let (_,_,stranger) = t.create_empty_account();
    t.execute_expect_success(t.transaction().call_method(c,"append",args![nonce(0,2),0i32,b"Independent reply".to_vec()]).build_and_seal(&stranger),vec![]);
    t.execute_expect_success(t.transaction().call_method(c,"append",args![nonce(0,2),0i32,b"Independent reply".to_vec()]).build_and_seal(&stranger),vec![]);
    let (_,n):(u32,u32) = t.call_method(c,"get_counts",args![],vec![]); assert_eq!(n,2);
    let p:(Vec<u8>,String,i32,Vec<u8>,u64) = t.call_method(c,"get_post",args![1u32],vec![]);
    assert_eq!(p.3,b"Independent reply"); assert_eq!(p.2,0);
    t.execute_expect_failure(t.transaction().call_method(c,"append",args![nonce(0,2),0i32,b"Changed".to_vec()]).build_and_seal(&stranger),vec![]);
}
#[test]
fn bounds_parent_mode_and_atomic_failure() {
    let mut t=TemplateTest::my_crate(); let b=board(&mut t); let c=thread(&mut t,b); let key=t.secret_key().clone();
    for payload in [vec![], vec![0u8;4097]] {
        t.execute_expect_failure(t.transaction().call_method(c,"append",args![vec![3u8;16],-1i32,payload]).build_and_seal(&key),vec![]);
    }
    t.execute_expect_failure(t.transaction().call_method(c,"append",args![vec![3u8;16],99i32,vec![0u8;10]]).build_and_seal(&key),vec![]);
    for (title,mode) in [("Leaked secret",1u8),("Bad mode",2u8)] {
        t.execute_expect_failure(t.transaction().call_method(b,"create_thread",args![title.to_string(),mode,vec![3u8;16],vec![0u8;10]]).build_and_seal(&key),vec![]);
    }
    let counts:(u32,u32)=t.call_method(b,"get_counts",args![],vec![]); assert_eq!(counts,(1,0));
    t.execute_expect_failure(t.transaction().call_method(b,"append",args![vec![3u8;16],-1i32,vec![0u8;10]]).build_and_seal(&key),vec![]);
    t.execute_expect_failure(t.transaction().call_method(c,"create_thread",args!["Wrong component".to_string(),0u8,vec![3u8;16],vec![0u8;10]]).build_and_seal(&key),vec![]);
}
#[test]
fn complete_capacity_keeps_history_and_allows_exact_retry() {
    let mut t=TemplateTest::my_crate(); let b=board(&mut t); let c=thread(&mut t,b);
    for i in 1..2048u32 { let n:u32=t.call_method(c,"append",args![nonce(i/16,i),0i32,vec![(i%256) as u8;4096]],vec![]); assert_eq!(n,i); }
    let key=t.secret_key().clone();
    t.execute_expect_failure(t.transaction().call_method(c,"append",args![nonce(128,2048),-1i32,vec![1u8]]).build_and_seal(&key),vec![]);
    let n:u32=t.call_method(c,"append",args![nonce(1,31),0i32,vec![31u8;4096]],vec![]); assert_eq!(n,31);
    let first:Vec<u8>=t.call_method(c,"get_first_payload",args![],vec![]); assert_eq!(first,b"Full on-chain text");
    let p:(Vec<u8>,String,i32,Vec<u8>,u64)=t.call_method(c,"get_post",args![31u32],vec![]); assert_eq!(p.3.len(),4096);
}
#[test]
fn stale_page_and_direct_page_mutation_are_rejected() {
    let mut t=TemplateTest::my_crate(); let b=board(&mut t); let c=thread(&mut t,b);
    for i in 1..17u32 { let _:u32=t.call_method(c,"append",args![nonce(i/16,i),0i32,vec![1u8]],vec![]); }
    let key=t.secret_key().clone();
    t.execute_expect_failure(t.transaction().call_method(c,"append",args![nonce(0,77),0i32,vec![1u8]]).build_and_seal(&key),vec![]);
    let state:(u32,bool,String,String,u8,Vec<u8>,Vec<String>,Vec<String>,Vec<String>,u32,String,u32)=t.call_method(c,"get_state",args![],vec![]);
    let page:ComponentAddress=state.8[1].parse().unwrap();
    t.execute_expect_failure(t.transaction().call_method(page,"page_append",args![nonce(1,77),0i32,vec![1u8]]).build_and_seal(&key),vec![]);
    t.execute_expect_failure(t.transaction().call_method(page,"append",args![nonce(1,77),0i32,vec![1u8]]).build_and_seal(&key),vec![]);
}
#[test]
fn secret_ciphertext_and_thread_uid_conflict() {
    let mut t=TemplateTest::my_crate(); let b=board(&mut t);
    let ciphertext=vec![200u8;4096];
    let c:ComponentAddress=t.call_method(b,"create_thread",args!["Sealed thread".to_string(),1u8,vec![9u8;16],ciphertext.clone()],vec![]);
    let bytes:Vec<u8>=t.call_method(c,"get_first_payload",args![],vec![]); assert_eq!(bytes,ciphertext);
    let key=t.secret_key().clone();
    t.execute_expect_failure(t.transaction().call_method(b,"create_thread",args!["Sealed thread".to_string(),1u8,vec![9u8;16],vec![201u8;4096]]).build_and_seal(&key),vec![]);
    let (_,_,stranger)=t.create_empty_account();
    t.execute_expect_failure(t.transaction().call_method(b,"create_thread",args!["Sealed thread".to_string(),1u8,vec![9u8;16],ciphertext]).build_and_seal(&stranger),vec![]);
}


