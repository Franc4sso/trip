import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { DOCUMENTS_CACHE, isOnline } from './offline';
import { supabase } from './supabase';

/**
 * Tickets and documents of a trip: the rows come from `documents` (RLS hides other people's
 * personal ones), the files from the private "documents" bucket. Every file the user can see
 * is also kept on the device, so a QR code opens at the gate without a connection.
 */
export type DocumentScope = 'personal' | 'group';

export interface TripDocument {
    id: number;
    trip_id: number;
    owner: string;
    scope: DocumentScope;
    title: string;
    activity_id: number | null;
    stay_id: number | null;
    file_path: string;
    mime_type: string;
    size_bytes: number;
    created_at: string;
}

export type DocumentInput = Pick<TripDocument, 'title' | 'scope' | 'activity_id' | 'stay_id'>;

const COLUMNS = 'id, trip_id, owner, scope, title, activity_id, stay_id, file_path, mime_type, size_bytes, created_at';
const BUCKET = 'documents';
export const MAX_BYTES = 10 * 1024 * 1024;
export const ACCEPTED: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export const documentsKey = (tripId: number) => ['documents', tripId] as const;

export function useDocuments(tripId: number) {
    const query = useQuery({
        queryKey: documentsKey(tripId),
        queryFn: async () => {
            const { data, error } = await supabase.from('documents').select(COLUMNS).eq('trip_id', tripId).order('created_at', { ascending: false });
            if (error) throw error;
            return data as TripDocument[];
        },
    });
    const docs = query.data;
    // keep every visible file on the device while there is a connection
    useEffect(() => {
        if (docs?.length) keepOffline(docs);
    }, [docs]);
    return query;
}

/** Why a file can't be uploaded, or null when it can. */
export function fileProblem(file: File): string | null {
    if (!ACCEPTED[file.type]) return 'Carica un PDF o una foto (PNG, JPG, WebP).';
    if (file.size > MAX_BYTES) return 'Il file supera i 10 MB: comprimi il PDF o carica una foto.';
    return null;
}

/** "Biglietto Shinkansen.pdf" → "Biglietto Shinkansen" */
export function titleFromFile(name: string): string {
    return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 120);
}

export function formatSize(bytes: number): string {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export const documentsApi = {
    upload: async (tripId: number, userId: string, file: File, input: DocumentInput) => {
        const problem = fileProblem(file);
        if (problem) throw new Error(problem);
        const path = `${tripId}/${userId}/${crypto.randomUUID()}.${ACCEPTED[file.type]}`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
        if (uploadError) throw uploadError;
        const { error } = await supabase.from('documents').insert({ ...input, trip_id: tripId, file_path: path, mime_type: file.type, size_bytes: file.size });
        if (error) {
            await supabase.storage.from(BUCKET).remove([path]); // no orphan files
            throw error;
        }
        await remember(path, file);
    },
    update: async (id: number, input: DocumentInput) => {
        const { data, error } = await supabase.from('documents').update(input).eq('id', id).select('id');
        if (error) throw error;
        if (!data?.length) throw { code: '42501', message: 'Puoi modificare solo i documenti che hai caricato tu.' };
    },
    remove: async (doc: TripDocument) => {
        const { data, error } = await supabase.from('documents').delete().eq('id', doc.id).select('id');
        if (error) throw error;
        if (!data?.length) throw { code: '42501', message: 'Puoi eliminare solo i documenti che hai caricato tu.' };
        await supabase.storage.from(BUCKET).remove([doc.file_path]);
        await forget(doc.file_path);
    },
};

// ---------------------------------------------------------------- files on the device

const cacheUrl = (path: string) => `/__documents/${path}`;

async function openCache(): Promise<Cache | null> {
    try {
        return 'caches' in window ? await caches.open(DOCUMENTS_CACHE) : null;
    } catch {
        return null; // private mode: files still open online
    }
}

async function remember(path: string, blob: Blob) {
    const cache = await openCache();
    await cache?.put(cacheUrl(path), new Response(blob, { headers: { 'Content-Type': blob.type } })).catch(() => {});
    savedListeners.forEach((l) => l());
}

async function forget(path: string) {
    const cache = await openCache();
    await cache?.delete(cacheUrl(path));
    savedListeners.forEach((l) => l());
}

/** The file, from the device when saved there, else downloaded (and then saved). */
export async function documentFile(doc: TripDocument): Promise<Blob> {
    const cache = await openCache();
    const hit = await cache?.match(cacheUrl(doc.file_path));
    if (hit) return hit.blob();
    if (!isOnline()) throw new Error('Questo file non è ancora salvato sul telefono: aprilo una volta con la connessione.');
    const { data, error } = await supabase.storage.from(BUCKET).download(doc.file_path);
    if (error || !data) throw new Error('Non riesco a scaricare il file: riprova.');
    const blob = data.type ? data : new Blob([data], { type: doc.mime_type });
    await remember(doc.file_path, blob);
    return blob;
}

let syncing = false;
async function keepOffline(docs: TripDocument[]) {
    if (syncing || !isOnline()) return;
    const cache = await openCache();
    if (!cache) return;
    syncing = true;
    try {
        // one at a time: this runs in the background on hotel Wi-Fi
        for (const doc of docs) {
            if (!(await cache.match(cacheUrl(doc.file_path)))) await documentFile(doc).catch(() => {});
        }
    } finally {
        syncing = false;
    }
}

const savedListeners = new Set<() => void>();

/** Paths of the files saved on this device, to show which ones open offline. */
export function useSavedFiles(): Set<string> {
    const [saved, setSaved] = useState<Set<string>>(new Set());
    useEffect(() => {
        let alive = true;
        const refresh = async () => {
            const cache = await openCache();
            const keys = (await cache?.keys()) ?? [];
            const prefix = `${location.origin}${cacheUrl('')}`;
            if (alive) setSaved(new Set(keys.map((r) => r.url.slice(prefix.length))));
        };
        refresh();
        savedListeners.add(refresh);
        return () => {
            alive = false;
            savedListeners.delete(refresh);
        };
    }, []);
    return saved;
}
