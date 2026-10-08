use tari_template_lib::prelude::*;

#[template]
mod hauntboard_public {
    use super::*;
    const PAGE_SIZE: u32 = 16;
    const MAX_POSTS: u32 = 2048;
    pub struct Hauntboard {
        schema: u32,
        is_board: bool,
        board: String,
        title: String,
        mode: u8,
        uid: Vec<u8>,
        threads: Vec<ThreadRef>,
        posts: Vec<Post>,
        pages: Vec<String>,
        post_count: u32,
        page_owner: String,
        page_start: u32,
    }
    #[derive(Clone)]
    pub struct Post {
        pub nonce: Vec<u8>,
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
    }
    impl Hauntboard {
        fn component(self) -> Component<Self> {
            let page_rule = if self.page_owner.is_empty() { rule!(deny_all) }
                else { rule!(caller_component(self.page_owner.parse::<ComponentAddress>().expect("Page owner"))) };
            Component::new(self).with_access_rules(ComponentAccessRules::new()
                .method("create_thread", rule!(allow_all)).method("append", rule!(allow_all))
                .method("page_append", page_rule).method("find_retry", rule!(allow_all))
                .method("get_state", rule!(allow_all)).method("get_first_payload", rule!(allow_all))
                .method("get_post", rule!(allow_all)).method("get_counts", rule!(allow_all))
                .default(rule!(deny_all))).with_owner_rule(OwnerRule::None).create()
        }
        fn empty(title: String, is_board: bool, board: String, mode: u8, uid: Vec<u8>) -> Self {
            Self { schema: 4, is_board, board, title, mode, uid, threads: vec![], posts: vec![], pages: vec![], post_count: 0, page_owner: String::new(), page_start: 0 }
        }
        pub fn new(title: String) -> Component<Self> {
            assert!(!title.trim().is_empty() && title.len() <= 80, "Board title must be 1-80 bytes");
            Self::empty(title, true, String::new(), 0, vec![]).component()
        }
        pub fn create_thread(&mut self, title: String, mode: u8, uid: Vec<u8>, payload: Vec<u8>) -> ComponentAddress {
            assert!(self.is_board, "Only boards create threads");
            assert!(mode == 0 && uid.len() == 16, "Public threads only; invalid thread ID");
            assert!(!title.trim().is_empty() && title.len() <= 80, "Thread title must be 1-80 bytes");
            assert!(mode == 0 || title == "Sealed thread", "Secret thread title must be sealed");
            assert!(!payload.is_empty() && payload.len() <= 4096, "Post must be 1-4096 bytes");
            if let Some(existing) = self.threads.iter().find(|t| t.uid == uid) {
                assert!(existing.title == title && existing.mode == mode, "Thread identity conflict");
                let first: Vec<u8> = ComponentManager::get(existing.address.parse::<ComponentAddress>().expect("Thread address")).call("get_first_payload", args![]);
                assert_eq!(first, payload, "Thread payload is immutable");
                return existing.address.parse().expect("Thread address");
            }
            assert!(self.threads.len() < 128, "Board capacity reached");
            let thread = Self::empty(title.clone(), false, CallerContext::current_component_address().to_string(), mode, uid.clone()).component();
            let address = *thread.address();
            let _: u32 = ComponentManager::get(address).call("append", args![uid.clone(), -1i32, payload]);
            self.threads.push(ThreadRef { address: address.to_string(), title, mode, uid });
            address
        }
        pub fn append(&mut self, nonce: Vec<u8>, parent: i32, payload: Vec<u8>) -> u32 {
            assert!(!self.is_board && self.page_owner.is_empty(), "Only threads accept posts");
            assert_eq!(nonce.len(), 16, "Post nonce must be 16 bytes");
            assert!(!payload.is_empty() && payload.len() <= 4096, "Post must be 1-4096 bytes");
            // Reply IDs bind their first four bytes to a page (little endian), followed by
            // 96 random bits. Exact retries read one bounded page, even after rollover.
            let hint = if nonce == self.uid { 0 } else { u32::from_le_bytes(nonce[..4].try_into().unwrap()) };
            if (hint as usize) < self.pages.len() {
                let found: i32 = ComponentManager::get(self.pages[hint as usize].parse::<ComponentAddress>().expect("Page address"))
                    .call("find_retry", args![nonce.clone(), parent, payload.clone()]);
                if found >= 0 { return found as u32; }
            }
            assert!(self.post_count < MAX_POSTS, "Thread capacity reached");
            assert!(parent >= -1 && (parent == -1 || (parent as u32) < self.post_count), "Invalid reply target");
            assert!(hint == self.post_count / PAGE_SIZE, "Post page changed; refresh and review again");
            assert!(self.post_count != 0 || (nonce == self.uid && parent == -1), "Opening post identity");
            let index = self.post_count;
            if index % PAGE_SIZE == 0 {
                let mut page = Self::empty(String::new(), false, self.board.clone(), self.mode, self.uid.clone());
                page.page_owner = CallerContext::current_component_address().to_string();
                page.page_start = index;
                page.posts.push(Post { nonce, parent, payload, epoch: Consensus::current_epoch() });
                page.post_count = 1;
                self.pages.push(page.component().address().to_string());
            } else {
                let _: u32 = ComponentManager::get(self.pages[hint as usize].parse::<ComponentAddress>().expect("Page address"))
                    .call("page_append", args![nonce, parent, payload]);
            }
            self.post_count += 1;
            index
        }
        pub fn page_append(&mut self, nonce: Vec<u8>, parent: i32, payload: Vec<u8>) -> u32 {
            assert!(!self.page_owner.is_empty() && self.posts.len() < PAGE_SIZE as usize, "Page capacity reached");
            assert!(nonce.len() == 16 && !payload.is_empty() && payload.len() <= 4096, "Invalid post");
            let index = self.page_start + self.posts.len() as u32;
            self.posts.push(Post { nonce, parent, payload, epoch: Consensus::current_epoch() });
            self.post_count += 1;
            index
        }
        pub fn find_retry(&self, nonce: Vec<u8>, parent: i32, payload: Vec<u8>) -> i32 {
            assert!(!self.page_owner.is_empty(), "Only pages locate retries");
            if let Some((index, p)) = self.posts.iter().enumerate().find(|(_, p)| p.nonce == nonce) {
                assert!(p.parent == parent && p.payload == payload, "Post nonce conflict");
                return (self.page_start + index as u32) as i32;
            }
            -1
        }
        pub fn get_first_payload(&self) -> Vec<u8> { self.get_post(0).2 }
        pub fn get_counts(&self) -> (u32, u32) { (self.threads.len() as u32, self.post_count) }
        pub fn get_post(&self, index: u32) -> (Vec<u8>, i32, Vec<u8>, u64) {
            assert!(!self.is_board, "Boards have no posts");
            if self.page_owner.is_empty() {
                assert!(index < self.post_count, "Invalid post index");
                return ComponentManager::get(self.pages[(index / PAGE_SIZE) as usize].parse::<ComponentAddress>().expect("Page address"))
                    .call("get_post", args![index]);
            }
            assert!(index >= self.page_start, "Post index precedes page");
            let offset = index - self.page_start;
            assert!((offset as usize) < self.posts.len(), "Post index outside page");
            let p = &self.posts[offset as usize];
            (p.nonce.clone(), p.parent, p.payload.clone(), p.epoch)
        }
        pub fn get_state(&self) -> (u32, bool, String, String, u8, Vec<u8>, Vec<ThreadRef>, Vec<Post>, Vec<String>, u32, String, u32) {
            (self.schema, self.is_board, self.board.clone(), self.title.clone(), self.mode, self.uid.clone(), self.threads.clone(), self.posts.clone(), self.pages.clone(), self.post_count, self.page_owner.clone(), self.page_start)
        }
    }
}
