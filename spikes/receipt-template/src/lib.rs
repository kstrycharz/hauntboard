// Original M2 ABI/compilation probe. Not the M3 HauntboxRoom contract.
// One immutable synthetic digest, no funds, secret content, or reward linkage.
use tari_template_lib::prelude::*;

#[template]
mod hauntbox_receipt_spike {
    use super::*;

    pub struct HauntboxReceiptSpike {
        digest: Vec<u8>,
        epoch: u64,
    }

    impl HauntboxReceiptSpike {
        pub fn new(digest: Vec<u8>) -> Component<Self> {
            assert_eq!(digest.len(), 32, "Digest must contain exactly 32 bytes");
            Component::new(Self {
                digest,
                epoch: Consensus::current_epoch(),
            })
            .with_access_rules(
                ComponentAccessRules::new()
                    .method("get_receipt", rule!(allow_all))
                    .default(rule!(deny_all)),
            )
            .with_owner_rule(OwnerRule::None)
            .create()
        }

        pub fn get_receipt(&self) -> (Vec<u8>, u64) {
            (self.digest.clone(), self.epoch)
        }
    }
}
