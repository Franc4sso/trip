import type { MouseEvent } from 'react';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/** Without its icon a date or time field still opens its picker on desktop, on a click. */
export function openPicker(e: MouseEvent<HTMLInputElement>) {
    try {
        e.currentTarget.showPicker?.();
    } catch {
        // not allowed here (e.g. inside a cross-origin frame): typing still works
    }
}
