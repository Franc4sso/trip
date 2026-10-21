import { avatarColor, initials, type Member } from '@/lib/trip';
import { cn } from '@/lib/utils';
import { Link } from '@inertiajs/react';
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
                <span aria-hidden="true" className={cn('-ml-2 flex size-7 items-center justify-center rounded-full bg-[#DAD8D1] text-[11px] font-bold text-mute ring-2', ring)}>
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
            className={cn('flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-line bg-white text-ink transition-colors hover:bg-[#F7F6F2]', className)}
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
    return <div className={cn('rounded-[20px] border border-line bg-white p-4', className)}>{children}</div>;
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
                'flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-indigo px-5 text-[15px] font-extrabold text-white transition-colors hover:bg-indigo-deep disabled:opacity-60',
                className,
            )}
            {...props}
        />
    );
}

export function Field({ label, error, children, htmlFor }: { label: string; error?: string; children: ReactNode; htmlFor: string }) {
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
    'h-11 w-full rounded-xl border border-[#DAD8D1] bg-white px-3 text-base text-ink outline-none transition-shadow placeholder:text-[#8B8C93] focus:border-indigo focus:ring-3 focus:ring-indigo-soft sm:text-sm';
