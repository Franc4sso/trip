import { cn } from '@/lib/utils';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';

/** Small caps title over a group of a form: "QUANDO", "DETTAGLI". */
export function GroupLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
    const className = 'mb-1.5 block text-[11px] font-bold tracking-[0.04em] text-mute uppercase';
    return htmlFor ? (
        <label htmlFor={htmlFor} className={className}>
            {children}
        </label>
    ) : (
        <p className={className}>{children}</p>
    );
}

/** One card holding the detail rows, divided by hairlines. */
export function DetailRows({ children }: { children: ReactNode }) {
    return <div className="divide-y divide-line overflow-hidden rounded-[18px] border border-line bg-card">{children}</div>;
}

/**
 * A detail of the form folded into one line that shows its value ("Non serve", the address);
 * tapping it opens the fields right there. Empty details invite to add instead.
 */
export function DetailRow({
    icon: Icon,
    tint,
    label,
    value,
    open,
    onToggle,
    children,
}: {
    icon: LucideIcon;
    /** Background and text color of the icon tile. */
    tint: string;
    label: string;
    /** What it is set to now; null shows "+ Aggiungi". */
    value: string | null;
    open: boolean;
    onToggle: () => void;
    children: ReactNode;
}) {
    const panel = useId();
    return (
        <div>
            <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panel} className="flex min-h-[52px] w-full items-center gap-3 px-3.5 text-left hover:bg-hover">
                <span className={cn('flex size-[30px] shrink-0 items-center justify-center rounded-[9px]', tint)} aria-hidden="true">
                    <Icon className="size-4" />
                </span>
                <span className="flex-1 text-sm font-bold">{label}</span>
                {open ? null : value ? (
                    <span className="max-w-[45%] truncate text-[13px] text-mute">{value}</span>
                ) : (
                    <span className="text-[13px] font-bold text-indigo">+ Aggiungi</span>
                )}
                <ChevronDown className={cn('size-4 shrink-0 text-faint transition-transform', open && 'rotate-180')} aria-hidden="true" />
            </button>
            {open && (
                <div id={panel} className="flex flex-col gap-3 px-3.5 pt-1 pb-3.5">
                    {children}
                </div>
            )}
        </div>
    );
}

/** A labelled box with a native picker inside: the day, the time, the duration. */
export function Tile({ label, htmlFor, children, disabled }: { label: string; htmlFor: string; children: ReactNode; disabled?: boolean }) {
    return (
        <label
            htmlFor={htmlFor}
            className={cn(
                'flex h-14 min-w-0 flex-col justify-center rounded-[14px] border border-field bg-card px-3 focus-within:border-indigo focus-within:ring-3 focus-within:ring-indigo-soft',
                disabled && 'opacity-50',
            )}
        >
            <span className="text-[11px] text-mute">{label}</span>
            {children}
        </label>
    );
}

/**
 * The bare control inside a Tile: no border of its own, the tile is the field. 16px or iOS
 * zooms the page on focus; the picker icon goes, it cut "15:00" to "15:0" in a third of a phone.
 */
export const tileControl =
    'w-full min-w-0 appearance-none bg-transparent p-0 text-base font-extrabold text-ink outline-none disabled:cursor-not-allowed [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-date-and-time-value]:text-left';
