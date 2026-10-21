<?php

namespace App\Http\Controllers;

use App\Models\Activity;
use App\Models\Trip;
use App\Services\TripInsights;
use App\Support\TripPayload;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class DayController extends Controller
{
    public function show(Request $request, Trip $trip, string $date): Response
    {
        Gate::authorize('view', $trip);

        $day = CarbonImmutable::parse($date);
        abort_if($day->lt($trip->start_date) || $day->gt($trip->end_date), 404);

        $trip->load(['activities', 'stays']);
        $insights = TripInsights::for($trip);

        $activities = $trip->activities
            ->filter(fn (Activity $a) => $a->date?->isSameDay($day))
            // untimed activities go last, keeping insertion order
            ->sortBy(fn (Activity $a) => [$a->start_time === null ? 1 : 0, $a->startMinute() ?? 0, $a->id])
            ->values()
            ->map(TripPayload::activity(...));

        $tonight = $trip->stays->first(fn ($s) => $s->coversNight($day));

        return Inertia::render('trips/day', [
            'trip' => TripPayload::header($trip, $request->user()),
            'day' => collect($insights['days'])->firstWhere('date', $day->toDateString()),
            'days' => array_map(fn ($d) => [
                'date' => $d['date'],
                'number' => $d['number'],
                'load' => $d['load'],
                'city' => $d['city'],
            ], $insights['days']),
            'activities' => $activities,
            'stay' => $tonight ? TripPayload::stay($tonight) : null,
            'ideas' => $trip->activities->whereNull('date')->values()->map(TripPayload::activity(...)),
        ]);
    }
}
