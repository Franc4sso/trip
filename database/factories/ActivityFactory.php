<?php

namespace Database\Factories;

use App\Enums\ActivityType;
use App\Models\Activity;
use App\Models\Trip;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Activity>
 */
class ActivityFactory extends Factory
{
    public function definition(): array
    {
        return [
            'trip_id' => Trip::factory(),
            'date' => null,
            'start_time' => null,
            'duration_minutes' => 60,
            'type' => ActivityType::Visit,
            'title' => fake()->words(3, true),
        ];
    }
}
