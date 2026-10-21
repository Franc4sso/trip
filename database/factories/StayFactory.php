<?php

namespace Database\Factories;

use App\Models\Stay;
use App\Models\Trip;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Stay>
 */
class StayFactory extends Factory
{
    public function definition(): array
    {
        $in = fake()->dateTimeBetween('+1 week', '+1 month');

        return [
            'trip_id' => Trip::factory(),
            'name' => fake()->company().' Hotel',
            'city' => fake()->city(),
            'check_in' => $in,
            'check_out' => (clone $in)->modify('+2 days'),
            'confirmed' => true,
        ];
    }
}
