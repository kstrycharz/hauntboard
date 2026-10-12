use tari_template_lib::prelude::*;
use tari_template_test_tooling::{TemplateTest,transaction::args};
fn nonce(page:u32,seed:u8)->Vec<u8>{let mut n=vec![seed;16];n[..4].copy_from_slice(&page.to_le_bytes());n}
fn board(t:&mut TemplateTest)->ComponentAddress{t.call_function("Hauntboard","new",args!["Public Crypt".to_string()],vec![])}
fn thread(t:&mut TemplateTest,b:ComponentAddress)->ComponentAddress{t.call_method(b,"create_thread",args!["Public title".to_string(),0u8,vec![7u8;16],b"Public body".to_vec()],vec![])}
#[test]
fn public_state_has_no_author_and_reads_without_identity(){
 let mut t=TemplateTest::my_crate();let b=board(&mut t);let c=thread(&mut t,b);
 let post:(Vec<u8>,i32,Vec<u8>,u64)=t.call_method(c,"get_post",args![0u32],vec![]);
 assert_eq!(post.2,b"Public body");assert_eq!(post.1,-1);
 let state:(u32,bool,String,String,u8,Vec<u8>,Vec<(String,String,u8,Vec<u8>)>,Vec<(Vec<u8>,i32,Vec<u8>,u64)>,Vec<String>,u32,String,u32)=t.call_method(b,"get_state",args![],vec![]);
 assert_eq!(state.0,4);assert_eq!(state.6[0].1,"Public title");
}
#[test]
fn retries_survive_a_changed_one_time_signer_and_conflicts_fail(){
 let mut t=TemplateTest::my_crate();let b=board(&mut t);let c=thread(&mut t,b);let (_,_,stranger)=t.create_empty_account();
 t.execute_expect_success(t.transaction().call_method(c,"append",args![nonce(0,8),0i32,b"Reply".to_vec()]).build_and_seal(&stranger),vec![]);
 let index:u32=t.call_method(c,"append",args![nonce(0,8),0i32,b"Reply".to_vec()],vec![]);assert_eq!(index,1);
 let key=t.secret_key().clone();t.execute_expect_failure(t.transaction().call_method(c,"append",args![nonce(0,8),0i32,b"Changed".to_vec()]).build_and_seal(&key),vec![]);
 t.execute_expect_success(t.transaction().call_method(b,"create_thread",args!["Public title".to_string(),0u8,vec![7u8;16],b"Public body".to_vec()]).build_and_seal(&stranger),vec![]);
 let counts:(u32,u32)=t.call_method(b,"get_counts",args![],vec![]);assert_eq!(counts.0,1);
}
#[test]
fn sealed_mode_and_invalid_payload_bounds_fail_atomically(){
 let mut t=TemplateTest::my_crate();let b=board(&mut t);let key=t.secret_key().clone();
 for (mode,payload) in [(1u8,vec![1u8]),(0u8,vec![]),(0u8,vec![1u8;4097])]{t.execute_expect_failure(t.transaction().call_method(b,"create_thread",args!["Title".to_string(),mode,vec![1u8;16],payload]).build_and_seal(&key),vec![]);}
 let counts:(u32,u32)=t.call_method(b,"get_counts",args![],vec![]);assert_eq!(counts,(0,0));
}
#[test]
fn pages_keep_public_history_and_block_direct_mutation(){
 let mut t=TemplateTest::my_crate();let b=board(&mut t);let c=thread(&mut t,b);
 for i in 1..34u32{let index:u32=t.call_method(c,"append",args![nonce(i/16,i as u8),0i32,vec![i as u8;4096]],vec![]);assert_eq!(index,i);}
 let retry:u32=t.call_method(c,"append",args![nonce(1,31),0i32,vec![31u8;4096]],vec![]);assert_eq!(retry,31);
 let post:(Vec<u8>,i32,Vec<u8>,u64)=t.call_method(c,"get_post",args![31u32],vec![]);assert_eq!(post.2,vec![31u8;4096]);
 let state:(u32,bool,String,String,u8,Vec<u8>,Vec<(String,String,u8,Vec<u8>)>,Vec<(Vec<u8>,i32,Vec<u8>,u64)>,Vec<String>,u32,String,u32)=t.call_method(c,"get_state",args![],vec![]);
 let key=t.secret_key().clone();t.execute_expect_failure(t.transaction().call_method(state.8[0].parse::<ComponentAddress>().unwrap(),"page_append",args![nonce(0,90),0i32,vec![1u8]]).build_and_seal(&key),vec![]);
 t.execute_expect_failure(t.transaction().call_method(c,"append",args![nonce(0,91),0i32,vec![1u8]]).build_and_seal(&key),vec![]);
}
#[test]
fn complete_public_capacity_keeps_full_bytes_and_exact_retries(){
 let mut t=TemplateTest::my_crate();let b=board(&mut t);let c=thread(&mut t,b);
 for i in 1..2048u32{let mut n=vec![0u8;16];n[..4].copy_from_slice(&(i/16).to_le_bytes());n[4..8].copy_from_slice(&i.to_le_bytes());let index:u32=t.call_method(c,"append",args![n,0i32,vec![(i%256)as u8;4096]],vec![]);assert_eq!(index,i);}
 let key=t.secret_key().clone();t.execute_expect_failure(t.transaction().call_method(c,"append",args![nonce(128,1),0i32,vec![1u8]]).build_and_seal(&key),vec![]);
 let post:(Vec<u8>,i32,Vec<u8>,u64)=t.call_method(c,"get_post",args![2047u32],vec![]);assert_eq!(post.2,vec![255u8;4096]);
 let mut n=vec![0u8;16];n[..4].copy_from_slice(&127u32.to_le_bytes());n[4..8].copy_from_slice(&2047u32.to_le_bytes());let index:u32=t.call_method(c,"append",args![n,0i32,vec![255u8;4096]],vec![]);assert_eq!(index,2047);
}
