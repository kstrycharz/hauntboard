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

type State = (u32,bool,String,String,u8,Vec<u8>,Vec<(String,String,u8,Vec<u8>)>,Vec<(Vec<u8>,i32,Vec<u8>,u64)>,Vec<String>,u32,String,u32);
fn state(t:&mut TemplateTest,c:ComponentAddress)->State {t.call_method(c,"get_state",args![],vec![])}
fn counts(t:&mut TemplateTest,c:ComponentAddress)->(u32,u32){t.call_method(c,"get_counts",args![],vec![])}

#[test]
fn copied_pending_identity_is_content_idempotent_and_conflicts_preserve_history(){
 let mut t=TemplateTest::my_crate();let b=board(&mut t);let (_,_,copyist)=t.create_empty_account();
 let tx=t.transaction().call_method(b,"create_thread",args!["Public title".to_string(),0u8,vec![7u8;16],b"Public body".to_vec()]).build_and_seal(&copyist);
 t.execute_expect_success(tx,vec![]);let c=thread(&mut t,b);assert_eq!(counts(&mut t,b),(1,0));
 let key=t.secret_key().clone();let before=state(&mut t,c);
 for (title,payload) in [("Changed title",b"Public body".to_vec()),("Public title",b"Changed body".to_vec())]{
  t.execute_expect_failure(t.transaction().call_method(b,"create_thread",args![title.to_string(),0u8,vec![7u8;16],payload]).build_and_seal(&key),vec![]);
 }
 let copied=t.transaction().call_method(c,"append",args![nonce(0,8),0i32,b"Copied public bytes".to_vec()]).build_and_seal(&copyist);
 t.execute_expect_success(copied,vec![]);
 let index:u32=t.call_method(c,"append",args![nonce(0,8),0i32,b"Copied public bytes".to_vec()],vec![]);assert_eq!(index,1);
 for (parent,payload) in [(-1i32,b"Copied public bytes".to_vec()),(0i32,b"Conflicting first use".to_vec())]{
  t.execute_expect_failure(t.transaction().call_method(c,"append",args![nonce(0,8),parent,payload]).build_and_seal(&key),vec![]);
 }
 assert_eq!(counts(&mut t,c),(0,2));assert_eq!(state(&mut t,c).8,before.8);
 let another:ComponentAddress=t.call_method(b,"create_thread",args!["Another".to_string(),0u8,vec![6u8;16],vec![1u8]],vec![]);
 let own_index:u32=t.call_method(another,"append",args![nonce(0,8),0i32,b"Different thread".to_vec()],vec![]);assert_eq!(own_index,1);
}

#[test]
fn input_boundaries_and_role_rejections_leave_state_unchanged(){
 let mut t=TemplateTest::my_crate();let b=board(&mut t);let c=thread(&mut t,b);let key=t.secret_key().clone();
 for title in ["".to_string()," \n\t".to_string(),"x".repeat(81),"é".repeat(41)]{
  t.execute_expect_failure(t.transaction().call_method(b,"create_thread",args![title,0u8,vec![2u8;16],vec![1u8]]).build_and_seal(&key),vec![]);
 }
 let boundary:ComponentAddress=t.call_method(b,"create_thread",args!["é".repeat(40),0u8,vec![2u8;16],vec![1u8;4096]],vec![]);
 assert_eq!(counts(&mut t,boundary),(0,1));
 for n in [0usize,15,17]{
  t.execute_expect_failure(t.transaction().call_method(b,"create_thread",args!["Title".to_string(),0u8,vec![3u8;n],vec![1u8]]).build_and_seal(&key),vec![]);
  t.execute_expect_failure(t.transaction().call_method(c,"append",args![vec![3u8;n],0i32,vec![1u8]]).build_and_seal(&key),vec![]);
 }
 for parent in [-2i32,1,i32::MAX]{t.execute_expect_failure(t.transaction().call_method(c,"append",args![nonce(0,9),parent,vec![1u8]]).build_and_seal(&key),vec![]);}
 for payload in [vec![],vec![1u8;4097]]{t.execute_expect_failure(t.transaction().call_method(c,"append",args![nonce(0,9),0i32,payload]).build_and_seal(&key),vec![]);}
 t.execute_expect_failure(t.transaction().call_method(b,"append",args![nonce(0,9),-1i32,vec![1u8]]).build_and_seal(&key),vec![]);
 t.execute_expect_failure(t.transaction().call_method(c,"create_thread",args!["Wrong role".to_string(),0u8,vec![4u8;16],vec![1u8]]).build_and_seal(&key),vec![]);
 assert_eq!(counts(&mut t,b),(2,0));assert_eq!(counts(&mut t,c),(0,1));
}

#[test]
fn full_board_rejects_new_thread_but_preserves_exact_retry(){
 let mut t=TemplateTest::my_crate();let b=board(&mut t);let first=thread(&mut t,b);
 for i in 1..128u32{let mut uid=vec![0u8;16];uid[4..8].copy_from_slice(&i.to_le_bytes());let _:ComponentAddress=t.call_method(b,"create_thread",args![format!("Thread {i}"),0u8,uid,vec![1u8]],vec![]);}
 let key=t.secret_key().clone();t.execute_expect_failure(t.transaction().call_method(b,"create_thread",args!["Overflow".to_string(),0u8,vec![8u8;16],vec![1u8]]).build_and_seal(&key),vec![]);
 assert_eq!(thread(&mut t,b),first);assert_eq!(counts(&mut t,b),(128,0));
}

#[test]
fn page_reads_reject_outside_global_range_and_rules_are_immutable(){
 let mut t=TemplateTest::my_crate();let b=board(&mut t);let c=thread(&mut t,b);
 for i in 1..18u32{let _:u32=t.call_method(c,"append",args![nonce(i/16,i as u8),0i32,vec![i as u8]],vec![]);}
 let s=state(&mut t,c);let page=s.8[1].parse::<ComponentAddress>().unwrap();let key=t.secret_key().clone();let (_,_,stranger)=t.create_empty_account();
 for index in [0u32,15,18,u32::MAX]{t.execute_expect_failure(t.transaction().call_method(page,"get_post",args![index]).build_and_seal(&key),vec![]);}
 let p:(Vec<u8>,i32,Vec<u8>,u64)=t.call_method(page,"get_post",args![16u32],vec![]);assert_eq!(p.2,vec![16u8]);
 for target in [b,c,page]{for signer in [&key,&stranger]{
  t.execute_expect_failure(t.transaction().call_method(target,"set_component_access_rules",args![ComponentAccessRules::allow_all()]).build_and_seal(signer),vec![]);
  t.execute_expect_failure(t.transaction().call_method(target,"set_component_owner_rule",args![OwnerRule::OwnedBySigner]).build_and_seal(signer),vec![]);
 }}
 assert_eq!(counts(&mut t,page),(0,2));assert_eq!(state(&mut t,c).8,s.8);
}

#[test]
fn unrelated_component_cannot_write_a_page(){
 let mut t=TemplateTest::new(env!("CARGO_MANIFEST_DIR"),[".","tests/proxy"]);let b=board(&mut t);let c=thread(&mut t,b);
 let page=state(&mut t,c).8[0].parse::<ComponentAddress>().unwrap();let proxy:ComponentAddress=t.call_function("Proxy","new",args![],vec![]);let key=t.secret_key().clone();
 t.execute_expect_failure(t.transaction().call_method(proxy,"write_page",args![page]).build_and_seal(&key),vec![]);
 assert_eq!(counts(&mut t,page),(0,1));assert_eq!(counts(&mut t,c),(0,1));
}

#[test]
fn competing_rollover_intents_reject_stale_page_without_partial_mutation(){
 let mut t=TemplateTest::my_crate();let b=board(&mut t);let c=thread(&mut t,b);let key=t.secret_key().clone();let (_,_,other)=t.create_empty_account();
 for boundary in [16u32,32]{
  while counts(&mut t,c).1<boundary-1{let i=counts(&mut t,c).1;let _:u32=t.call_method(c,"append",args![nonce(i/16,i as u8),0i32,vec![1u8]],vec![]);}
  let page=(boundary-1)/16;
  let first=t.transaction().call_method(c,"append",args![nonce(page,100),0i32,vec![2u8]]).build_and_seal(&key);
  let stale=t.transaction().call_method(c,"append",args![nonce(page,101),0i32,vec![3u8]]).build_and_seal(&other);
  t.execute_expect_success(first,vec![]);let before=state(&mut t,c);t.execute_expect_failure(stale,vec![]);assert_eq!(state(&mut t,c).8,before.8);assert_eq!(counts(&mut t,c).1,boundary);
  let next:u32=t.call_method(c,"append",args![nonce(boundary/16,102),0i32,vec![3u8]],vec![]);assert_eq!(next,boundary);
  let s=state(&mut t,c);let mut total=0;for (i,address) in s.8.iter().enumerate(){let p=state(&mut t,address.parse().unwrap());assert_eq!(p.11,i as u32*16);assert_eq!(p.10,c.to_string());total+=p.9;}assert_eq!(total,s.9);
 }
}
