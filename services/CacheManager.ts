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
}

export const cacheManager = new CacheManager();
