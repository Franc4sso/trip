import { ErrorScreen, Splash } from '@/components/states';
import { api } from '@/lib/api';
import { paths } from '@/lib/paths';
import { errorMessage } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

export default function JoinPage() {
    const { token = '' } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [error, setError] = useState<string | null>(null);
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return; // StrictMode runs effects twice in dev
        started.current = true;
        api.joinTrip(token)
            .then(async (tripId) => {
                await queryClient.invalidateQueries({ queryKey: ['trips'] });
                navigate(paths.trip(tripId), { replace: true });
            })
            .catch((e) => setError(errorMessage(e)));
    }, [token, navigate, queryClient]);

    return error ? <ErrorScreen message={error} /> : <Splash />;
}
