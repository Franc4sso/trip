import { DocumentSheet, type DocumentDraft } from '@/components/document-sheet';
import { DocumentViewer } from '@/components/document-viewer';
import { SectionTitle } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { formatSize, useDocuments, useSavedFiles, visibilityOf, type TripDocument } from '@/lib/documents';
import { formatDayMonth, type Activity, type Stay, type TripHeader } from '@/lib/trip';
import { cn } from '@/lib/utils';
import { CloudOff, FileText, ImageIcon, Lock, Pencil, Ticket, UserRoundCheck, Users } from 'lucide-react';
import { useState } from 'react';

/** What a document is for, e.g. "7 nov · Fushimi Inari" or "Hotel Gracery". */
function linkLabel(doc: TripDocument, activities: Activity[], stays: Stay[]): string | null {
    const activity = doc.activity_id ? activities.find((a) => a.id === doc.activity_id) : undefined;
    if (activity) return activity.date ? `${formatDayMonth(activity.date)} · ${activity.title}` : activity.title;
    return stays.find((s) => s.id === doc.stay_id)?.name ?? null;
}

const TINT = { personal: 'bg-grape-soft text-grape', some: 'bg-clay-soft text-clay-ink', group: 'bg-indigo-soft text-indigo' } as const;

export function DocumentRow({ doc, detail, saved, onOpen, onEdit }: { doc: TripDocument; detail: string | null; saved: boolean; onOpen: () => void; onEdit?: () => void }) {
    const Icon = doc.mime_type.startsWith('image/') ? ImageIcon : FileText;
    return (
        <li className="flex gap-2">
            <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-line bg-card px-3.5 py-3 text-left hover:bg-hover">
                <span className={cn('flex size-[34px] shrink-0 items-center justify-center rounded-[10px]', TINT[visibilityOf(doc)])} aria-hidden="true">
                    <Icon className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{doc.title}</span>
                    <span className="block truncate text-xs text-mute">{[detail, formatSize(doc.size_bytes)].filter(Boolean).join(' · ')}</span>
                </span>
                {!saved && (
                    <span title="Non ancora salvato sul telefono" className="text-faint">
                        <CloudOff className="size-4" aria-label="Non ancora disponibile offline" />
                    </span>
                )}
            </button>
            {onEdit && (
                <button onClick={onEdit} aria-label={`Modifica ${doc.title}`} className="flex w-11 shrink-0 items-center justify-center rounded-2xl border border-line bg-card text-mute hover:bg-hover">
                    <Pencil className="size-4" aria-hidden="true" />
                </button>
            )}
        </li>
    );
}

/** Sheet + viewer for documents, shared by the pages that show them. */
export function useDocumentSheets(trip: TripHeader, activities: Activity[], stays: Stay[]) {
    const user = useUser();
    const [viewing, setViewing] = useState<TripDocument | null>(null);
    const [related, setRelated] = useState<TripDocument[]>([]);
    const [sheet, setSheet] = useState<{ open: boolean; doc?: TripDocument | null; draft?: DocumentDraft }>({ open: false });

    const element = (
        <>
            <DocumentViewer
                doc={viewing}
                members={trip.members}
                userId={user.id}
                related={related}
                onSwitch={setViewing}
                onOpenChange={(open) => !open && setViewing(null)}
                onEdit={(doc) => {
                    setViewing(null);
                    setSheet({ open: true, doc });
                }}
            />
            <DocumentSheet trip={trip} activities={activities} stays={stays} open={sheet.open} doc={sheet.doc} draft={sheet.draft} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))} />
        </>
    );

    return {
        view: (doc: TripDocument, others: TripDocument[] = []) => {
            setRelated(others);
            setViewing(doc);
        },
        add: (draft: DocumentDraft = {}) => setSheet({ open: true, doc: null, draft }),
        edit: (doc: TripDocument) => setSheet({ open: true, doc }),
        element,
    };
}

export function DocumentsPanel({ trip, activities, stays }: { trip: TripHeader; activities: Activity[]; stays: Stay[] }) {
    const user = useUser();
    const { data: docs = [], isPending } = useDocuments(trip.id);
    const saved = useSavedFiles();
    const sheets = useDocumentSheets(trip, activities, stays);

    const mine = docs.filter((d) => visibilityOf(d) === 'personal');
    const some = docs.filter((d) => visibilityOf(d) === 'some');
    const group = docs.filter((d) => visibilityOf(d) === 'group');
    const nameOf = (id: string) => trip.members.find((m) => m.id === id)?.name ?? null;
    const ownerName = (d: TripDocument) => (d.owner === user.id ? null : nameOf(d.owner));
    // "con Bruno, Carla" for yours, "da Anna" for the ones shared with you
    const sharedLabel = (d: TripDocument) => (d.owner === user.id ? `con ${d.shared_with.map(nameOf).filter(Boolean).join(', ')}` : `da ${ownerName(d) ?? 'qualcuno'}`);

    const section = (title: string, icon: typeof Lock, list: TripDocument[], empty: string | null, who: (d: TripDocument) => string | null) => {
        if (list.length === 0 && !empty) return null;
        const Icon = icon;
        return (
            <section>
                <SectionTitle>
                    <span className="flex items-center gap-1.5">
                        <Icon className="size-4 text-mute" aria-hidden="true" />
                        {title}
                    </span>
                </SectionTitle>
                {list.length === 0 ? (
                    <p className="rounded-[20px] border border-dashed border-dash p-4 text-center text-[13px] text-mute">{empty}</p>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {list.map((d) => (
                            <DocumentRow
                                key={d.id}
                                doc={d}
                                detail={[who(d), linkLabel(d, activities, stays)].filter(Boolean).join(' · ') || null}
                                saved={saved.has(d.file_path)}
                                onOpen={() => sheets.view(d)}
                                onEdit={d.owner === user.id ? () => sheets.edit(d) : undefined}
                            />
                        ))}
                    </ul>
                )}
            </section>
        );
    };

    return (
        <div className="mt-3.5 flex flex-col gap-4">
            <button
                onClick={() => sheets.add()}
                className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-indigo text-[15px] font-extrabold text-paper transition-colors hover:bg-indigo-deep"
            >
                <Ticket className="size-5" aria-hidden="true" />
                Aggiungi biglietto o documento
            </button>
            {!isPending && (
                <>
                    {section('Personali · li vedi solo tu', Lock, mine, 'Passaporto, assicurazione, il tuo posto sullo Shinkansen: caricali qui.', () => null)}
                    {section('Con alcune persone', UserRoundCheck, some, null, sharedLabel)}
                    {section('Del gruppo · li vedono tutti', Users, group, 'Biglietti e prenotazioni valide per tutti, come un QR unico per il gruppo.', ownerName)}
                    <p className="text-center text-[11px] text-faint">I file si salvano sul telefono e si aprono anche senza connessione.</p>
                </>
            )}
            {sheets.element}
        </div>
    );
}
