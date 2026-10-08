use std::str::FromStr;
use tari_common_types::seeds::{cipher_seed::CipherSeed, mnemonic::Mnemonic, seed_words::SeedWords};
use tari_ootle_wallet_crypto::derive_ristretto_key;
use tari_utilities::ByteArray;
fn hex(bytes: &[u8]) -> String { bytes.iter().map(|b| format!("{b:02x}")).collect() }
fn main() {
    let vectors: serde_json::Value = serde_json::from_slice(&std::fs::read("/workspace/hauntboard/artifacts/native-created-vectors.json").unwrap()).unwrap();
    for vector in vectors.as_array().unwrap() {
        let words = SeedWords::from_str(vector["phrase"].as_str().unwrap()).unwrap();
        let seed = CipherSeed::from_mnemonic(&words, None).unwrap();
        if hex(derive_ristretto_key(seed.entropy(), b"account", 0).as_bytes()) != vector["owner"].as_str().unwrap() ||
           hex(derive_ristretto_key(seed.entropy(), b"view_only_key", 0).as_bytes()) != vector["view"].as_str().unwrap() {
            panic!("Native wallet compatibility check failed");
        }
        let expected = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs().saturating_sub(1640995200) / 86400;
        assert!(u64::from(seed.birthday()).abs_diff(expected) <= 1, "Wallet birthday differs from native convention");
    }
    println!("Official native Tari decoder verified browser-created wallet keys and birthdays.");
}
