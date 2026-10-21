import { useTrip, useTripRealtime, type TripData } from '@/lib/api';
import { paths } from '@/lib/paths';
import { useOnline } from '@/lib/offline';
import { TripPresence } from '@/lib/presence';
import { errorMessage } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import { type ReactNode } from 'react';
import { Link, Outlet, useParams, useRouteError } from 'react-router';

export function Splash() {
    return (
        <div className="flex min-h-dvh items-center justify-center bg-paper" role="status" aria-label="Caricamento">
            <Loader2 className="size-6 animate-spin text-mute" aria-hidden="true" />
        </div>
    );
}

export function ErrorScreen({ message }: { message: string }) {
    return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper px-6 text-center">
            <p className="text-lg font-extrabold">Non riesco ad aprire questa pagina</p>
            <p className="text-sm text-mute">{message}</p>
            <Link to={paths.trips()} className="flex h-11 items-center rounded-2xl bg-ink px-5 text-sm font-bold text-paper">
                Torna ai viaggi
            </Link>
        </div>
    );
}

/**
 * Shown by the router when a page crashes while rendering, instead of a blank screen.
 * A page that fails to load after a deploy (old chunk gone) just needs a reload.
 */
export function CrashScreen() {
    const error = useRouteError();
    console.error(error);
    const text = error instanceof Error ? error.message : String(error);
    const staleBuild = /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(text);
    return (
        <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper px-6 text-center text-ink">
            <p className="text-lg font-extrabold">{staleBuild ? "C'è una nuova versione di Tabi" : 'Qualcosa è andato storto'}</p>
            <p className="max-w-sm text-sm text-mute">
                {staleBuild ? 'Ricarica per aprire la pagina con la versione aggiornata.' : 'La pagina si è bloccata. I dati del viaggio sono al sicuro: riprova, e se succede ancora torna ai viaggi.'}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
                <button onClick={() => window.location.reload()} className="flex h-11 items-center rounded-2xl bg-ink px-5 text-sm font-bold text-paper">
                    {staleBuild ? 'Ricarica' : 'Riprova'}
                </button>
                {!staleBuild && (
                    <a href={paths.trips()} className="flex h-11 items-center rounded-2xl border border-line bg-card px-5 text-sm font-bold">
                        Torna ai viaggi
                    </a>
                )}
            </div>
        </div>
    );
}

/**
 * Parent route of every /trips/:tripId page: keeps the trip live (Realtime) and shares
 * presence. It stays mounted while moving between the trip's pages.
 */
export function TripScope() {
    const id = Number(useParams().tripId);
    useTripRealtime(id);
    return (
        <TripPresence key={id} tripId={id}>
            <Outlet />
        </TripPresence>
    );
}

/** Loads the trip in the URL and hands it to `children`. */
export function WithTrip({ children }: { children: (data: TripData) => ReactNode }) {
    const id = Number(useParams().tripId);
    const query = useTrip(id);
    const online = useOnline();

    if (query.isPending && !online) return <ErrorScreen message="Sei offline e questo viaggio non è ancora salvato su questo dispositivo. Aprilo una volta con la connessione." />;
    if (query.isPending) return <Splash />;
    if (query.isError) {
        const notFound = (query.error as { code?: string }).code === 'PGRST116';
        return <ErrorScreen message={notFound ? 'Il viaggio non esiste o non ne fai più parte.' : errorMessage(query.error)} />;
    }
    return <>{children(query.data)}</>;
}
