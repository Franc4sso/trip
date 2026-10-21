import { BottomSheet } from '@/components/bottom-sheet';
import { Card, Field, FormError, inputClass, PrimaryButton } from '@/components/ui';
import { api, usePolls, type Poll } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { avatarColor, initials, type Activity, type TripHeader } from '@/lib/trip';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import { Check, Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';

export function Polls({ trip, ideas }: { trip: TripHeader; ideas: Activity[] }) {
    const polls = usePolls(trip.id);
    const [creating, setCreating] = useState(false);

    return (
        <section className="mt-6">
            <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-extrabold">Sondaggi</h2>
                {trip.can_edit && (
                    <button onClick={() => setCreating(true)} className="flex h-9 items-center gap-1 rounded-[10px] px-2 text-[13px] font-bold text-indigo hover:bg-indigo-soft">
                        <Plus className="size-4" aria-hidden="true" />
                        Nuovo
                    </button>
                )}
            </div>
            {polls.data?.length ? (
                <div className="flex flex-col gap-2.5">
                    {polls.data.map((p) => (
                        <PollCard key={p.id} trip={trip} poll={p} />
                    ))}
                </div>
            ) : (
                <p className="text-[13px] text-mute">{polls.isPending ? 'Carico…' : 'Nessun sondaggio. Indecisi tra due gite? Fate decidere il gruppo.'}</p>
            )}
            <NewPollSheet trip={trip} ideas={ideas} open={creating} onOpenChange={setCreating} />
        </section>
    );
}

function PollCard({ trip, poll }: { trip: TripHeader; poll: Poll }) {
    const me = useUser();
    const { run, pending, error } = useAction();
    const mine = poll.poll_votes.find((v) => v.user_id === me.id)?.option_id ?? null;
    const total = poll.poll_votes.length;
    const max = Math.max(0, ...poll.poll_options.map((o) => poll.poll_votes.filter((v) => v.option_id === o.id).length));
    const canManage = poll.created_by === me.id || trip.role === 'owner';
    const memberIndex = (id: string) => Math.max(0, trip.members.findIndex((m) => m.id === id));
    const nameOf = (id: string) => trip.members.find((m) => m.id === id)?.name ?? '—';

    const vote = (optionId: number) => run(() => (mine === optionId ? api.unvote(poll.id, me.id) : api.vote(poll.id, optionId, me.id, mine !== null)));

    return (
        <Card className="p-3.5">
            <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-extrabold">{poll.question}</p>
                <span className="shrink-0 text-xs font-bold text-mute">
                    {poll.closed ? 'Chiuso' : `${total} di ${trip.members.length}`}
                </span>
            </div>
            <ul className="mt-2.5 flex flex-col gap-2">
                {poll.poll_options.map((o) => {
                    const voters = poll.poll_votes.filter((v) => v.option_id === o.id);
                    const share = total ? voters.length / total : 0;
                    const winning = poll.closed && voters.length === max && max > 0;
                    return (
                        <li key={o.id}>
                            <button
                                onClick={() => vote(o.id)}
                                disabled={poll.closed || pending}
                                aria-pressed={mine === o.id}
                                className={cn(
                                    'relative flex min-h-11 w-full items-center gap-2 overflow-hidden rounded-xl border px-3 text-left text-[13px] font-bold enabled:hover:border-indigo',
                                    mine === o.id ? 'border-indigo' : 'border-line',
                                    winning && 'border-leaf',
                                )}
                            >
                                <span aria-hidden="true" className={cn('absolute inset-y-0 left-0', winning ? 'bg-leaf-soft' : 'bg-indigo-soft')} style={{ width: `${share * 100}%` }} />
                                <span className="relative flex-1">
                                    {o.label}
                                    {mine === o.id && <Check className="ml-1 inline size-3.5 text-indigo" aria-label="il tuo voto" />}
                                </span>
                                <span className="relative flex" aria-label={voters.map((v) => nameOf(v.user_id)).join(', ')}>
                                    {voters.slice(0, 4).map((v) => (
                                        <span
                                            key={v.user_id}
                                            aria-hidden="true"
                                            className="-ml-1.5 flex size-5 items-center justify-center rounded-full text-[9px] font-extrabold text-white ring-2 ring-card"
                                            style={{ background: avatarColor(memberIndex(v.user_id)) }}
                                        >
                                            {initials(nameOf(v.user_id))}
                                        </span>
                                    ))}
                                </span>
                                <span className="relative w-6 text-right text-xs">{voters.length}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
            <FormError message={error} />
            {canManage && (
                <div className="mt-2 flex justify-end gap-1">
                    {!poll.closed && (
                        <button onClick={() => run(() => api.closePoll(poll.id))} className="h-9 rounded-[10px] px-2.5 text-xs font-bold text-mute hover:bg-hover">
                            Chiudi
                        </button>
                    )}
                    <button
                        onClick={() => confirm('Eliminare il sondaggio?') && run(() => api.deletePoll(poll.id))}
                        className="h-9 rounded-[10px] px-2.5 text-xs font-bold text-verm-ink hover:bg-verm-soft"
                    >
                        Elimina
                    </button>
                </div>
            )}
        </Card>
    );
}

function NewPollSheet({ trip, ideas, open, onOpenChange }: { trip: TripHeader; ideas: Activity[]; open: boolean; onOpenChange: (o: boolean) => void }) {
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState<{ label: string; activity_id: number | null }[]>([
        { label: '', activity_id: null },
        { label: '', activity_id: null },
    ]);
    const { run, pending, error } = useAction();
    const [formError, setFormError] = useState<string | null>(null);

    const setOption = (i: number, label: string) => setOptions((os) => os.map((o, j) => (j === i ? { label, activity_id: null } : o)));
    const addIdea = (idea: Activity) =>
        setOptions((os) => {
            const empty = os.findIndex((o) => !o.label.trim());
            const next = { label: idea.title.slice(0, 120), activity_id: idea.id };
            return empty >= 0 ? os.map((o, j) => (j === empty ? next : o)) : os.length < 6 ? [...os, next] : os;
        });

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const filled = options.map((o) => ({ ...o, label: o.label.trim() })).filter((o) => o.label);
        if (filled.length < 2) return setFormError('Servono almeno due opzioni.');
        setFormError(null);
        if (await run(() => api.createPoll(trip.id, question.trim(), filled))) {
            setQuestion('');
            setOptions([
                { label: '', activity_id: null },
                { label: '', activity_id: null },
            ]);
            onOpenChange(false);
        }
    };

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title="Nuovo sondaggio"
            footer={
                <PrimaryButton form="poll-form" type="submit" disabled={pending} className="w-full">
                    Chiedi al gruppo
                </PrimaryButton>
            }
        >
            <form id="poll-form" onSubmit={submit} className="flex flex-col gap-4">
                <FormError message={formError ?? error} />
                <Field label="Domanda" htmlFor="poll-q">
                    <input id="poll-q" className={inputClass} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Nara o Himeji il 13?" required maxLength={200} />
                </Field>
                <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1.5 text-xs font-bold text-mute">Opzioni</legend>
                    {options.map((o, i) => (
                        <div key={i} className="flex gap-2">
                            <input
                                aria-label={`Opzione ${i + 1}`}
                                className={inputClass}
                                value={o.label}
                                onChange={(e) => setOption(i, e.target.value)}
                                placeholder={`Opzione ${i + 1}`}
                                maxLength={120}
                            />
                            {options.length > 2 && (
                                <button
                                    type="button"
                                    aria-label={`Togli opzione ${i + 1}`}
                                    onClick={() => setOptions((os) => os.filter((_, j) => j !== i))}
                                    className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-field hover:bg-hover"
                                >
                                    <X className="size-4" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    ))}
                    {options.length < 6 && (
                        <button type="button" onClick={() => setOptions((os) => [...os, { label: '', activity_id: null }])} className="h-10 self-start text-[13px] font-bold text-indigo hover:underline">
                            + Aggiungi opzione
                        </button>
                    )}
                </fieldset>
                {ideas.length > 0 && (
                    <div>
                        <p className="mb-1.5 text-xs font-bold text-mute">Dalla lista idee</p>
                        <div className="flex flex-wrap gap-1.5">
                            {ideas.slice(0, 12).map((idea) => (
                                <button
                                    key={idea.id}
                                    type="button"
                                    onClick={() => addIdea(idea)}
                                    disabled={options.some((o) => o.activity_id === idea.id)}
                                    className="h-9 rounded-full border border-field bg-card px-3 text-xs font-bold enabled:hover:bg-hover disabled:opacity-40"
                                >
                                    + {idea.title}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </form>
        </BottomSheet>
    );
}
