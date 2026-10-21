<?php

namespace App\Http\Controllers;

use App\Enums\ActivityType;
use App\Models\Activity;
use App\Models\Trip;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class ActivityController extends Controller
{
    public function store(Request $request, Trip $trip): RedirectResponse
    {
        Gate::authorize('update', $trip);

        $activity = new Activity($this->validated($request, $trip));
        $activity->created_by = $request->user()->id;
        $trip->activities()->save($activity);

        return back();
    }

    public function update(Request $request, Trip $trip, Activity $activity): RedirectResponse
    {
        Gate::authorize('update', $trip);

        $activity->update($this->validated($request, $trip, partial: true));

        return back();
    }

    public function destroy(Trip $trip, Activity $activity): RedirectResponse
    {
        Gate::authorize('update', $trip);

        $activity->delete();

        return back();
    }

    private function validated(Request $request, Trip $trip, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        $data = $request->validate([
            'date' => ['nullable', 'date', 'after_or_equal:'.$trip->start_date->toDateString(), 'before_or_equal:'.$trip->end_date->toDateString()],
            'start_time' => ['nullable', 'date_format:H:i'],
            'duration_minutes' => ['nullable', 'integer', 'min:0', 'max:1440'],
            'type' => [$required, Rule::enum(ActivityType::class)],
            'title' => [$required, 'string', 'max:200'],
            'location' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'cost' => ['nullable', 'integer', 'min:0'],
            'booking_required' => ['sometimes', 'boolean'],
            'booking_deadline' => ['nullable', 'date'],
            'booked' => ['sometimes', 'boolean'],
            'booking_url' => ['nullable', 'url', 'max:2048'],
        ]);

        // an idea without a day cannot keep a time slot
        if (array_key_exists('date', $data) && $data['date'] === null) {
            $data['start_time'] = null;
        }

        return $data;
    }
}
