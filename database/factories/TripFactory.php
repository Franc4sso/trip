<?php

namespace Database\Factories;

use App\Enums\TripRole;
use App\Models\Trip;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Trip>
 */
class TripFactory extends Factory
{
    public function definition(): array
    {
        $start = fake()->dateTimeBetween('+1 week', '+3 months');

        return [
            'name' => fake()->country(),
            'destination' => fake()->city(),
            'start_date' => $start,
            'end_date' => (clone $start)->modify('+6 days'),
            'color' => '#2F43C9',
            'currency' => 'EUR',
        ];
    }

    public function ownedBy(User $user): static
    {
        return $this->afterCreating(fn (Trip $trip) => $trip->members()->attach($user, ['role' => TripRole::Owner->value]));
    }
}
