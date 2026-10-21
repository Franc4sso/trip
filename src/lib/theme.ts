import { useSyncExternalStore } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'tabi-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function stored(): ThemeChoice {
    try {
        const v = localStorage.getItem(KEY);
        return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
        return 'system';
    }
}

let choice: ThemeChoice = stored();

function apply() {
    const dark = choice === 'dark' || (choice === 'system' && media.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111216' : '#F3F2EE');
    listeners.forEach((l) => l());
}

/** Call once at startup: applies the theme and follows system changes. */
export function initTheme() {
    apply();
    media.addEventListener('change', () => {
        if (choice === 'system') apply();
    });
}

export function setTheme(next: ThemeChoice) {
    choice = next;
    try {
        if (next === 'system') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, next);
    } catch {
        // private mode: the choice lasts for this visit only
    }
    apply();
}

function subscribe(l: () => void) {
    listeners.add(l);
    return () => {
        listeners.delete(l);
    };
}

export function useTheme(): ThemeChoice {
    return useSyncExternalStore(subscribe, () => choice);
}

/** The theme actually shown, with "system" resolved. */
export function useIsDark(): boolean {
    return useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme === 'dark');
}
