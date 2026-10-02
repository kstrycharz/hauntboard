export async function vaultGet<T>(id: string): Promise<T | undefined> {
  return vault<T>('readonly', (store) => store.get(id));
}
export async function vaultPut(id: string, value: unknown): Promise<void> {
  await vault('readwrite', (store) => store.put(value, id));
}
async function vault<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('hauntbox-browser-vault', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('private');
    open.onerror = () => reject(new Error('BROWSER_STORAGE_UNAVAILABLE'));
    open.onsuccess = () => {
      const db = open.result;
      let transaction: IDBTransaction, request: IDBRequest;
      try {
        transaction = db.transaction('private', mode);
        request = operation(transaction.objectStore('private'));
      } catch {
        db.close();
        reject(new Error('BROWSER_STORAGE_UNAVAILABLE'));
        return;
      }
      let value: T;
      request.onsuccess = () => {
        value = request.result as T;
      };
      transaction.oncomplete = () => {
        db.close();
        resolve(value);
      };
      transaction.onerror = transaction.onabort = () => {
        db.close();
        reject(new Error('BROWSER_STORAGE_UNAVAILABLE'));
      };
    };
  });
}
