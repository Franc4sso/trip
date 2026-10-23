import { BottomSheet } from '@/components/bottom-sheet';
import { useConfirm } from '@/components/confirm-dialog';
import { Field, FormError, inputClass, PrimaryButton } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { ACCEPTED, documentsApi, fileProblem, formatSize, titleFromFile, type DocumentScope, type TripDocument } from '@/lib/documents';
import { formatDayMonth, type Activity, type Stay, type TripHeader } from '@/lib/trip';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import { FileUp, Lock, Users } from 'lucide-react';
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

const SCOPES: { value: DocumentScope; label: string; hint: string; icon: typeof Lock }[] = [
    { value: 'personal', label: 'Personale', hint: 'Lo vedi solo tu', icon: Lock },
    { value: 'group', label: 'Gruppo', hint: 'Lo vedono tutti', icon: Users },
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
    const [scope, setScope] = useState<DocumentScope>('personal');
    const [link, setLink] = useState('');

    useEffect(() => {
        if (!open) return;
        setFile(null);
        setFileError(null);
        setTitle(doc?.title ?? '');
        setScope(doc?.scope ?? (draft?.scope && (draft.scope === 'personal' || trip.can_edit) ? draft.scope : 'personal'));
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
        const input = {
            title: title.trim(),
            scope,
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
                <FormError message={error} />

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
                    <div className="grid grid-cols-2 gap-2">
                        {SCOPES.map(({ value, label, hint, icon: Icon }) => {
                            const disabled = value === 'group' && !trip.can_edit;
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    aria-pressed={scope === value}
                                    disabled={disabled}
                                    onClick={() => setScope(value)}
                                    className={cn(
                                        'flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition-colors disabled:opacity-50',
                                        scope === value ? 'border-ink bg-ink text-paper' : 'border-field bg-card enabled:hover:bg-hover',
                                    )}
                                >
                                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                                    <span>
                                        <span className="block text-sm font-bold">{label}</span>
                                        <span className={cn('block text-xs', scope === value ? 'text-on-hero-mute' : 'text-mute')}>{hint}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    {!trip.can_edit && <p className="mt-1.5 text-xs text-mute">Solo chi può modificare il viaggio condivide documenti col gruppo.</p>}
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
