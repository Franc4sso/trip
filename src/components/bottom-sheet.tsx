import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { type ReactNode } from 'react';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    subtitle?: string;
    children: ReactNode;
    footer?: ReactNode;
}

/** Phone-style sheet that rises from the bottom; centred card on wider screens. */
export function BottomSheet({ open, onOpenChange, title, subtitle, children, footer }: Props) {
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/45 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
                <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-[28px] bg-[#F7F6F2] text-ink shadow-2xl outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom sm:bottom-6 sm:rounded-[28px]">
                    <div className="mx-auto mt-2.5 h-[5px] w-10 shrink-0 rounded-full bg-[#CFCDC6]" aria-hidden="true" />
                    <div className="flex shrink-0 items-center justify-between px-5 pt-3 pb-2">
                        <div>
                            <Dialog.Title className="text-xl font-extrabold">{title}</Dialog.Title>
                            {subtitle ? <Dialog.Description className="text-[13px] text-mute">{subtitle}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
                        </div>
                        <Dialog.Close aria-label="Chiudi" className="flex size-11 items-center justify-center rounded-[14px] border border-line bg-white hover:bg-[#F3F2EE]">
                            <X className="size-5" aria-hidden="true" />
                        </Dialog.Close>
                    </div>
                    <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-4">{children}</div>
                    {footer && <div className="shrink-0 border-t border-line px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">{footer}</div>}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
