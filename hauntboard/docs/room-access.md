# Using recipient-specific sealed rooms

1. Open a sealed thread and choose **Room access**. You can also open the recipient-key vault from **Sealed-thread key backup**.
2. Create a room vault. Save the displayed recovery secret privately, and download the encrypted vault. You need both to restore access. This recovery secret is separate from your wallet phrase and PIN.
3. To administer a classic sealed thread you already have access to, unlock your posting wallet, then choose **Enable managed access for future messages**. Review the network fee and publish the registry. This establishes a companion registry through the private invitation channel; it does not establish who originally created the thread.
4. A prospective recipient opens that thread, creates/unlocks their own room vault, and chooses **Create my recipient request**. They send the request and fingerprint privately to the administrator. A wallet is not required for this reading setup.
5. The administrator verifies the fingerprint, pastes the request into **Recipient request JSON**, and reviews the invitation transaction. After confirmation, **Copy my managed invitation** produces a link containing the authenticated registry binding. The link contains no room key. Send it privately to the intended recipient.
6. The recipient opens that link using their own vault. If locked, unlock/restore it and choose **Open recipient invitation**. Their browser fetches and decrypts their authorized envelope. This invitation includes the available room history.
7. To remove someone, the administrator deselects that recipient under the members to keep and chooses **Review removal and key rotation**. After confirmation, cooperating clients encrypt new replies with the fresh generation key. Keep a new encrypted vault backup after each access change.

Removed recipients keep their old history. Existing board writes remain permissionless, including messages from older clients; the registry authorizes key distribution. Members can share keys or plaintext with others. Group keys do not authenticate individual authors. Do not interpret a public thread title, recipient pseudonym or administration key as an anonymous identity.

To recover on a clean browser, open the recipient-key vault, select the encrypted file and enter its separate recovery secret. Restore the vault before opening your managed invitation. Recovery words for the Tari wallet restore the wallet, not the room vault. If a submitted access transaction is pending, restore/unlock the vault and use the existing operation's reconciliation controls; never replace an uncertain spend.

The [interactive demonstration](https://hauntboard.taritracker.com/privacy-demo) runs local cryptography with synthetic data and links to separate real Esmeralda receipts. See [the registry specification](../key-registry/README.md) and [live evidence](../evidence/room-key-esmeralda.json).
