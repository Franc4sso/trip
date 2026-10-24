import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { useSyncExternalStore } from 'react';

const WEEK = 1000 * 60 * 60 * 24 * 7;

export const queryClient = new QueryClient({
    defaultOptions: {
        // keep data around long enough to be useful offline (gcTime must cover maxAge)
        queries: { staleTime: 30_000, retry: 1, gcTime: WEEK },
    },
});

/** Trip data saved on the device, so the itinerary opens without a connection. */
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
    persister: createSyncStoragePersister({ storage: safeLocalStorage(), key: 'tabi-cache' }),
    maxAge: WEEK,
    // bump to drop caches saved by an older app version with a different data shape
    buster: 'v2', // v2: activities have options and info, documents shared_with
    dehydrateOptions: {
        shouldDehydrateQuery: (q) => q.state.status === 'success' && ['trips', 'trip', 'events', 'advice', 'documents'].includes(String(q.queryKey[0])),
    },
};

/** Forget everything saved for the previous account. */
export function clearOfflineData() {
    queryClient.clear();
    try {
        localStorage.removeItem('tabi-cache');
    } catch {
        // storage unavailable: nothing was saved
    }
    // tickets and passports saved for offline use must not outlive the account
    if ('caches' in window) caches.delete(DOCUMENTS_CACHE).catch(() => {});
}

/** Cache Storage bucket for document files kept on the device. */
export const DOCUMENTS_CACHE = 'tabi-documents';

function safeLocalStorage(): Storage | undefined {
    try {
        localStorage.setItem('tabi-probe', '1');
        localStorage.removeItem('tabi-probe');
        return localStorage;
    } catch {
        return undefined; // private mode: the app still works, just not offline
    }
}

/*
 * navigator.onLine misses "connected but no internet" (hotel Wi-Fi, metro): we also
 * count a request to Supabase that fails at the network level as being offline,
 * until the next request gets through.
 */
let networkDown = false;
// the 'offline' event can fire while navigator.onLine still says true (seen in Chromium)
let browserOffline = !navigator.onLine;
const listeners = new Set<() => void>();

let probe: ReturnType<typeof setInterval> | null = null;

function notify() {
    onlineManager.setOnline(isOnline());
    listeners.forEach((l) => l());
    // paused queries send nothing, so something else has to notice the network is back
    if (networkDown && !probe) {
        probe = setInterval(() => {
            trackedFetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`, { method: 'GET', cache: 'no-store' }).catch(() => {});
        }, 15_000);
    } else if (!networkDown && probe) {
        clearInterval(probe);
        probe = null;
    }
}

export function isOnline(): boolean {
    return !browserOffline && !networkDown;
}

/** fetch for the Supabase client: tracks whether the network actually works. */
export const trackedFetch: typeof fetch = async (input, init) => {
    try {
        const res = await fetch(input, init);
        if (networkDown) {
            networkDown = false;
            notify();
        }
        return res;
    } catch (e) {
        if (e instanceof TypeError && !networkDown) {
            networkDown = true;
            notify();
        }
        throw e;
    }
};

window.addEventListener('online', () => {
    browserOffline = false;
    networkDown = false; // give it a chance; the next request will tell
    notify();
});
window.addEventListener('offline', () => {
    browserOffline = true;
    notify();
});

function subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => {
        listeners.delete(onChange);
    };
}

export function useOnline(): boolean {
    return useSyncExternalStore(subscribe, isOnline);
}
