use tari_template_lib::prelude::*;

#[template]
mod hauntboard {
    use super::*;
    pub struct Hauntboard {
        schema: u32,
        is_board: bool,
        board: String,
        title: String,
        mode: u8,
        uid: Vec<u8>,
        threads: Vec<ThreadRef>,
        posts: Vec<Post>,
    }
    #[derive(Clone)]
    pub struct Post {
        pub nonce: Vec<u8>,
        pub author: String,
        pub parent: i32,
        pub payload: Vec<u8>,
        pub epoch: u64,
    }
    #[derive(Clone)]
    pub struct ThreadRef {
        pub address: String,
        pub title: String,
        pub mode: u8,
        pub uid: Vec<u8>,
        pub author: String,
    }
    impl Hauntboard {
        fn component(self) -> Component<Self> {
            Component::new(self)
                .with_access_rules(ComponentAccessRules::new()
                    .method("create_thread", rule!(allow_all))
                    .method("append", rule!(allow_all))
                    .method("get_state", rule!(allow_all))
                    .method("get_first_payload", rule!(allow_all))
                    .method("get_post", rule!(allow_all))
                    .method("get_counts", rule!(allow_all))
                    .default(rule!(deny_all)))
                .with_owner_rule(OwnerRule::None).create()
        }
        pub fn new(title: String) -> Component<Self> {
            assert!(!title.trim().is_empty() && title.len() <= 80, "Board title must be 1-80 bytes");
            Self { schema: 2, is_board: true, board: String::new(), title, mode: 0, uid: vec![], threads: vec![], posts: vec![] }.component()
        }
        pub fn create_thread(&mut self, title: String, mode: u8, uid: Vec<u8>, payload: Vec<u8>) -> ComponentAddress {
            assert!(self.is_board, "Only boards create threads");
            assert!(mode <= 1, "Invalid thread mode");
            assert!(uid.len() == 16, "Thread ID must be 16 bytes");
            assert!(!title.trim().is_empty() && title.len() <= 80, "Thread title must be 1-80 bytes");
            assert!(mode == 0 || title == "Sealed thread", "Secret thread title must be sealed");
            assert!(!payload.is_empty() && payload.len() <= 4096, "Post must be 1-4096 bytes");
            let author = CallerContext::transaction_signer_public_key().to_string();
            if let Some(existing) = self.threads.iter().find(|t| t.uid == uid) {
                assert!(existing.author == author && existing.title == title && existing.mode == mode, "Thread identity conflict");
                let first: Vec<u8> = ComponentManager::get(existing.address.parse::<ComponentAddress>().expect("Stored thread address")).call("get_first_payload", args![]);
                assert_eq!(first, payload, "Thread payload is immutable");
                return existing.address.parse().expect("Stored thread address");
            }
            assert!(self.threads.len() < 128, "Board capacity reached");
            let board = CallerContext::current_component_address();
            let thread = Self { schema: 2, is_board: false, board: board.to_string(), title: title.clone(), mode, uid: uid.clone(), threads: vec![],
                posts: vec![Post { nonce: uid.clone(), author: author.clone(), parent: -1, payload, epoch: Consensus::current_epoch() }] }.component();
            let address = *thread.address();
            self.threads.push(ThreadRef { address: address.to_string(), title, mode, uid, author });
            address
        }
        pub fn append(&mut self, nonce: Vec<u8>, parent: i32, payload: Vec<u8>) -> u32 {
            assert!(!self.is_board, "Only threads accept posts");
            assert_eq!(nonce.len(), 16, "Post nonce must be 16 bytes");
            assert!(!payload.is_empty() && payload.len() <= 4096, "Post must be 1-4096 bytes");
            let author = CallerContext::transaction_signer_public_key().to_string();
            if let Some((index, existing)) = self.posts.iter().enumerate().find(|(_, p)| p.author == author && p.nonce == nonce) {
                assert!(existing.parent == parent && existing.payload == payload, "Post nonce conflict");
                return index as u32;
            }
            assert!(self.posts.len() < 32, "Thread capacity reached");
            assert!(parent >= -1 && (parent == -1 || (parent as usize) < self.posts.len()), "Invalid reply target");
            let index = self.posts.len() as u32;
            self.posts.push(Post { nonce, author, parent, payload, epoch: Consensus::current_epoch() });
            index
        }
        pub fn get_first_payload(&self) -> Vec<u8> { self.posts.first().expect("Thread has an opening post").payload.clone() }
        pub fn get_counts(&self) -> (u32, u32) { (self.threads.len() as u32, self.posts.len() as u32) }
        pub fn get_post(&self, index: u32) -> (Vec<u8>, String, i32, Vec<u8>, u64) {
            let p = &self.posts[index as usize];
            (p.nonce.clone(), p.author.clone(), p.parent, p.payload.clone(), p.epoch)
        }
        pub fn get_state(&self) -> (u32, bool, String, String, u8, Vec<u8>, Vec<ThreadRef>, Vec<Post>) {
            (self.schema, self.is_board, self.board.clone(), self.title.clone(), self.mode, self.uid.clone(), self.threads.clone(), self.posts.clone())
        }
    }
}

