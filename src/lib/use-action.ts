import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { isOnline } from './offline';
import { errorMessage } from './supabase';

/**
 * Runs a write, tracks pending/error and refreshes the trip data afterwards.
 * Resolves to true on success so callers can close sheets or navigate.
 */
export function useAction() {
    const queryClient = useQueryClient();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const run = useCallback(
        async (write: () => Promise<unknown>): Promise<boolean> => {
            if (!isOnline()) {
                setError('Sei offline: le modifiche tornano disponibili appena c\'è connessione.');
                return false;
            }
            setPending(true);
            setError(null);
            try {
                await write();
                await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'trip' || q.queryKey[0] === 'trips' });
                return true;
            } catch (e) {
                setError(errorMessage(e));
                return false;
            } finally {
                setPending(false);
            }
        },
        [queryClient],
    );

    return { run, pending, error, clearError: () => setError(null) };
}
