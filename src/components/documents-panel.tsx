import { DocumentSheet, type DocumentDraft } from '@/components/document-sheet';
import { DocumentViewer } from '@/components/document-viewer';
import { SectionTitle } from '@/components/ui';
import { useUser } from '@/lib/auth';
import { formatSize, useDocuments, useSavedFiles, type TripDocument } from '@/lib/documents';
import { formatDayMonth, type Activity, type Stay, type TripHeader } from '@/lib/trip';
import { cn } from '@/lib/utils';
import { CloudOff, FileText, ImageIcon, Lock, Ticket, Users } from 'lucide-react';
import { useState } from 'react';

/** What a document is for, e.g. "7 nov · Fushimi Inari" or "Hotel Gracery". */
function linkLabel(doc: TripDocument, activities: Activity[], stays: Stay[]): string | null {
    const activity = doc.activity_id ? activities.find((a) => a.id === doc.activity_id) : undefined;
    if (activity) return activity.date ? `${formatDayMonth(activity.date)} · ${activity.title}` : activity.title;
    return stays.find((s) => s.id === doc.stay_id)?.name ?? null;
}

export function DocumentRow({ doc, detail, saved, onOpen }: { doc: TripDocument; detail: string | null; saved: boolean; onOpen: () => void }) {
    const Icon = doc.mime_type.startsWith('image/') ? ImageIcon : FileText;
    return (
        <li>
            <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card px-3.5 py-3 text-left hover:bg-hover">
                <span className={cn('flex size-[34px] shrink-0 items-center justify-center rounded-[10px]', doc.scope === 'personal' ? 'bg-grape-soft text-grape' : 'bg-indigo-soft text-indigo')} aria-hidden="true">
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
        element,
    };
}

export function DocumentsPanel({ trip, activities, stays }: { trip: TripHeader; activities: Activity[]; stays: Stay[] }) {
    const user = useUser();
    const { data: docs = [], isPending } = useDocuments(trip.id);
    const saved = useSavedFiles();
    const sheets = useDocumentSheets(trip, activities, stays);

    const mine = docs.filter((d) => d.scope === 'personal');
    const group = docs.filter((d) => d.scope === 'group');
    const ownerName = (d: TripDocument) => (d.owner === user.id ? null : trip.members.find((m) => m.id === d.owner)?.name ?? null);

    const section = (title: string, icon: typeof Lock, list: TripDocument[], empty: string, withOwner: boolean) => {
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
                                detail={[withOwner ? ownerName(d) : null, linkLabel(d, activities, stays)].filter(Boolean).join(' · ') || null}
                                saved={saved.has(d.file_path)}
                                onOpen={() => sheets.view(d)}
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
                    {section('Personali · li vedi solo tu', Lock, mine, 'Passaporto, assicurazione, il tuo posto sullo Shinkansen: caricali qui.', false)}
                    {section('Del gruppo · li vedono tutti', Users, group, 'Biglietti e prenotazioni valide per tutti, come un QR unico per il gruppo.', true)}
                    <p className="text-center text-[11px] text-faint">I file si salvano sul telefono e si aprono anche senza connessione.</p>
                </>
            )}
            {sheets.element}
        </div>
    );
}
