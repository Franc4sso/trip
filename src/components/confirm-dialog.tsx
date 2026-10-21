import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

export interface ConfirmOptions {
    title: string;
    /** What happens if they go ahead, in plain words. */
    description?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    /** "danger" for deletions and anything that can't be undone. */
    tone?: 'danger' | 'default';
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** Ask before a destructive action: `if (!(await confirm({...}))) return;` */
export function useConfirm(): Confirm {
    const confirm = useContext(ConfirmContext);
    if (!confirm) throw new Error('useConfirm needs <ConfirmProvider>');
    return confirm;
}

/** One app-wide confirmation dialog: a sheet from the bottom on phones, a centred card on wider screens. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    const [open, setOpen] = useState(false);
    const resolver = useRef<((ok: boolean) => void) | null>(null);

    const confirm = useCallback<Confirm>((next) => {
        resolver.current?.(false);
        setOptions(next);
        setOpen(true);
        return new Promise((resolve) => (resolver.current = resolve));
    }, []);

    const settle = (ok: boolean) => {
        resolver.current?.(ok);
        resolver.current = null;
        setOpen(false);
    };

    const danger = options?.tone !== 'default';
    const Icon = danger ? AlertTriangle : HelpCircle;

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <Dialog.Root open={open} onOpenChange={(o) => !o && settle(false)}>
                <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/55 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
                    <Dialog.Content
                        role="alertdialog"
                        // focus "Annulla", not the destructive button: Enter must never delete by accident
                        onOpenAutoFocus={(e) => {
                            e.preventDefault();
                            (e.currentTarget as HTMLElement).querySelector<HTMLButtonElement>('[data-cancel]')?.focus();
                        }}
                        className="fixed inset-x-0 bottom-0 z-[60] mx-auto w-full max-w-md rounded-t-[28px] bg-paper px-5 pt-2.5 pb-[calc(max(env(safe-area-inset-bottom),1.25rem)+var(--badge-space))] text-ink shadow-2xl outline-none data-[state=closed]:animate-out data-[state=open]:animate-in max-sm:data-[state=closed]:slide-out-to-bottom max-sm:data-[state=open]:slide-in-from-bottom sm:top-1/2 sm:bottom-auto sm:max-w-sm sm:-translate-y-1/2 sm:rounded-[28px] sm:pb-5 sm:data-[state=closed]:fade-out-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:fade-in-0 sm:data-[state=open]:zoom-in-95"
                    >
                        <div className="mx-auto h-[5px] w-10 rounded-full bg-field sm:hidden" aria-hidden="true" />
                        <span
                            className={cn('mt-4 flex size-12 items-center justify-center rounded-2xl', danger ? 'bg-verm-soft text-verm-ink' : 'bg-indigo-soft text-indigo')}
                            aria-hidden="true"
                        >
                            <Icon className="size-6" />
                        </span>
                        <Dialog.Title className="mt-3 text-xl font-extrabold text-balance">{options?.title}</Dialog.Title>
                        {options?.description ? (
                            <Dialog.Description className="mt-1.5 text-sm text-mute text-pretty">{options.description}</Dialog.Description>
                        ) : (
                            <Dialog.Description className="sr-only">{options?.title}</Dialog.Description>
                        )}
                        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
                            <button
                                data-cancel
                                onClick={() => settle(false)}
                                className="h-[52px] sm:flex-1 rounded-2xl border border-line bg-card text-[15px] font-bold transition-colors hover:bg-hover"
                            >
                                {options?.cancelLabel ?? 'Annulla'}
                            </button>
                            <button
                                onClick={() => settle(true)}
                                className={cn(
                                    'h-[52px] sm:flex-1 rounded-2xl text-[15px] font-extrabold transition-colors',
                                    danger ? 'bg-verm text-on-verm hover:bg-verm-ink' : 'bg-indigo text-on-indigo hover:bg-indigo-deep',
                                )}
                            >
                                {options?.confirmLabel ?? (danger ? 'Elimina' : 'Continua')}
                            </button>
                        </div>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </ConfirmContext.Provider>
    );
}
