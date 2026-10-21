import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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
        const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }));
        return () => data.subscription.unsubscribe();
    }, []);

    return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
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
