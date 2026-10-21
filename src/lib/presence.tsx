import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useUser } from './auth';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { openChannel } from './channels';

/** What someone is doing right now, shared through Supabase Realtime presence. */
export type Focus = { kind: 'activity'; id: number } | { kind: 'new-activity'; date: string | null } | { kind: 'stay'; id: number | null } | null;

interface PeerState {
    user_id: string;
    name: string;
    focus: Focus;
}

interface PresenceValue {
    /** Other members with the trip open, keyed by user id. */
    peers: Map<string, PeerState>;
    setFocus: (focus: Focus) => void;
}

const PresenceContext = createContext<PresenceValue>({ peers: new Map(), setFocus: () => {} });

export function TripPresence({ tripId, children }: { tripId: number; children: ReactNode }) {
    const me = useUser();
    const [peers, setPeers] = useState<Map<string, PeerState>>(new Map());
    const channelRef = useRef<RealtimeChannel | null>(null);
    const focusRef = useRef<Focus>(null);

    useEffect(() => {
        const close = openChannel(
            `presence:trip:${tripId}`,
            (channel) =>
                channel.on('presence', { event: 'sync' }, () => {
                    const next = new Map<string, PeerState>();
                    for (const [key, metas] of Object.entries(channel.presenceState<PeerState>())) {
                        // several tabs of the same person: the latest one wins
                        if (key !== me.id && metas.length > 0) next.set(key, metas[metas.length - 1]);
                    }
                    setPeers(next);
                }),
            { config: { presence: { key: me.id } } },
            (channel) => {
                channelRef.current = channel;
                channel.track({ user_id: me.id, name: me.name, focus: focusRef.current });
            },
        );

        return () => {
            channelRef.current = null;
            setPeers(new Map());
            close();
        };
    }, [tripId, me.id, me.name]);

    const setFocus = useCallback(
        (focus: Focus) => {
            focusRef.current = focus;
            channelRef.current?.track({ user_id: me.id, name: me.name, focus });
        },
        [me.id, me.name],
    );

    const value = useMemo(() => ({ peers, setFocus }), [peers, setFocus]);
    return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence() {
    return useContext(PresenceContext);
}

/** First names of the other members whose focus matches. */
export function usePeersOn(match: (focus: Focus) => boolean): string[] {
    const { peers } = usePresence();
    return [...peers.values()].filter((p) => match(p.focus)).map((p) => p.name.split(' ')[0]);
}

/** Announces a focus while `active` is true (e.g. while a sheet is open). */
export function useFocus(active: boolean, focus: Focus) {
    const { setFocus } = usePresence();
    const key = JSON.stringify(focus);
    useEffect(() => {
        if (!active) return;
        setFocus(focus);
        return () => setFocus(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, key, setFocus]);
}

export function namesSentence(names: string[]): string {
    if (names.length <= 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}
