<?php

namespace App\Policies;

use App\Enums\TripRole;
use App\Models\Trip;
use App\Models\User;

class TripPolicy
{
    public function view(User $user, Trip $trip): bool
    {
        return $trip->roleOf($user) !== null;
    }

    public function update(User $user, Trip $trip): bool
    {
        return (bool) $trip->roleOf($user)?->canEdit();
    }

    public function manage(User $user, Trip $trip): bool
    {
        return $trip->roleOf($user) === TripRole::Owner;
    }
}
