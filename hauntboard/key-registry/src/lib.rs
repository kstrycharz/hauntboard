use tari_template_lib::prelude::*;

#[template]
mod hauntboard_key_registry {
    use super::*;
    // A bounded companion to existing permissionless board contracts. Read access
    // is cryptographic; these rules authorize key-distribution changes only.
    pub struct KeyRegistry {
        schema: u32,
        scope: String,
        board: String,
        thread: String,
        admin: RistrettoPublicKeyBytes,
        generation: u32,
        revision: u32,
        generations: Vec<Vec<(Vec<u8>, Vec<u8>)>>,
    }
    impl KeyRegistry {
        fn valid(envelopes: &[(Vec<u8>, Vec<u8>)]) {
            assert!(!envelopes.is_empty() && envelopes.len() <= 16, "Member capacity");
            for (i, (id, envelope)) in envelopes.iter().enumerate() {
                assert!(id.len() == 32 && !envelope.is_empty() && envelope.len() <= 3072, "Invalid key envelope");
                assert!(!envelopes[..i].iter().any(|(prior, _)| prior == id), "Duplicate recipient");
            }
        }
        pub fn new(scope: String, board: String, thread: String, admin: RistrettoPublicKeyBytes, envelopes: Vec<(Vec<u8>, Vec<u8>)>) -> Component<Self> {
            assert!(!scope.is_empty() && scope.len() <= 512, "Scope capacity");
            assert!(board.parse::<ComponentAddress>().is_ok() && thread.parse::<ComponentAddress>().is_ok(), "Invalid room address");
            // The creator demonstrates possession, preventing a bogus admin key.
            CallerContext::get_signer_proof_for_public_key(admin).drop();
            Self::valid(&envelopes);
            Component::new(Self { schema: 1, scope, board, thread, admin, generation: 0, revision: 0, generations: vec![envelopes] })
                .with_access_rules(ComponentAccessRules::new()
                    .method("grant", rule!(public_key(admin)))
                    .method("rotate", rule!(public_key(admin)))
                    .method("get_state", rule!(allow_all))
                    .default(rule!(deny_all)))
                .with_owner_rule(OwnerRule::None).create()
        }
        pub fn grant(&mut self, expected_revision: u32, recipient: Vec<u8>, envelope: Vec<u8>) {
            assert!(self.revision == expected_revision, "Registry revision changed");
            assert!(self.revision < 256, "Revision capacity");
            let current = &mut self.generations[self.generation as usize];
            let mut next = current.clone();
            // No replacement: an existing recipient's envelope is immutable.
            next.push((recipient, envelope));
            Self::valid(&next);
            *current = next;
            self.revision += 1;
        }
        pub fn rotate(&mut self, expected_revision: u32, envelopes: Vec<(Vec<u8>, Vec<u8>)>) {
            assert!(self.revision == expected_revision, "Registry revision changed");
            assert!(self.generation < 15 && self.revision < 256, "Generation capacity");
            Self::valid(&envelopes);
            self.generations.push(envelopes);
            self.generation += 1;
            self.revision += 1;
        }
        pub fn get_state(&self) -> (u32, String, String, String, RistrettoPublicKeyBytes, u32, u32, Vec<Vec<(Vec<u8>, Vec<u8>)>>) {
            (self.schema, self.scope.clone(), self.board.clone(), self.thread.clone(), self.admin, self.generation, self.revision, self.generations.clone())
        }
    }
}
