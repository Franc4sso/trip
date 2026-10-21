import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { clearOfflineData } from './offline';
import { supabase } from './supabase';

interface AuthState {
    session: Session | null;
    loading: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({ session: null, loading: true });

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') clearOfflineData();
            // a different account on this device must not see the previous one's saved trips
            if (session && rememberUser(session.user.id)) clearOfflineData();
            setState({ session, loading: false });
        });
        return () => data.subscription.unsubscribe();
    }, []);

    return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

/** Stores the signed-in user id; true when it differs from the one stored before. */
function rememberUser(id: string): boolean {
    try {
        const previous = localStorage.getItem('tabi-user');
        localStorage.setItem('tabi-user', id);
        return previous !== null && previous !== id;
    } catch {
        return false;
    }
}

export function useAuth(): AuthState {
    return useContext(AuthContext);
}

/** The signed-in user. Only call it below <RequireAuth>. */
export function useUser() {
    const { session } = useAuth();
    if (!session) throw new Error('useUser() needs a session');
    return { id: session.user.id, name: (session.user.user_metadata.name as string | undefined) ?? session.user.email?.split('@')[0] ?? '' };
}
