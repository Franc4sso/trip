<?php

namespace App\Support;

use App\Models\Activity;
use App\Models\Stay;
use App\Models\Trip;
use App\Models\User;

/** Shapes models into the props the React pages expect. */
class TripPayload
{
    public static function header(Trip $trip, User $viewer): array
    {
        $trip->loadMissing('members');
        $role = $trip->roleOf($viewer);

        return [
            'id' => $trip->id,
            'name' => $trip->name,
            'destination' => $trip->destination,
            'start_date' => $trip->start_date->toDateString(),
            'end_date' => $trip->end_date->toDateString(),
            'color' => $trip->color,
            'currency' => $trip->currency,
            'role' => $role?->value,
            'can_edit' => (bool) $role?->canEdit(),
            'members' => $trip->members->map(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->name,
                'role' => $u->pivot->role,
            ])->values(),
        ];
    }

    public static function activity(Activity $a): array
    {
        return [
            'id' => $a->id,
            'date' => $a->date?->toDateString(),
            'start_time' => $a->start_time ? substr($a->start_time, 0, 5) : null,
            'duration_minutes' => $a->duration_minutes,
            'type' => $a->type->value,
            'title' => $a->title,
            'location' => $a->location,
            'city' => $a->city,
            'notes' => $a->notes,
            'cost' => $a->cost,
            'booking_required' => $a->booking_required,
            'booking_deadline' => $a->booking_deadline?->toDateString(),
            'booked' => $a->booked,
            'booking_url' => $a->booking_url,
        ];
    }

    public static function stay(Stay $s): array
    {
        return [
            'id' => $s->id,
            'name' => $s->name,
            'city' => $s->city,
            'address' => $s->address,
            'check_in' => $s->check_in->toDateString(),
            'check_out' => $s->check_out->toDateString(),
            'nights' => $s->nights(),
            'confirmed' => $s->confirmed,
            'booking_ref' => $s->booking_ref,
            'cost' => $s->cost,
            'notes' => $s->notes,
        ];
    }
}
