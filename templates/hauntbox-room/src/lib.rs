// Encrypted-envelope inclusion only. No prize funds, plaintext or payout metadata.
use tari_template_lib::prelude::*;
use std::collections::BTreeMap;

#[template]
mod hauntbox_room {
    use super::*;
    pub struct HauntboxRoom {
        room_id: Vec<u8>,
        network: String,
        key_thumbprint: Vec<u8>,
        policy_digest: Vec<u8>,
        capacity: u32,
        closing_epoch: Option<u64>,
        closed: bool,
        receipts: BTreeMap<Vec<u8>, (Vec<u8>, u64)>,
    }
    impl HauntboxRoom {
        pub fn new(room_id: Vec<u8>, network: String, key_thumbprint: Vec<u8>, policy_digest: Vec<u8>, capacity: u32, closing_epoch: Option<u64>) -> Component<Self> {
            assert_eq!(room_id.len(), 16, "Room ID must be 16 bytes");
            assert!(network == "localnet" || network == "esmeralda", "Unsupported network");
            assert_eq!(key_thumbprint.len(), 32, "Key thumbprint must be 32 bytes");
            assert_eq!(policy_digest.len(), 32, "Policy digest must be 32 bytes");
            assert!(capacity > 0 && capacity <= 128, "Capacity must be 1 through 128");
            if let Some(epoch) = closing_epoch { assert!(epoch > Consensus::current_epoch(), "Closing epoch must be in the future"); }
            let authority = CallerContext::transaction_signer_public_key();
            Component::new(Self { room_id, network, key_thumbprint, policy_digest, capacity, closing_epoch, closed: false, receipts: BTreeMap::new() })
                .with_access_rules(ComponentAccessRules::new()
                    .method("seal", rule!(public_key(authority)))
                    .method("close", rule!(public_key(authority)))
                    .method("get_receipt", rule!(allow_all))
                    .method("get_room", rule!(allow_all))
                    .default(rule!(deny_all)))
                .with_owner_rule(OwnerRule::None).create()
        }
        pub fn seal(&mut self, submission_id: Vec<u8>, envelope_digest: Vec<u8>) -> (Vec<u8>, u64) {
            assert_eq!(submission_id.len(), 32, "Submission ID must be 32 bytes");
            assert_eq!(envelope_digest.len(), 32, "Envelope digest must be 32 bytes");
            if let Some(existing) = self.receipts.get(&submission_id) {
                assert_eq!(existing.0, envelope_digest, "Submission digest is immutable");
                return existing.clone();
            }
            assert!(!self.closed, "Room is closed");
            let epoch = Consensus::current_epoch();
            if let Some(closing) = self.closing_epoch { assert!(epoch < closing, "Closing epoch reached"); }
            assert!(self.receipts.len() < self.capacity as usize, "Room capacity reached");
            let receipt = (envelope_digest, epoch);
            self.receipts.insert(submission_id, receipt.clone());
            receipt
        }
        pub fn get_receipt(&self, submission_id: Vec<u8>) -> Option<(Vec<u8>, u64)> {
            assert_eq!(submission_id.len(), 32, "Submission ID must be 32 bytes");
            self.receipts.get(&submission_id).cloned()
        }
        pub fn close(&mut self) { self.closed = true; }
        pub fn get_room(&self) -> (Vec<u8>, String, Vec<u8>, Vec<u8>, u32, Option<u64>, bool, u32) {
            (self.room_id.clone(), self.network.clone(), self.key_thumbprint.clone(), self.policy_digest.clone(), self.capacity, self.closing_epoch, self.closed, self.receipts.len() as u32)
        }
    }
}
