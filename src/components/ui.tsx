import { ACTIVITY_TYPES, avatarColor, initials, type ActivityType, type Member } from '@/lib/trip';
import { cn } from '@/lib/utils';
import { Link } from 'react-router';
import { type ComponentProps, type ReactNode } from 'react';

export function AvatarStack({ members, ring = 'ring-paper', max = 4, online }: { members: Member[]; ring?: string; max?: number; online?: Set<string> }) {
    // colours follow the member's position in the trip; online people come first
    const indexed = members.map((m, i) => ({ m, i }));
    const ordered = online ? [...indexed.filter((x) => online.has(x.m.id)), ...indexed.filter((x) => !online.has(x.m.id))] : indexed;
    const shown = ordered.slice(0, max);
    const extra = members.length - shown.length;
    const label = members.map((m) => (online?.has(m.id) ? `${m.name} (online)` : m.name)).join(', ');

    return (
        <div className="flex pl-2" role="img" aria-label={label}>
            {shown.map(({ m, i }) => (
                <span
                    key={m.id}
                    className={cn('relative -ml-2 flex size-7 items-center justify-center rounded-full text-[11px] font-bold text-white ring-2', ring)}
                    style={{ background: avatarColor(i) }}
                >
                    {initials(m.name)}
                    {online?.has(m.id) && <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-[#1FA463] ring-2 ring-paper" />}
                </span>
            ))}
            {extra > 0 && (
                <span aria-hidden="true" className={cn('-ml-2 flex size-7 items-center justify-center rounded-full bg-field text-[11px] font-bold text-mute ring-2', ring)}>
                    +{extra}
                </span>
            )}
        </div>
    );
}

export function IconLink({ label, className, children, ...props }: ComponentProps<typeof Link> & { label: string }) {
    return (
        <Link
            aria-label={label}
            title={label}
            className={cn('flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-line bg-card text-ink transition-colors hover:bg-hover', className)}
            {...props}
        >
            {children}
        </Link>
    );
}

const LEGEND_ORDER: ActivityType[] = ['visit', 'food', 'experience', 'shopping', 'transport'];

/** What the coloured bars mean. */
export function TypeLegend({ className }: { className?: string }) {
    return (
        <div className={cn('flex flex-wrap gap-x-3 gap-y-1', className)}>
            {LEGEND_ORDER.map((type) => (
                <span key={type} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-mute">
                    <i className={cn('inline-block size-2.5 rounded-[3px]', ACTIVITY_TYPES[type].bar)} />
                    {ACTIVITY_TYPES[type].label}
                </span>
            ))}
        </div>
    );
}

export function Chip({ className, children }: { className?: string; children: ReactNode }) {
    return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', className)}>{children}</span>;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
    return <div className={cn('rounded-[20px] border border-line bg-card p-4', className)}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
    return (
        <div className="mb-2.5 flex items-baseline justify-between">
            <h2 className="text-[15px] font-extrabold">{children}</h2>
            {action}
        </div>
    );
}

export function PrimaryButton({ className, ...props }: ComponentProps<'button'>) {
    return (
        <button
            className={cn(
                'flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-indigo px-5 text-[15px] font-extrabold text-paper transition-colors hover:bg-indigo-deep disabled:opacity-60',
                className,
            )}
            {...props}
        />
    );
}

export function Field({ label, error, children, htmlFor }: { label: string; error?: string | null; children: ReactNode; htmlFor: string }) {
    return (
        <div>
            <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-bold text-mute">
                {label}
            </label>
            {children}
            {error && <p className="mt-1 text-xs font-semibold text-verm-ink">{error}</p>}
        </div>
    );
}

export const inputClass =
    'h-11 w-full rounded-xl border border-field bg-card px-3 text-base text-ink outline-none transition-shadow placeholder:text-faint focus:border-indigo focus:ring-3 focus:ring-indigo-soft sm:text-sm';

export function FormError({ message }: { message: string | null }) {
    if (!message) return null;
    return (
        <p role="alert" className="rounded-xl bg-verm-soft px-3 py-2 text-[13px] font-semibold text-verm-ink">
            {message}
        </p>
    );
}
