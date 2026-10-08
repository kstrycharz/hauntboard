use tari_template_lib::prelude::*;

#[template]
mod proxy {
    use super::*;
    pub struct Proxy {}
    impl Proxy {
        pub fn new() -> Component<Self> {
            Component::new(Self {})
                .with_access_rules(ComponentAccessRules::allow_all())
                .with_owner_rule(OwnerRule::None)
                .create()
        }
        pub fn write_page(&self, page: ComponentAddress) -> u32 {
            ComponentManager::get(page).call("page_append", args![vec![9u8;16], 0i32, vec![1u8]])
        }
    }
}
