import { BottomSheet } from '@/components/bottom-sheet';
import { useConfirm } from '@/components/confirm-dialog';
import { Field, FormError, inputClass, PrimaryButton } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { ACCEPTED, documentsApi, fileProblem, formatSize, titleFromFile, visibilityOf, type DocumentScope, type TripDocument, type Visibility } from '@/lib/documents';
import { avatarColor, formatDayMonth, initials, type Activity, type Stay, type TripHeader } from '@/lib/trip';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import { Check, FileUp, Lock, UserRoundCheck, Users } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

export interface DocumentDraft {
    activity_id?: number | null;
    stay_id?: number | null;
    scope?: DocumentScope;
}

interface Props {
    trip: TripHeader;
    activities: Activity[];
    stays: Stay[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Editing an existing document (the file itself can't change). */
    doc?: TripDocument | null;
    draft?: DocumentDraft;
}

const VISIBILITIES: { value: Visibility; label: string; hint: string; icon: typeof Lock }[] = [
    { value: 'personal', label: 'Solo io', hint: 'Passaporto, il tuo posto sul treno', icon: Lock },
    { value: 'some', label: 'Alcune persone', hint: 'Lo vedi tu e chi scegli', icon: UserRoundCheck },
    { value: 'group', label: 'Tutto il gruppo', hint: 'Un QR o una prenotazione per tutti', icon: Users },
];

// "a:12" for an activity, "s:3" for a stay, "" for nothing
const linkValue = (activityId: number | null | undefined, stayId: number | null | undefined) => (activityId ? `a:${activityId}` : stayId ? `s:${stayId}` : '');

export function DocumentSheet({ trip, activities, stays, open, onOpenChange, doc, draft }: Props) {
    const user = useUser();
    const confirm = useConfirm();
    const { run, pending, error, clearError } = useAction();
    const [file, setFile] = useState<File | null>(null);
    const [fileError, setFileError] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [visibility, setVisibility] = useState<Visibility>('personal');
    const [people, setPeople] = useState<Set<string>>(new Set());
    const [link, setLink] = useState('');
    const [formError, setFormError] = useState<string | null>(null);
    const mates = trip.members.filter((m) => m.id !== user.id);
    const togglePerson = (id: string) => setPeople((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));

    useEffect(() => {
        if (!open) return;
        setFile(null);
        setFileError(null);
        setTitle(doc?.title ?? '');
        setVisibility(doc ? visibilityOf(doc) : draft?.scope === 'group' && trip.can_edit ? 'group' : 'personal');
        setPeople(new Set(doc?.shared_with ?? []));
        setFormError(null);
        setLink(doc ? linkValue(doc.activity_id, doc.stay_id) : linkValue(draft?.activity_id, draft?.stay_id));
        clearError();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, doc?.id]);

    const pick = (picked: File | undefined) => {
        if (!picked) return;
        const problem = fileProblem(picked);
        setFileError(problem);
        setFile(problem ? null : picked);
        if (!problem && !title.trim()) setTitle(titleFromFile(picked.name));
    };

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (visibility === 'some' && people.size === 0) {
            setFormError('Scegli con chi condividerlo.');
            return;
        }
        setFormError(null);
        const scope: DocumentScope = visibility === 'group' ? 'group' : 'personal';
        const input = {
            title: title.trim(),
            scope,
            // only mates still in the trip: someone may have left since
            shared_with: visibility === 'some' ? [...people].filter((id) => mates.some((m) => m.id === id)) : [],
            activity_id: link.startsWith('a:') ? Number(link.slice(2)) : null,
            stay_id: link.startsWith('s:') ? Number(link.slice(2)) : null,
        };
        if (!doc && !file) {
            setFileError('Scegli il file del biglietto o del documento.');
            return;
        }
        const ok = await run(() => (doc ? documentsApi.update(doc.id, input) : documentsApi.upload(trip.id, user.id, file!, input)));
        if (ok) onOpenChange(false);
    };

    const remove = async () => {
        if (!doc) return;
        const ok = await confirm({ title: `Eliminare «${doc.title}»?`, description: doc.scope === 'group' ? 'Sparisce per tutto il gruppo.' : 'Il file viene cancellato anche dal telefono.' });
        if (ok && (await run(() => documentsApi.remove(doc)))) onOpenChange(false);
    };

    const dated = activities.filter((a) => a.date).sort((a, b) => a.date!.localeCompare(b.date!) || (a.start_time ?? '99').localeCompare(b.start_time ?? '99'));

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={doc ? 'Modifica documento' : 'Nuovo biglietto o documento'}
            subtitle={trip.name}
            footer={
                <PrimaryButton form="document-form" type="submit" disabled={pending} className="w-full">
                    {pending ? 'Salvo…' : doc ? 'Salva' : 'Carica'}
                </PrimaryButton>
            }
        >
            <form id="document-form" onSubmit={submit} className="flex flex-col gap-4">
                <FormError message={formError ?? error} />

                {!doc && (
                    <div>
                        <label
                            htmlFor="doc-file"
                            className={cn(
                                'flex cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] border-dashed px-4 py-4 hover:bg-hover',
                                file ? 'border-leaf bg-leaf-soft' : 'border-dash bg-card',
                            )}
                        >
                            <FileUp className={cn('size-6 shrink-0', file ? 'text-leaf' : 'text-indigo')} aria-hidden="true" />
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-bold">{file ? file.name : 'Scegli il file'}</span>
                                <span className="block text-xs text-mute">{file ? formatSize(file.size) : 'PDF o foto, anche lo screenshot del QR · max 10 MB'}</span>
                            </span>
                        </label>
                        <input id="doc-file" type="file" accept={Object.keys(ACCEPTED).join(',')} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
                        {fileError && <p className="mt-1.5 text-xs font-semibold text-verm-ink">{fileError}</p>}
                    </div>
                )}

                <Field label="Nome" htmlFor="doc-title">
                    <input id="doc-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Shinkansen Tokyo → Kyoto, passaporto…" required maxLength={120} />
                </Field>

                <fieldset>
                    <legend className="mb-1.5 block text-xs font-bold text-mute">Chi lo vede</legend>
                    <div className="flex flex-col gap-2">
                        {VISIBILITIES.map(({ value, label, hint, icon: Icon }) => {
                            const disabled = (value === 'group' && !trip.can_edit) || (value === 'some' && mates.length === 0);
                            const active = visibility === value;
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    aria-pressed={active}
                                    disabled={disabled}
                                    onClick={() => setVisibility(value)}
                                    className={cn(
                                        'flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-colors disabled:opacity-50',
                                        active ? 'border-ink bg-ink text-paper' : 'border-field bg-card enabled:hover:bg-hover',
                                    )}
                                >
                                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                                    <span>
                                        <span className="block text-sm font-bold">{label}</span>
                                        <span className={cn('block text-xs', active ? 'text-on-hero-mute' : 'text-mute')}>{hint}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    {visibility === 'some' && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Con chi condividerlo">
                            {mates.map((m) => {
                                const on = people.has(m.id);
                                return (
                                    <button
                                        key={m.id}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => togglePerson(m.id)}
                                        className={cn('inline-flex h-10 items-center gap-2 rounded-full border pr-3 pl-1 text-[13px] font-bold', on ? 'border-indigo bg-indigo-soft text-indigo' : 'border-field bg-card hover:bg-hover')}
                                    >
                                        <span
                                            className="flex size-7 items-center justify-center rounded-full text-[10px] font-extrabold text-white"
                                            style={{ background: avatarColor(trip.members.findIndex((x) => x.id === m.id)) }}
                                            aria-hidden="true"
                                        >
                                            {on ? <Check className="size-3.5" /> : initials(m.name)}
                                        </span>
                                        {m.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {!trip.can_edit && <p className="mt-1.5 text-xs text-mute">Solo chi può modificare il viaggio condivide documenti con tutto il gruppo.</p>}
                </fieldset>

                <Field label="Per cosa serve" htmlFor="doc-link">
                    <select id="doc-link" className={inputClass} value={link} onChange={(e) => setLink(e.target.value)}>
                        <option value="">Tutto il viaggio (passaporto, assicurazione…)</option>
                        {dated.length > 0 && (
                            <optgroup label="Attività">
                                {dated.map((a) => (
                                    <option key={a.id} value={`a:${a.id}`}>
                                        {formatDayMonth(a.date!)} · {a.title}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                        {stays.length > 0 && (
                            <optgroup label="Alloggi">
                                {stays.map((s) => (
                                    <option key={s.id} value={`s:${s.id}`}>
                                        {s.name}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                </Field>

                {doc && (
                    <button type="button" onClick={remove} className="h-11 text-sm font-bold text-verm-ink hover:underline">
                        Elimina documento
                    </button>
                )}
            </form>
        </BottomSheet>
    );
}
