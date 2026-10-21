import { Card } from '@/components/tabi/ui';
import TripLayout from '@/layouts/trip-layout';
import { avatarColor, initials, type Member, type Role, type TripHeader } from '@/lib/trip';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { Check, Link2, RefreshCw } from 'lucide-react';
import { useState } from 'react';

const ROLE_LABEL: Record<Role, string> = {
    owner: 'Organizzatore',
    editor: 'Può modificare',
    viewer: 'Solo lettura',
};

export default function Group({ trip, invite_url }: { trip: TripHeader; invite_url: string | null }) {
    const { auth, errors } = usePage<SharedData & { errors: Record<string, string> }>().props;
    const [copied, setCopied] = useState(false);
    const isOwner = trip.role === 'owner';

    const share = async () => {
        if (!invite_url) return;
        const text = `Pianifichiamo insieme «${trip.name}» su Tabi`;
        if (navigator.share) {
            await navigator.share({ title: trip.name, text, url: invite_url }).catch(() => {});
            return;
        }
        await navigator.clipboard.writeText(invite_url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const setRole = (m: Member, role: Role) => router.patch(route('trips.members.update', [trip.id, m.id]), { role }, { preserveScroll: true });
    const remove = (m: Member) => {
        const self = m.id === auth.user.id;
        if (confirm(self ? `Uscire da «${trip.name}»?` : `Togliere ${m.name} dal viaggio?`)) {
            router.delete(route('trips.members.destroy', [trip.id, m.id]), { preserveScroll: true });
        }
    };
    const regenerate = () => {
        if (confirm('Il vecchio link smetterà di funzionare. Continuare?')) {
            router.post(route('trips.invite.regenerate', trip.id), {}, { preserveScroll: true });
        }
    };

    return (
        <TripLayout title={`Gruppo · ${trip.name}`} trip={trip} tab="group">
            <h1 className="text-[28px] font-extrabold tracking-tight">Gruppo</h1>

            <Card className="mt-3 px-3.5 py-1.5">
                <ul>
                    {trip.members.map((m, i) => (
                        <li key={m.id} className="flex items-center gap-3 border-line py-2.5 not-first:border-t">
                            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white" style={{ background: avatarColor(i) }}>
                                {initials(m.name)}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold">
                                    {m.name}
                                    {m.id === auth.user.id && ' (tu)'}
                                </span>
                                {!(isOwner && m.id !== auth.user.id) && <span className="block text-xs font-bold text-mute">{ROLE_LABEL[m.role]}</span>}
                            </span>
                            {isOwner && m.id !== auth.user.id && (
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
                            {(isOwner || m.id === auth.user.id) && (
                                <button onClick={() => remove(m)} className="h-9 rounded-[10px] px-2 text-xs font-bold text-verm-ink hover:bg-verm-soft">
                                    {m.id === auth.user.id ? 'Esci' : 'Togli'}
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
                {errors.member && <p className="pb-2 text-xs font-semibold text-verm-ink">{errors.member}</p>}
            </Card>

            {invite_url ? (
                <Card className="mt-3">
                    <p className="text-sm font-extrabold">Invita amici</p>
                    <p className="mt-0.5 text-[13px] text-mute">Chi apre il link entra nel viaggio e può modificarlo. Puoi cambiare il ruolo dopo.</p>
                    <button
                        onClick={share}
                        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-soft text-sm font-extrabold text-indigo-deep hover:bg-[#D8DDF8]"
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
                Presto qui: chi è online, modifiche in tempo reale e sondaggi per decidere insieme.
            </p>
        </TripLayout>
    );
}
