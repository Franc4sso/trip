<?php

namespace App\Http\Controllers;

use App\Models\Stay;
use App\Models\Trip;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class StayController extends Controller
{
    public function store(Request $request, Trip $trip): RedirectResponse
    {
        Gate::authorize('update', $trip);

        $trip->stays()->create($this->validated($request, $trip));

        return back();
    }

    public function update(Request $request, Trip $trip, Stay $stay): RedirectResponse
    {
        Gate::authorize('update', $trip);

        $stay->update($this->validated($request, $trip));

        return back();
    }

    public function destroy(Trip $trip, Stay $stay): RedirectResponse
    {
        Gate::authorize('update', $trip);

        $stay->delete();

        return back();
    }

    private function validated(Request $request, Trip $trip): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:200'],
            'city' => ['required', 'string', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
            'check_in' => ['required', 'date', 'after_or_equal:'.$trip->start_date->toDateString()],
            'check_out' => ['required', 'date', 'after:check_in', 'before_or_equal:'.$trip->end_date->toDateString()],
            'confirmed' => ['sometimes', 'boolean'],
            'booking_ref' => ['nullable', 'string', 'max:120'],
            'cost' => ['nullable', 'integer', 'min:0'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);
    }
}
