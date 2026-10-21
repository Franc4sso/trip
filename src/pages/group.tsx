import { WithTrip } from '@/components/states';
import TripLayout from '@/components/trip-layout';
import { Card, FormError } from '@/components/ui';
import { api, useTripEvents, type TripEvent } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { paths } from '@/lib/paths';
import { usePresence, type Focus } from '@/lib/presence';
import { avatarColor, formatDayMonth, initials, type Activity, type Member, type Role, type TripHeader } from '@/lib/trip';
import { useAction } from '@/lib/use-action';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Link2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

const ROLE_LABEL: Record<Role, string> = {
    owner: 'Organizzatore',
    editor: 'Può modificare',
    viewer: 'Solo lettura',
};

export default function GroupRoute() {
    return <WithTrip>{({ trip, activities }) => <Group trip={trip} activities={activities} />}</WithTrip>;
}

function Group({ trip, activities }: { trip: TripHeader; activities: Activity[] }) {
    const user = useUser();
    const { peers } = usePresence();
    const events = useTripEvents(trip.id);
    const nameOf = (id: string | null) => trip.members.find((m) => m.id === id)?.name.split(' ')[0] ?? 'Qualcuno';
    const focusText = (f: Focus) => {
        if (f?.kind === 'activity') return `sta modificando «${activities.find((a) => a.id === f.id)?.title ?? 'un\'attività'}»`;
        if (f?.kind === 'new-activity') return f.date ? `sta aggiungendo un'attività al ${formatDayMonth(f.date)}` : 'sta aggiungendo un\'idea';
        if (f?.kind === 'stay') return 'sta modificando gli alloggi';
        return 'online';
    };
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { run, error } = useAction();
    const [copied, setCopied] = useState(false);
    const [allEvents, setAllEvents] = useState(false);
    const isOwner = trip.role === 'owner';

    const token = useQuery({
        queryKey: ['invite', trip.id],
        queryFn: () => api.inviteToken(trip.id),
        enabled: isOwner,
    });
    const inviteUrl = token.data ? `${window.location.origin}${paths.join(token.data)}` : null;

    const share = async () => {
        if (!inviteUrl) return;
        if (navigator.share) {
            await navigator.share({ title: trip.name, text: `Pianifichiamo insieme «${trip.name}» su Tabi`, url: inviteUrl }).catch(() => {});
            return;
        }
        await navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const setRole = (m: Member, role: Role) => run(() => api.setRole(trip.id, m.id, role));
    const remove = async (m: Member) => {
        const self = m.id === user.id;
        if (!confirm(self ? `Uscire da «${trip.name}»?` : `Togliere ${m.name} dal viaggio?`)) return;
        if ((await run(() => api.removeMember(trip.id, m.id))) && self) navigate(paths.trips(), { replace: true });
    };
    const regenerate = async () => {
        if (!confirm('Il vecchio link smetterà di funzionare. Continuare?')) return;
        const fresh = await api.regenerateInvite(trip.id);
        queryClient.setQueryData(['invite', trip.id], fresh);
    };

    return (
        <TripLayout title={`Gruppo · ${trip.name}`} trip={trip} tab="group">
            <h1 className="text-[28px] font-extrabold tracking-tight">Gruppo</h1>

            <Card className="mt-3 px-3.5 py-1.5">
                <ul>
                    {trip.members.map((m, i) => {
                        const self = m.id === user.id;
                        return (
                            <li key={m.id} className="flex items-center gap-3 border-line py-2.5 not-first:border-t">
                                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white" style={{ background: avatarColor(i) }}>
                                    {initials(m.name)}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-bold">
                                        {m.name}
                                        {self && ' (tu)'}
                                    </span>
                                    {peers.has(m.id) ? (
                                        <span className="flex items-center gap-1.5 text-xs font-bold text-leaf">
                                            <span className="size-2 shrink-0 rounded-full bg-[#1FA463]" aria-hidden="true" />
                                            <span className="truncate">{focusText(peers.get(m.id)!.focus)}</span>
                                        </span>
                                    ) : (
                                        !(isOwner && !self) && <span className="block text-xs font-bold text-mute">{ROLE_LABEL[m.role]}</span>
                                    )}
                                </span>
                                {isOwner && !self && (
                                    <select
                                        aria-label={`Ruolo di ${m.name}`}
                                        value={m.role}
                                        onChange={(e) => setRole(m, e.target.value as Role)}
                                        className="h-9 rounded-[10px] border border-field bg-card px-2 text-xs font-bold"
                                    >
                                        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                                            <option key={r} value={r}>
                                                {ROLE_LABEL[r]}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {(isOwner || self) && (
                                    <button onClick={() => remove(m)} className="h-9 rounded-[10px] px-2 text-xs font-bold text-verm-ink hover:bg-verm-soft">
                                        {self ? 'Esci' : 'Togli'}
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
                <div className="pb-2">
                    <FormError message={error} />
                </div>
            </Card>

            {isOwner ? (
                <Card className="mt-3">
                    <p className="text-sm font-extrabold">Invita amici</p>
                    <p className="mt-0.5 text-[13px] text-mute">Chi apre il link entra nel viaggio e può modificarlo. Puoi cambiare il ruolo dopo.</p>
                    <button
                        onClick={share}
                        disabled={!inviteUrl}
                        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-soft text-sm font-extrabold text-indigo-deep hover:bg-indigo-soft/70 disabled:opacity-60"
                    >
                        {copied ? <Check className="size-5" aria-hidden="true" /> : <Link2 className="size-5" aria-hidden="true" />}
                        {copied ? 'Link copiato' : 'Condividi link di invito'}
                    </button>
                    <button onClick={regenerate} className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 text-xs font-bold text-mute hover:text-ink">
                        <RefreshCw className="size-3.5" aria-hidden="true" />
                        Genera un nuovo link
                    </button>
                </Card>
            ) : (
                <p className="mt-3 text-[13px] text-mute">Per invitare qualcuno chiedi il link a un organizzatore.</p>
            )}

            <section className="mt-6">
                <h2 className="mb-1 text-sm font-extrabold">Ultime modifiche</h2>
                {events.data && events.data.length > 0 ? (
                    <ol>
                        {(allEvents ? events.data : events.data.slice(0, 8)).map((e) => (
                            <li key={e.id} className="flex gap-2.5 py-2 text-[13px] leading-snug">
                                <span
                                    aria-hidden="true"
                                    className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white"
                                    style={{ background: avatarColor(Math.max(0, trip.members.findIndex((m) => m.id === e.actor))) }}
                                >
                                    {initials(nameOf(e.actor))}
                                </span>
                                <p>
                                    <b>{e.actor === user.id ? 'Tu' : trip.members.some((m) => m.id === e.actor) || e.entity !== 'member' ? nameOf(e.actor) : e.label}</b> {eventText(e, e.actor === user.id, trip.members.find((m) => m.id === e.actor)?.name)} <span className="text-mute">· {timeAgo(e.created_at)}</span>
                                </p>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className="text-[13px] text-mute">{events.isPending ? 'Carico…' : 'Ancora nessuna modifica.'}</p>
                )}
                {!allEvents && (events.data?.length ?? 0) > 8 && (
                    <button onClick={() => setAllEvents(true)} className="mt-1 h-10 text-[13px] font-bold text-indigo hover:underline">
                        Mostra tutte
                    </button>
                )}
            </section>
        </TripLayout>
    );
}

function eventText(e: TripEvent, you: boolean, actorName: string | undefined): string {
    const v = (third: string, second: string) => (you ? second : third);
    const what = `«${e.label}»`;
    switch (e.action) {
        case 'added':
            return `${v('ha aggiunto', 'hai aggiunto')} ${e.entity === 'stay' ? "l'alloggio " : ''}${what}`;
        case 'updated':
            return `${v('ha modificato', 'hai modificato')} ${what}`;
        case 'deleted':
            return `${v('ha tolto', 'hai tolto')} ${what}`;
        case 'booked':
            return e.entity === 'stay' ? `${v('ha confermato', 'hai confermato')} ${what}` : `${v('ha prenotato', 'hai prenotato')} ${what}`;
        case 'joined':
            return v('ora fa parte del viaggio', 'ora fai parte del viaggio');
        case 'left':
            // the member left on their own, or an organiser removed them
            return actorName === e.label || !actorName ? v('ha lasciato il viaggio', 'hai lasciato il viaggio') : `${v('ha tolto', 'hai tolto')} ${e.label} dal viaggio`;
        case 'role':
            return `${v('ha cambiato il ruolo di', 'hai cambiato il ruolo di')} ${e.label}`;
    }
}

const rtf = new Intl.RelativeTimeFormat('it', { numeric: 'auto' });

function timeAgo(iso: string): string {
    const seconds = (Date.parse(iso) - Date.now()) / 1000;
    if (seconds > -60) return 'ora';
    if (seconds > -3600) return rtf.format(Math.round(seconds / 60), 'minute');
    if (seconds > -86400) return rtf.format(Math.round(seconds / 3600), 'hour');
    return rtf.format(Math.round(seconds / 86400), 'day');
}
