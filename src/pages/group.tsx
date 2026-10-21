import { WithTrip } from '@/components/states';
import TripLayout from '@/components/trip-layout';
import { Card, FormError } from '@/components/ui';
import { api } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { paths } from '@/lib/paths';
import { avatarColor, initials, type Member, type Role, type TripHeader } from '@/lib/trip';
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
    return <WithTrip>{({ trip }) => <Group trip={trip} />}</WithTrip>;
}

function Group({ trip }: { trip: TripHeader }) {
    const user = useUser();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { run, error } = useAction();
    const [copied, setCopied] = useState(false);
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
                                    {!(isOwner && !self) && <span className="block text-xs font-bold text-mute">{ROLE_LABEL[m.role]}</span>}
                                </span>
                                {isOwner && !self && (
                                    <select
                                        aria-label={`Ruolo di ${m.name}`}
                                        value={m.role}
                                        onChange={(e) => setRole(m, e.target.value as Role)}
                                        className="h-9 rounded-[10px] border border-[#DAD8D1] bg-white px-2 text-xs font-bold"
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
                        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-soft text-sm font-extrabold text-indigo-deep hover:bg-[#D8DDF8] disabled:opacity-60"
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

            <p className="mt-6 rounded-2xl border border-dashed border-[#B9B7AF] p-4 text-[13px] text-mute">
                Le modifiche degli altri compaiono in tempo reale. Presto: chi è online e sondaggi per decidere insieme.
            </p>
        </TripLayout>
    );
}
