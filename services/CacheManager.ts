export class CacheManager {
    private dbName = 'IFCViewerCache';
    private storeName = 'models';
    private db: IDBDatabase | null = null;

    async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (e) => {
                const db = (e.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    }

    async get(key: string): Promise<any> {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async set(key: string, data: any): Promise<void> {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const req = store.put(data, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async clear(): Promise<void> {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Estimate the cache footprint by walking every record.
     * IndexedDB has no built-in size API, so we sum the serialized byte
     * length of each stored value. Approximate but good enough for display.
     */
    async getSize(): Promise<{ count: number; bytes: number }> {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const req = store.openCursor();
            let count = 0;
            let bytes = 0;
            req.onsuccess = () => {
                const cursor = req.result;
                if (cursor) {
                    count++;
                    try {
                        bytes += new Blob([JSON.stringify(cursor.value)]).size;
                    } catch {
                        // Ignore un-serializable values; size stays approximate.
                    }
                    cursor.continue();
                } else {
                    resolve({ count, bytes });
                }
            };
            req.onerror = () => reject(req.error);
        });
    }
}

export const cacheManager = new CacheManager();
