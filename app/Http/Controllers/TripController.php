<?php

namespace App\Http\Controllers;

use App\Enums\TripRole;
use App\Models\Trip;
use App\Services\TripInsights;
use App\Support\TripPayload;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class TripController extends Controller
{
    public function index(Request $request): Response
    {
        $trips = $request->user()->trips()
            ->with(['members', 'activities', 'stays'])
            ->orderBy('start_date')
            ->get()
            ->map(function (Trip $trip) use ($request) {
                $insights = TripInsights::for($trip);

                return [
                    ...TripPayload::header($trip, $request->user()),
                    'day_loads' => array_column($insights['days'], 'load'),
                    'empty_days' => count($insights['empty_days']),
                    'pending_bookings' => count($insights['pending_bookings']),
                ];
            });

        return Inertia::render('trips/index', ['trips' => $trips]);
    }

    public function create(): Response
    {
        return Inertia::render('trips/create');
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);

        $trip = DB::transaction(function () use ($data, $request) {
            $trip = Trip::create($data);
            $trip->members()->attach($request->user(), ['role' => TripRole::Owner->value]);

            return $trip;
        });

        return to_route('trips.show', $trip);
    }

    public function show(Request $request, Trip $trip): Response
    {
        Gate::authorize('view', $trip);

        $insights = TripInsights::for($trip);

        return Inertia::render('trips/show', [
            'trip' => TripPayload::header($trip, $request->user()),
            'insights' => $insights,
            'stays' => $trip->stays->sortBy('check_in')->values()->map(TripPayload::stay(...)),
        ]);
    }

    public function edit(Request $request, Trip $trip): Response
    {
        Gate::authorize('update', $trip);

        return Inertia::render('trips/create', ['trip' => TripPayload::header($trip, $request->user())]);
    }

    public function update(Request $request, Trip $trip): RedirectResponse
    {
        Gate::authorize('update', $trip);

        $trip->update($this->validated($request));

        return to_route('trips.show', $trip);
    }

    public function destroy(Trip $trip): RedirectResponse
    {
        Gate::authorize('manage', $trip);

        $trip->delete();

        return to_route('trips.index');
    }

    public function balance(Request $request, Trip $trip): Response
    {
        Gate::authorize('view', $trip);

        return Inertia::render('trips/balance', [
            'trip' => TripPayload::header($trip, $request->user()),
            'insights' => TripInsights::for($trip),
        ]);
    }

    public function bookings(Request $request, Trip $trip): Response
    {
        Gate::authorize('view', $trip);

        $trip->load(['activities', 'stays']);

        return Inertia::render('trips/bookings', [
            'trip' => TripPayload::header($trip, $request->user()),
            'bookings' => $trip->activities
                ->where('booking_required', true)
                ->sortBy(fn ($a) => $a->booking_deadline?->toDateString() ?? '9999-12-31')
                ->values()
                ->map(TripPayload::activity(...)),
            'stays' => $trip->stays->sortBy('check_in')->values()->map(TripPayload::stay(...)),
            'uncovered_nights' => TripInsights::for($trip)['uncovered_nights'],
        ]);
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'destination' => ['nullable', 'string', 'max:200'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'currency' => ['nullable', 'string', 'size:3'],
        ]);

        if (strtotime($data['end_date']) - strtotime($data['start_date']) > 90 * 86400) {
            throw ValidationException::withMessages(['end_date' => 'Un viaggio può durare al massimo 90 giorni.']);
        }

        $data['color'] ??= '#2F43C9';
        $data['currency'] = strtoupper($data['currency'] ?? 'EUR');

        return $data;
    }
}
