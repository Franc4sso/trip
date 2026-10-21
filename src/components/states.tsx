import { useTrip, useTripRealtime, type TripData } from '@/lib/api';
import { paths } from '@/lib/paths';
import { errorMessage } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import { type ReactNode } from 'react';
import { Link, useParams } from 'react-router';

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
            <Link to={paths.trips()} className="flex h-11 items-center rounded-2xl bg-ink px-5 text-sm font-bold text-white">
                Torna ai viaggi
            </Link>
        </div>
    );
}

/** Loads the trip in the URL, keeps it live and hands it to `children`. */
export function WithTrip({ children }: { children: (data: TripData) => ReactNode }) {
    const id = Number(useParams().tripId);
    const query = useTrip(id);
    useTripRealtime(id);

    if (query.isPending) return <Splash />;
    if (query.isError) {
        const notFound = (query.error as { code?: string }).code === 'PGRST116';
        return <ErrorScreen message={notFound ? 'Il viaggio non esiste o non ne fai più parte.' : errorMessage(query.error)} />;
    }
    return <>{children(query.data)}</>;
}
