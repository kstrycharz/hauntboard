use tari_template_lib_types::{TemplateAddress, crypto::RistrettoPublicKeyBytes};
fn main() -> anyhow::Result<()> {
    let encoded = std::env::args().nth(1).ok_or_else(|| anyhow::anyhow!("Expected public key"))?;
    let bytes = hex::decode(encoded)?;
    let public_key = RistrettoPublicKeyBytes::from_bytes(&bytes)?;
    let address = tari_engine_types::component::derive_component_address_from_public_key(&TemplateAddress::from_array([0; 32]), &public_key);
    println!("{address}");
    Ok(())
}
