// Browser ABI adapter only. Key derivation is the released Tari implementation.
use tari_ootle_wallet_crypto::derive_ristretto_key;
use tari_utilities::ByteArray;
use zeroize::Zeroize;
use std::str::FromStr;
use tari_common_types::seeds::{cipher_seed::CipherSeed, mnemonic::Mnemonic, seed_words::SeedWords, error::CipherError};
use tari_utilities::SafePassword;
#[unsafe(no_mangle)]
pub extern "C" fn generate_cipher_seed(birthday: u32) -> u32 {
    clear_buffers();
    let Ok(birthday) = u16::try_from(birthday) else { return 0; };
    let mut seed = CipherSeed::random();
    seed.change_birthday(birthday);
    let Ok(words) = seed.to_mnemonic(tari_common_types::seeds::mnemonic::MnemonicLanguage::English, None) else { return 0; };
    let phrase = words.join(" ");
    let bytes = phrase.reveal().as_bytes();
    if bytes.len() > 2048 { return 0; }
    unsafe { std::ptr::copy_nonoverlapping(bytes.as_ptr(), phrase_buffer(), bytes.len()); }
    bytes.len() as u32
}
static mut PHRASE: [u8; 2048] = [0; 2048];
static mut PASSWORD: [u8; 1024] = [0; 1024];
#[unsafe(no_mangle)]
pub extern "C" fn phrase_buffer() -> *mut u8 { std::ptr::addr_of_mut!(PHRASE).cast() }
#[unsafe(no_mangle)]
pub extern "C" fn password_buffer() -> *mut u8 { std::ptr::addr_of_mut!(PASSWORD).cast() }
// Return only status codes: never expose words or passphrases in diagnostics.
#[unsafe(no_mangle)]
pub extern "C" fn derive_cipher_seed(phrase_len: usize, password_len: usize, index: u32) -> u32 {
    unsafe { std::ptr::write_bytes(key_buffer(), 0, 64); }
    if phrase_len > 2048 || password_len > 1024 { return 1; }
    let phrase = unsafe { std::slice::from_raw_parts(phrase_buffer(), phrase_len) };
    let password = unsafe { std::slice::from_raw_parts(password_buffer(), password_len) };
    let Ok(phrase) = std::str::from_utf8(phrase) else { return 1; };
    let Ok(password) = std::str::from_utf8(password) else { return 1; };
    let Ok(words) = SeedWords::from_str(phrase) else { return 1; };
    // Check native framing before version/password errors, so automatic detection
    // can still recover existing BIP39 wallets. Native words use Tari's encoding.
    let Ok(bytes) = tari_common_types::seeds::mnemonic::to_bytes(&words) else { return 1; };
    let bytes = bytes.reveal();
    if bytes.len() != 33 || bytes[29..] != crc32fast::hash(&bytes[..29]).to_le_bytes() { return 1; }
    let passphrase = if password.is_empty() { None } else {
        match SafePassword::from_str(password) { Ok(p) => Some(p), Err(_) => return 2 }
    };
    match CipherSeed::from_mnemonic(&words, passphrase) {
        Ok(seed) => { write_keys(seed.entropy(), index as u64); 0 },
        Err(CipherError::DecryptionFailed | CipherError::PasswordHashError(_)) => 2,
        Err(CipherError::VersionMismatch) => 3,
        Err(_) => 1,
    }
}
fn write_keys(seed: &[u8], index: u64) {
    let owner = derive_ristretto_key(seed, b"account", index);
    let view = derive_ristretto_key(seed, b"view_only_key", index);
    unsafe {
        std::ptr::copy_nonoverlapping(owner.as_bytes().as_ptr(), key_buffer(), 32);
        std::ptr::copy_nonoverlapping(view.as_bytes().as_ptr(), key_buffer().add(32), 32);
    }
}
static mut INPUT: [u8; 32] = [0; 32];
static mut OUTPUT: [u8; 64] = [0; 64];
static mut ACCOUNT: [u8; 32] = [0; 32];
#[unsafe(no_mangle)]
pub extern "C" fn account_buffer() -> *mut u8 { std::ptr::addr_of_mut!(ACCOUNT).cast() }
#[unsafe(no_mangle)]
pub extern "C" fn derive_account_address() {
    use tari_template_lib_types::{TemplateAddress, crypto::RistrettoPublicKeyBytes};
    let public_key = RistrettoPublicKeyBytes::from_bytes(&unsafe { INPUT }).expect("fixed public key length");
    let address = tari_engine_types::component::derive_component_address_from_public_key(&TemplateAddress::from_array([0; 32]), &public_key);
    unsafe { std::ptr::copy_nonoverlapping(address.as_bytes().as_ptr(), account_buffer(), 32); }
}
#[unsafe(no_mangle)]
pub extern "C" fn seed_buffer() -> *mut u8 { std::ptr::addr_of_mut!(INPUT).cast() }
#[unsafe(no_mangle)]
pub extern "C" fn key_buffer() -> *mut u8 { std::ptr::addr_of_mut!(OUTPUT).cast() }
#[unsafe(no_mangle)]
pub extern "C" fn derive_keys() {
    let mut seed = unsafe { INPUT };
    write_keys(&seed, 0);
    seed.zeroize();
    unsafe {
        std::ptr::write_bytes(seed_buffer(), 0, 32);
    }
}
#[unsafe(no_mangle)]
pub extern "C" fn clear_buffers() {
    unsafe { std::ptr::write_bytes(seed_buffer(), 0, 32); std::ptr::write_bytes(key_buffer(), 0, 64); std::ptr::write_bytes(phrase_buffer(), 0, 2048); std::ptr::write_bytes(password_buffer(), 0, 1024); }
}

