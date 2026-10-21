import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import { Splash } from './components/states';
import { AuthProvider, useAuth } from './lib/auth';
import { paths } from './lib/paths';
import './index.css';
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
            { path: '/trips/:tripId', element: <TripShow /> },
            { path: '/trips/:tripId/edit', element: <TripForm /> },
            { path: '/trips/:tripId/days/:date', element: <DayPage /> },
            { path: '/trips/:tripId/balance', element: <Balance /> },
            { path: '/trips/:tripId/bookings', element: <Bookings /> },
            { path: '/trips/:tripId/group', element: <Group /> },
            { path: '/join/:token', element: <JoinPage /> },
        ],
    },
    { path: '*', element: <Navigate to="/" replace /> },
]);

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <AuthProvider>
                <RouterProvider router={router} />
            </AuthProvider>
        </QueryClientProvider>
    </StrictMode>,
);
