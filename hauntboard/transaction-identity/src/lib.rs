// Decode and calculate transaction identity using released Tari code.
use tari_ootle_transaction::Transaction;
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
