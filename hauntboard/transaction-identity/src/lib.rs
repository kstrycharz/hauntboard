// Decode and calculate transaction identity using released Tari code.
use tari_ootle_transaction::Transaction;
mod utxo_protobuf;
use prost::Message;
use utxo_protobuf::UtxoUpdatePayload;
static mut CODEC_INPUT: [u8; 2097152] = [0; 2097152];
static mut CODEC_OUTPUT: [u8; 4194304] = [0; 4194304];
#[unsafe(no_mangle)]
pub extern "C" fn codec_input() -> *mut u8 { std::ptr::addr_of_mut!(CODEC_INPUT).cast() }
#[unsafe(no_mangle)]
pub extern "C" fn codec_output() -> *mut u8 { std::ptr::addr_of_mut!(CODEC_OUTPUT).cast() }
#[unsafe(no_mangle)]
pub extern "C" fn decode_utxo_stream(len: usize) -> usize {
    if len > 2097152 { return 0; }
    let mut bytes = unsafe { std::slice::from_raw_parts(codec_input(), len) };
    let mut frames = Vec::new();
    while !bytes.is_empty() {
        let Ok(frame) = UtxoUpdatePayload::decode_length_delimited(&mut bytes) else { return 0; };
        frames.push(frame);
        if frames.len() > 4096 { return 0; }
    }
    let Ok(json) = serde_json::to_vec(&frames) else { return 0; };
    if json.len() > 4194304 { return 0; }
    unsafe { std::ptr::copy_nonoverlapping(json.as_ptr(), codec_output(), json.len()); }
    json.len()
}
#[unsafe(no_mangle)]
pub extern "C" fn encode_substate(len: usize) -> usize {
    if len == 0 || len > 2097152 { return 0; }
    let bytes = unsafe { std::slice::from_raw_parts(codec_input(), len) };
    let Ok(value) = serde_json::from_slice::<tari_engine_types::substate::SubstateValue>(bytes) else { return 0; };
    let Ok(encoded) = tari_bor::encode(&value) else { return 0; };
    if encoded.len() > 4194304 { return 0; }
    unsafe { std::ptr::copy_nonoverlapping(encoded.as_ptr(), codec_output(), encoded.len()); }
    encoded.len()
}
static mut INPUT: [u8; 262144] = [0; 262144];
static mut OUTPUT: [u8; 32] = [0; 32];
static mut MAX_EPOCH: u64 = 0;
#[unsafe(no_mangle)]
pub extern "C" fn transaction_buffer() -> *mut u8 { std::ptr::addr_of_mut!(INPUT).cast() }
#[unsafe(no_mangle)]
pub extern "C" fn identity_buffer() -> *mut u8 { std::ptr::addr_of_mut!(OUTPUT).cast() }
#[unsafe(no_mangle)]
pub extern "C" fn transaction_max_epoch() -> u64 { unsafe { MAX_EPOCH } }
#[unsafe(no_mangle)]
pub extern "C" fn transaction_identity(len: usize) -> u32 {
    if len == 0 || len > 262144 { return 1; }
    let bytes = unsafe { std::slice::from_raw_parts(transaction_buffer(), len) };
    let Ok(transaction) = tari_bor::decode_exact::<Transaction>(bytes) else { return 2; };
    let id = transaction.calculate_id();
    unsafe { std::ptr::copy_nonoverlapping(id.as_bytes().as_ptr(), identity_buffer(), 32); MAX_EPOCH = transaction.max_epoch().as_u64(); }
    0
}
#[cfg(target_arch = "wasm32")]
fn no_random(_: &mut [u8]) -> Result<(), getrandom_02::Error> { Err(getrandom_02::Error::UNSUPPORTED) }
#[cfg(target_arch = "wasm32")]
getrandom_02::register_custom_getrandom!(no_random);
