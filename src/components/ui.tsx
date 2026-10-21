import { avatarColor, initials, type Member } from '@/lib/trip';
import { cn } from '@/lib/utils';
import { Link } from 'react-router';
import { type ComponentProps, type ReactNode } from 'react';

export function AvatarStack({ members, ring = 'ring-paper', max = 4 }: { members: Member[]; ring?: string; max?: number }) {
    const shown = members.slice(0, max);
    const extra = members.length - shown.length;

    return (
        <div className="flex pl-2" aria-label={members.map((m) => m.name).join(', ')}>
            {shown.map((m, i) => (
                <span
                    key={m.id}
                    aria-hidden="true"
                    className={cn('-ml-2 flex size-7 items-center justify-center rounded-full text-[11px] font-bold text-white ring-2', ring)}
                    style={{ background: avatarColor(i) }}
                >
                    {initials(m.name)}
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
            className={cn('flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-line bg-card text-ink transition-colors hover:bg-hover', className)}
            {...props}
        >
            {children}
        </Link>
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
