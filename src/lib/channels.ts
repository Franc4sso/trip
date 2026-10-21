import type { RealtimeChannel, RealtimeChannelOptions } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Opens a Realtime channel for the lifetime of an effect.
 *
 * supabase.channel(topic) hands back an existing channel with the same topic, and
 * removing one is asynchronous: re-mounting quickly (navigation, StrictMode) would
 * get the old, already-subscribed channel and fail on `.on(...)`. So we wait for
 * any previous channel on the topic to be gone before creating ours.
 *
 * Returns the effect cleanup.
 */
export function openChannel(
    topic: string,
    setup: (channel: RealtimeChannel) => RealtimeChannel,
    opts?: RealtimeChannelOptions,
    onReady?: (channel: RealtimeChannel) => void,
): () => void {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    (async () => {
        const stale = supabase.getChannels().filter((c) => c.topic === `realtime:${topic}`);
        await Promise.all(stale.map((c) => supabase.removeChannel(c)));
        if (cancelled) return;
        channel = setup(supabase.channel(topic, opts));
        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED' && !cancelled && channel) onReady?.(channel);
        });
    })();

    return () => {
        cancelled = true;
        if (channel) supabase.removeChannel(channel);
    };
}
