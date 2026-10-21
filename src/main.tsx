import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import { Splash, TripScope } from './components/states';
import { AuthProvider, useAuth } from './lib/auth';
import { paths } from './lib/paths';
import './index.css';
import { reserveSpaceForNetlifyBadge } from './lib/netlify-badge';
import { initTheme } from './lib/theme';
import { LoginPage, RegisterPage } from './pages/auth';
import Balance from './pages/balance';
import Bookings from './pages/bookings';
import TripForm from './pages/create';
import DayPage from './pages/day';
import Group from './pages/group';
import TripsIndex from './pages/index';
import JoinPage from './pages/join';
import TripShow from './pages/show';
import Welcome from './pages/welcome';

// MapLibre is heavy: load the map page only when opened
const MapPage = lazy(() => import('./pages/map'));

const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function RequireAuth() {
    const { session, loading } = useAuth();
    const location = useLocation();
    if (loading) return <Splash />;
    if (!session) return <Navigate to={paths.login(location.pathname)} replace />;
    return <Outlet />;
}

function GuestOnly() {
    const { session, loading } = useAuth();
    const next = new URLSearchParams(useLocation().search).get('next');
    if (loading) return <Splash />;
    if (session) return <Navigate to={next?.startsWith('/') ? next : paths.trips()} replace />;
    return <Outlet />;
}

const router = createBrowserRouter([
    {
        element: <GuestOnly />,
        children: [
            { path: '/', element: <Welcome /> },
            { path: '/login', element: <LoginPage /> },
            { path: '/register', element: <RegisterPage /> },
        ],
    },
    {
        element: <RequireAuth />,
        children: [
            { path: '/trips', element: <TripsIndex /> },
            { path: '/trips/new', element: <TripForm /> },
            {
                path: '/trips/:tripId',
                element: <TripScope />,
                children: [
                    { index: true, element: <TripShow /> },
                    { path: 'edit', element: <TripForm /> },
                    { path: 'days/:date', element: <DayPage /> },
                    { path: 'balance', element: <Balance /> },
                    {
                        path: 'map',
                        element: (
                            <Suspense fallback={<Splash />}>
                                <MapPage />
                            </Suspense>
                        ),
                    },
                    { path: 'bookings', element: <Bookings /> },
                    { path: 'group', element: <Group /> },
                ],
            },
            { path: '/join/:token', element: <JoinPage /> },
        ],
    },
    { path: '*', element: <Navigate to="/" replace /> },
]);

initTheme();
reserveSpaceForNetlifyBadge();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <AuthProvider>
                <RouterProvider router={router} />
            </AuthProvider>
        </QueryClientProvider>
    </StrictMode>,
);
