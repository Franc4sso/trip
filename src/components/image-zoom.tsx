import { Minus, Plus, RotateCw, X } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { createPortal } from 'react-dom';

interface Props {
    src: string;
    alt: string;
    onClose: () => void;
}

const MIN = 1;
const MAX = 6;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * A ticket full screen on white, to show at the gate: pinch or double tap to zoom,
 * drag to move, rotate for landscape tickets. The screen stays on while it is open.
 */
export function ImageZoom({ src, alt, onClose }: Props) {
    const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
    const [turns, setTurns] = useState(0);
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const pinch = useRef<{ distance: number; scale: number } | null>(null);
    const lastTap = useRef(0);

    // over the sheet's dialog: Escape closes this first, and the screen stays awake
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            onClose();
        };
        window.addEventListener('keydown', onKey, true);
        let lock: WakeLockSentinel | null = null;
        navigator.wakeLock
            ?.request('screen')
            .then((l) => (lock = l))
            .catch(() => {});
        return () => {
            window.removeEventListener('keydown', onKey, true);
            lock?.release().catch(() => {});
        };
    }, [onClose]);

    const zoomTo = (scale: number) => setView((v) => (scale <= MIN ? { scale: MIN, x: 0, y: 0 } : { ...v, scale: clamp(scale, MIN, MAX) }));

    const down = (e: ReactPointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
        } else if (e.pointerType !== 'mouse' || e.button === 0) {
            // double tap: in to 2.5×, or back to fit
            const now = Date.now();
            if (now - lastTap.current < 300) zoomTo(view.scale > 1 ? 1 : 2.5);
            lastTap.current = now;
        }
    };

    const move = (e: ReactPointerEvent) => {
        const prev = pointers.current.get(e.pointerId);
        if (!prev) return;
        const point = { x: e.clientX, y: e.clientY };
        pointers.current.set(e.pointerId, point);
        if (pointers.current.size === 2 && pinch.current) {
            const [a, b] = [...pointers.current.values()];
            zoomTo((pinch.current.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.distance);
        } else if (pointers.current.size === 1 && view.scale > 1) {
            setView((v) => ({ ...v, x: v.x + point.x - prev.x, y: v.y + point.y - prev.y }));
        }
    };

    const up = (e: ReactPointerEvent) => {
        pointers.current.delete(e.pointerId);
        if (pointers.current.size < 2) pinch.current = null;
    };

    const wheel = (e: WheelEvent) => zoomTo(view.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15));

    const button = 'flex size-12 items-center justify-center rounded-full bg-ink/80 text-paper shadow-lg backdrop-blur hover:bg-ink';

    return createPortal(
        // the sheet underneath is a modal dialog that turns pointer events off outside it
        <div className="fixed inset-0 z-[70] touch-none overflow-hidden bg-white select-none" style={{ pointerEvents: 'auto' }} role="dialog" aria-modal="true" aria-label={`${alt}, a schermo intero`}>
            {/* a white margin all round: QR readers need a quiet zone */}
            <div
                className="flex size-full items-center justify-center p-4"
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onWheel={wheel}
            >
                <img
                    src={src}
                    alt={alt}
                    draggable={false}
                    // fills the screen even when small; turned sideways, it fits the screen's other side
                    className={`shrink-0 object-contain transition-transform duration-75 ease-out ${turns % 2 ? 'h-[100vw] w-[100dvh]' : 'size-full'}`}
                    style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale}) rotate(${turns * 90}deg)` }}
                />
            </div>

            <div className="absolute inset-x-0 top-0 flex justify-end p-4 pt-[max(env(safe-area-inset-top),1rem)]">
                <button onClick={onClose} aria-label="Chiudi" className={button}>
                    <X className="size-6" aria-hidden="true" />
                </button>
            </div>

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 p-4 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
                <button onClick={() => zoomTo(view.scale / 1.5)} disabled={view.scale <= MIN} aria-label="Rimpicciolisci" className={`${button} disabled:opacity-40`}>
                    <Minus className="size-5" aria-hidden="true" />
                </button>
                <button onClick={() => setTurns((t) => (t + 1) % 4)} aria-label="Ruota" className={button}>
                    <RotateCw className="size-5" aria-hidden="true" />
                </button>
                <button onClick={() => zoomTo(view.scale * 1.5)} disabled={view.scale >= MAX} aria-label="Ingrandisci" className={`${button} disabled:opacity-40`}>
                    <Plus className="size-5" aria-hidden="true" />
                </button>
            </div>
        </div>,
        document.body,
    );
}
