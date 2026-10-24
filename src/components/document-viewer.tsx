import { BottomSheet } from '@/components/bottom-sheet';
import { useConfirm } from '@/components/confirm-dialog';
import { ImageZoom } from '@/components/image-zoom';
import { FormError } from '@/components/ui';
import { documentFile, documentsApi, formatSize, visibilityOf, type TripDocument } from '@/lib/documents';
import { type Member } from '@/lib/trip';
import { useAction } from '@/lib/use-action';
import { cn } from '@/lib/utils';
import { Download, ExternalLink, Loader2, Maximize2, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
    doc: TripDocument | null;
    members: Member[];
    userId: string;
    onOpenChange: (open: boolean) => void;
    onEdit: (doc: TripDocument) => void;
    /** Other documents for the same activity, to switch between them. */
    related?: TripDocument[];
    onSwitch?: (doc: TripDocument) => void;
}

/** Shows a ticket or document full size, from the device when saved there. */
export function DocumentViewer({ doc, members, userId, onOpenChange, onEdit, related = [], onSwitch }: Props) {
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [zoom, setZoom] = useState(false);
    const confirm = useConfirm();
    const { run, pending, error: actionError, clearError } = useAction();

    useEffect(() => {
        if (!doc) return;
        let objectUrl: string | null = null;
        let alive = true;
        setUrl(null);
        setError(null);
        setZoom(false);
        clearError();
        documentFile(doc)
            .then((blob) => {
                objectUrl = URL.createObjectURL(blob);
                if (alive) setUrl(objectUrl);
            })
            .catch((e: Error) => alive && setError(e.message));
        return () => {
            alive = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doc]);

    if (!doc) return null;

    const mine = doc.owner === userId;
    const who = mine ? 'tu' : (members.find((m) => m.id === doc.owner)?.name ?? 'qualcuno del gruppo');
    const isImage = doc.mime_type.startsWith('image/');
    const nameOf = (id: string) => (id === userId ? 'te' : (members.find((m) => m.id === id)?.name ?? null));
    const visibility = visibilityOf(doc);
    const seenBy =
        visibility === 'group'
            ? `Del gruppo · caricato da ${who}`
            : visibility === 'personal'
              ? 'Personale, lo vedi solo tu'
              : mine
                ? `Lo vedi tu e ${doc.shared_with.map(nameOf).filter(Boolean).join(', ')}`
                : `Condiviso da ${who} con ${doc.shared_with.map(nameOf).filter(Boolean).join(', ')}`;

    const remove = async () => {
        const ok = await confirm({
            title: `Eliminare «${doc.title}»?`,
            description: visibility === 'personal' ? 'Il file viene cancellato anche dal telefono.' : 'Sparisce anche per chi lo vedeva.',
        });
        if (ok && (await run(() => documentsApi.remove(doc)))) onOpenChange(false);
    };

    return (
        <BottomSheet
            open
            onOpenChange={onOpenChange}
            title={doc.title}
            subtitle={`${seenBy} · ${formatSize(doc.size_bytes)}`}
            footer={
                mine && (
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => onEdit(doc)} className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-field bg-card text-sm font-bold hover:bg-hover">
                            <Pencil className="size-4" aria-hidden="true" />
                            Nome e visibilità
                        </button>
                        <button
                            onClick={remove}
                            disabled={pending}
                            className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-field bg-card text-sm font-bold text-verm-ink hover:bg-verm-soft disabled:opacity-50"
                        >
                            <Trash2 className="size-4" aria-hidden="true" />
                            Elimina
                        </button>
                    </div>
                )
            }
        >
            <FormError message={actionError} />
            {related.length > 1 && onSwitch && (
                <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Documenti di questa attività">
                    {related.map((d) => (
                        <button
                            key={d.id}
                            role="tab"
                            aria-selected={d.id === doc.id}
                            onClick={() => onSwitch(d)}
                            className={cn('h-8 shrink-0 rounded-full border px-3 text-xs font-bold', d.id === doc.id ? 'border-ink bg-ink text-paper' : 'border-field bg-card hover:bg-hover')}
                        >
                            {d.title}
                        </button>
                    ))}
                </div>
            )}
            {error && (
                <p role="alert" className="rounded-xl bg-verm-soft px-3 py-2 text-[13px] font-semibold text-verm-ink">
                    {error}
                </p>
            )}
            {!url && !error && (
                <div className="flex h-48 items-center justify-center" role="status" aria-label="Apro il file">
                    <Loader2 className="size-6 animate-spin text-mute" aria-hidden="true" />
                </div>
            )}
            {url && isImage && (
                // white behind the image: QR codes must scan in dark mode too
                <button type="button" onClick={() => setZoom(true)} aria-label={`${doc.title}: apri a schermo intero`} className="relative block w-full cursor-zoom-in">
                    <img src={url} alt={doc.title} className="w-full rounded-2xl bg-white object-contain" />
                    <span className="absolute right-2 bottom-2 flex size-9 items-center justify-center rounded-full bg-ink/75 text-paper" aria-hidden="true">
                        <Maximize2 className="size-4" />
                    </span>
                </button>
            )}
            {url && isImage && zoom && <ImageZoom src={url} alt={doc.title} onClose={() => setZoom(false)} />}
            {url && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                    {isImage && (
                        <button onClick={() => setZoom(true)} className="col-span-2 flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-indigo text-[15px] font-extrabold text-paper hover:bg-indigo-deep">
                            <Maximize2 className="size-5" aria-hidden="true" />
                            Schermo intero
                        </button>
                    )}
                    {!isImage && (
                        <a href={url} target="_blank" rel="noreferrer" className="col-span-2 flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-indigo text-[15px] font-extrabold text-paper hover:bg-indigo-deep">
                            <ExternalLink className="size-5" aria-hidden="true" />
                            Apri il PDF
                        </a>
                    )}
                    <a
                        href={url}
                        download={`${doc.title}.${doc.mime_type === 'application/pdf' ? 'pdf' : doc.mime_type.split('/')[1]}`}
                        className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-2xl border border-field bg-card text-sm font-bold hover:bg-hover"
                    >
                        <Download className="size-4" aria-hidden="true" />
                        Salva sul telefono
                    </a>
                </div>
            )}
        </BottomSheet>
    );
}
