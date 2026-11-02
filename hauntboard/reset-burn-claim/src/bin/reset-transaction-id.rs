use std::io::Read;
use base64::Engine;
use tari_ootle_transaction::Transaction;
fn main() -> anyhow::Result<()> {
    let mut encoded = String::new();
    std::io::stdin().take(2_000_000).read_to_string(&mut encoded)?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(encoded.trim())?;
    let transaction: Transaction = tari_bor::decode_exact(&bytes)?;
    println!("{}", transaction.calculate_id());
    Ok(())
}
