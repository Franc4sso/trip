<?php

namespace Tests\Feature;

use App\Enums\ActivityType;
use App\Models\Activity;
use App\Models\Stay;
use App\Models\Trip;
use App\Services\TripInsights;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TripInsightsTest extends TestCase
{
    use RefreshDatabase;

    private function trip(): Trip
    {
        return Trip::factory()->create(['start_date' => '2026-11-03', 'end_date' => '2026-11-06']);
    }

    private function activity(Trip $trip, array $attrs): Activity
    {
        return Activity::factory()->for($trip)->create($attrs);
    }

    private function day(array $insights, string $date): array
    {
        return collect($insights['days'])->firstWhere('date', $date);
    }

    public function test_it_lists_every_day_of_the_trip()
    {
        $insights = TripInsights::for($this->trip());

        $this->assertSame(
            ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'],
            array_column($insights['days'], 'date'),
        );
        $this->assertSame([1, 2, 3, 4], array_column($insights['days'], 'number'));
    }

    public function test_days_without_activities_are_empty()
    {
        $trip = $this->trip();
        $this->activity($trip, ['date' => '2026-11-04', 'start_time' => '10:00', 'duration_minutes' => 120]);
        $this->activity($trip, ['date' => '2026-11-05', 'type' => ActivityType::Note]);

        $insights = TripInsights::for($trip);

        $this->assertSame(['2026-11-03', '2026-11-05', '2026-11-06'], $insights['empty_days']);
        $this->assertSame('ok', $this->day($insights, '2026-11-04')['load']);
        $this->assertSame('empty', $this->day($insights, '2026-11-05')['load']);
    }

    public function test_it_sums_planned_minutes_by_type_and_flags_overloaded_days()
    {
        $trip = $this->trip();
        $this->activity($trip, ['date' => '2026-11-03', 'start_time' => '08:00', 'duration_minutes' => 300, 'type' => ActivityType::Visit]);
        $this->activity($trip, ['date' => '2026-11-03', 'start_time' => '13:00', 'duration_minutes' => 60, 'type' => ActivityType::Food]);
        $this->activity($trip, ['date' => '2026-11-03', 'start_time' => '14:00', 'duration_minutes' => 300, 'type' => ActivityType::Experience]);

        $day = $this->day(TripInsights::for($trip), '2026-11-03');

        $this->assertSame(660, $day['planned_minutes']);
        $this->assertSame(['visit' => 300, 'food' => 60, 'experience' => 300], $day['minutes_by_type']);
        $this->assertSame('full', $day['load']);
    }

    public function test_it_finds_gaps_of_two_hours_or_more_between_timed_activities()
    {
        $trip = $this->trip();
        $this->activity($trip, ['date' => '2026-11-04', 'start_time' => '09:00', 'duration_minutes' => 120]); // until 11:00
        $this->activity($trip, ['date' => '2026-11-04', 'start_time' => '14:00', 'duration_minutes' => 60]);  // 3h gap
        $this->activity($trip, ['date' => '2026-11-04', 'start_time' => '16:30', 'duration_minutes' => 60]);  // 1h30 gap, ignored

        $day = $this->day(TripInsights::for($trip), '2026-11-04');

        $this->assertSame([['from' => '11:00', 'to' => '14:00', 'minutes' => 180]], $day['gaps']);
    }

    public function test_overlapping_activities_do_not_create_gaps()
    {
        $trip = $this->trip();
        $this->activity($trip, ['date' => '2026-11-04', 'start_time' => '09:00', 'duration_minutes' => 300]); // until 14:00
        $this->activity($trip, ['date' => '2026-11-04', 'start_time' => '10:00', 'duration_minutes' => 60]);
        $this->activity($trip, ['date' => '2026-11-04', 'start_time' => '15:00', 'duration_minutes' => 60]);

        $this->assertSame([], $this->day(TripInsights::for($trip), '2026-11-04')['gaps']);
    }

    public function test_city_comes_from_the_stay_of_that_night_and_uncovered_nights_are_reported()
    {
        $trip = $this->trip();
        Stay::factory()->for($trip)->create(['city' => 'Tokyo', 'check_in' => '2026-11-03', 'check_out' => '2026-11-05']);

        $insights = TripInsights::for($trip);

        $this->assertSame('Tokyo', $this->day($insights, '2026-11-03')['city']);
        $this->assertSame('Tokyo', $this->day($insights, '2026-11-04')['city']);
        // check-out day: no stay that night, but you are still where you slept
        $this->assertSame('Tokyo', $this->day($insights, '2026-11-05')['city']);
        // the last day is the departure: no night to cover
        $this->assertSame(['2026-11-05'], $insights['uncovered_nights']);
        $this->assertSame([['city' => 'Tokyo', 'nights' => 2]], $insights['city_nights']);
    }

    public function test_pending_bookings_are_sorted_by_deadline()
    {
        $trip = $this->trip();
        $this->activity($trip, ['title' => 'Late', 'booking_required' => true, 'booking_deadline' => '2026-10-30']);
        $this->activity($trip, ['title' => 'Done', 'booking_required' => true, 'booked' => true, 'booking_deadline' => '2026-10-01']);
        $this->activity($trip, ['title' => 'Soon', 'booking_required' => true, 'booking_deadline' => '2026-10-25']);
        $this->activity($trip, ['title' => 'Whenever', 'booking_required' => true]);

        $titles = array_column(TripInsights::for($trip)['pending_bookings'], 'title');

        $this->assertSame(['Soon', 'Late', 'Whenever'], $titles);
    }
}
