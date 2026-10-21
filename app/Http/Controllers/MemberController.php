<?php

namespace App\Http\Controllers;

use App\Enums\TripRole;
use App\Models\Trip;
use App\Models\User;
use App\Support\TripPayload;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class MemberController extends Controller
{
    public function index(Request $request, Trip $trip): Response
    {
        Gate::authorize('view', $trip);

        return Inertia::render('trips/group', [
            'trip' => TripPayload::header($trip, $request->user()),
            'invite_url' => Gate::allows('manage', $trip) ? route('join', $trip->invite_token) : null,
        ]);
    }

    public function update(Request $request, Trip $trip, User $user): RedirectResponse
    {
        Gate::authorize('manage', $trip);
        abort_if($user->is($request->user()), 422, 'Non puoi cambiare il tuo ruolo.');

        $data = $request->validate(['role' => ['required', Rule::enum(TripRole::class)]]);
        $trip->members()->updateExistingPivot($user->id, ['role' => $data['role']]);

        return back();
    }

    public function destroy(Request $request, Trip $trip, User $user): RedirectResponse
    {
        $leaving = $user->is($request->user());
        Gate::authorize($leaving ? 'view' : 'manage', $trip);

        if ($trip->roleOf($user) === TripRole::Owner && $trip->members->where('pivot.role', TripRole::Owner->value)->count() === 1) {
            return back()->withErrors(['member' => 'Il viaggio deve avere almeno un organizzatore.']);
        }

        $trip->members()->detach($user->id);

        return $leaving ? to_route('trips.index') : back();
    }

    public function regenerateInvite(Trip $trip): RedirectResponse
    {
        Gate::authorize('manage', $trip);

        $trip->regenerateInviteToken();

        return back();
    }

    public function join(Request $request, string $token): RedirectResponse
    {
        $trip = Trip::where('invite_token', $token)->firstOrFail();

        if ($trip->roleOf($request->user()) === null) {
            $trip->members()->attach($request->user(), ['role' => TripRole::Editor->value]);
        }

        return to_route('trips.show', $trip);
    }
}
