<?php

namespace App\Services;

use App\Enums\ActivityType;
use App\Models\Activity;
use App\Models\Stay;
use App\Models\Trip;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Reads a trip and tells what is missing: empty or overloaded days,
 * free gaps inside a day, nights without a place to sleep, bookings to do.
 */
class TripInsights
{
    public const GAP_MINUTES = 120;

    public const FULL_DAY_MINUTES = 600;

    public static function for(Trip $trip): array
    {
        $trip->loadMissing(['activities', 'stays']);

        $stays = $trip->stays->sortBy('check_in')->values();
        $byDate = $trip->activities
            ->whereNotNull('date')
            ->groupBy(fn (Activity $a) => $a->date->toDateString());

        $days = [];
        foreach ($trip->days() as $i => $date) {
            $days[] = self::day($date, $i + 1, $byDate->get($date->toDateString(), collect()), $stays);
        }

        return [
            'days' => $days,
            'empty_days' => array_values(array_column(array_filter($days, fn ($d) => $d['load'] === 'empty'), 'date')),
            'full_days' => array_values(array_column(array_filter($days, fn ($d) => $d['load'] === 'full'), 'date')),
            'uncovered_nights' => self::uncoveredNights($trip, $stays),
            'city_nights' => self::cityNights($stays),
            'pending_bookings' => self::pendingBookings($trip),
        ];
    }

    /**
     * @param  Collection<int, Activity>  $activities
     * @param  Collection<int, Stay>  $stays
     */
    private static function day(CarbonImmutable $date, int $number, Collection $activities, Collection $stays): array
    {
        $counted = $activities->reject(fn (Activity $a) => $a->type === ActivityType::Note);

        $minutesByType = [];
        foreach ($counted as $activity) {
            $type = $activity->type->value;
            $minutesByType[$type] = ($minutesByType[$type] ?? 0) + ($activity->duration_minutes ?? 0);
        }
        $planned = array_sum($minutesByType);

        $load = match (true) {
            $counted->isEmpty() => 'empty',
            $planned > self::FULL_DAY_MINUTES => 'full',
            default => 'ok',
        };

        return [
            'date' => $date->toDateString(),
            'number' => $number,
            'city' => self::cityOn($date, $stays),
            'activity_count' => $counted->count(),
            'planned_minutes' => $planned,
            'minutes_by_type' => $minutesByType,
            'load' => $load,
            'gaps' => self::gaps($counted),
        ];
    }

    /**
     * Free windows between timed activities, merging overlaps first.
     *
     * @param  Collection<int, Activity>  $activities
     */
    private static function gaps(Collection $activities): array
    {
        $timed = $activities
            ->filter(fn (Activity $a) => $a->start_time !== null)
            ->sortBy(fn (Activity $a) => $a->startMinute())
            ->values();

        $gaps = [];
        $busyUntil = null;
        foreach ($timed as $activity) {
            $start = $activity->startMinute();
            if ($busyUntil !== null && $start - $busyUntil >= self::GAP_MINUTES) {
                $gaps[] = [
                    'from' => self::clock($busyUntil),
                    'to' => self::clock($start),
                    'minutes' => $start - $busyUntil,
                ];
            }
            $busyUntil = max($busyUntil ?? 0, $activity->endMinute());
        }

        return $gaps;
    }

    /** Where you sleep that night, or where you slept the night before (check-out day). */
    private static function cityOn(CarbonImmutable $date, Collection $stays): ?string
    {
        $tonight = $stays->first(fn (Stay $s) => $s->coversNight($date));
        if ($tonight) {
            return $tonight->city;
        }

        return $stays->first(fn (Stay $s) => $s->coversNight($date->subDay()))?->city;
    }

    private static function uncoveredNights(Trip $trip, Collection $stays): array
    {
        $nights = array_slice($trip->days(), 0, -1);

        return array_values(array_map(
            fn (CarbonImmutable $d) => $d->toDateString(),
            array_filter($nights, fn (CarbonImmutable $d) => ! $stays->contains(fn (Stay $s) => $s->coversNight($d))),
        ));
    }

    private static function cityNights(Collection $stays): array
    {
        return $stays
            ->groupBy('city')
            ->map(fn (Collection $group, string $city) => ['city' => $city, 'nights' => $group->sum(fn (Stay $s) => $s->nights())])
            ->values()
            ->all();
    }

    private static function pendingBookings(Trip $trip): array
    {
        return $trip->activities
            ->filter(fn (Activity $a) => $a->booking_required && ! $a->booked)
            ->sortBy(fn (Activity $a) => $a->booking_deadline?->toDateString() ?? '9999-12-31')
            ->map(fn (Activity $a) => [
                'id' => $a->id,
                'title' => $a->title,
                'date' => $a->date?->toDateString(),
                'deadline' => $a->booking_deadline?->toDateString(),
                'url' => $a->booking_url,
            ])
            ->values()
            ->all();
    }

    private static function clock(int $minutes): string
    {
        return sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
    }
}
