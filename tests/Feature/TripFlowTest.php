<?php

namespace Tests\Feature;

use App\Enums\TripRole;
use App\Models\Activity;
use App\Models\Stay;
use App\Models\Trip;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class TripFlowTest extends TestCase
{
    use RefreshDatabase;

    private function tripOf(User $owner): Trip
    {
        return Trip::factory()->ownedBy($owner)->create(['start_date' => '2026-11-03', 'end_date' => '2026-11-07']);
    }

    private function join(Trip $trip, TripRole $role): User
    {
        $user = User::factory()->create();
        $trip->members()->attach($user, ['role' => $role->value]);

        return $user;
    }

    public function test_creating_a_trip_makes_you_its_owner()
    {
        $user = User::factory()->create();

        $this->actingAs($user)->post('/trips', [
            'name' => 'Giappone',
            'destination' => 'Tokyo, Kyoto, Osaka',
            'start_date' => '2026-11-03',
            'end_date' => '2026-11-17',
        ])->assertRedirect();

        $trip = Trip::sole();
        $this->assertSame(TripRole::Owner, $trip->roleOf($user));
        $this->assertSame('#2F43C9', $trip->color);
    }

    public function test_trips_longer_than_ninety_days_are_rejected()
    {
        $this->actingAs(User::factory()->create())->post('/trips', [
            'name' => 'Giro del mondo',
            'start_date' => '2026-01-01',
            'end_date' => '2026-12-31',
        ])->assertSessionHasErrors('end_date');
    }

    public function test_the_index_lists_only_your_trips()
    {
        $user = User::factory()->create();
        $mine = $this->tripOf($user);
        Trip::factory()->ownedBy(User::factory()->create())->create();

        $this->actingAs($user)->get('/trips')->assertInertia(fn (Assert $page) => $page
            ->component('trips/index')
            ->has('trips', 1)
            ->where('trips.0.id', $mine->id)
            ->has('trips.0.day_loads', 5));
    }

    public function test_strangers_cannot_see_a_trip()
    {
        $trip = $this->tripOf(User::factory()->create());

        $this->actingAs(User::factory()->create())->get("/trips/{$trip->id}")->assertForbidden();
    }

    public function test_the_overview_contains_insights()
    {
        $user = User::factory()->create();
        $trip = $this->tripOf($user);

        $this->actingAs($user)->get("/trips/{$trip->id}")->assertInertia(fn (Assert $page) => $page
            ->component('trips/show')
            ->where('trip.can_edit', true)
            ->has('insights.days', 5)
            ->has('insights.uncovered_nights', 4));
    }

    public function test_the_day_page_shows_its_activities_in_time_order()
    {
        $user = User::factory()->create();
        $trip = $this->tripOf($user);
        Activity::factory()->for($trip)->create(['date' => '2026-11-04', 'start_time' => '14:00', 'title' => 'Dopo']);
        Activity::factory()->for($trip)->create(['date' => '2026-11-04', 'start_time' => null, 'title' => 'Senza orario']);
        Activity::factory()->for($trip)->create(['date' => '2026-11-04', 'start_time' => '09:00', 'title' => 'Prima']);
        Activity::factory()->for($trip)->create(['date' => null, 'title' => 'Idea']);
        Stay::factory()->for($trip)->create(['check_in' => '2026-11-03', 'check_out' => '2026-11-05', 'name' => 'Ryokan']);

        $this->actingAs($user)->get("/trips/{$trip->id}/days/2026-11-04")->assertInertia(fn (Assert $page) => $page
            ->component('trips/day')
            ->where('activities.0.title', 'Prima')
            ->where('activities.1.title', 'Dopo')
            ->where('activities.2.title', 'Senza orario')
            ->where('stay.name', 'Ryokan')
            ->where('ideas.0.title', 'Idea')
            ->where('day.number', 2));
    }

    public function test_days_outside_the_trip_are_not_found()
    {
        $user = User::factory()->create();
        $trip = $this->tripOf($user);

        $this->actingAs($user)->get("/trips/{$trip->id}/days/2026-12-01")->assertNotFound();
    }

    public function test_editors_add_activities_but_viewers_cannot()
    {
        $trip = $this->tripOf(User::factory()->create());
        $payload = ['date' => '2026-11-04', 'start_time' => '10:00', 'type' => 'visit', 'title' => 'Kiyomizu-dera'];

        $this->actingAs($this->join($trip, TripRole::Viewer))->post("/trips/{$trip->id}/activities", $payload)->assertForbidden();

        $editor = $this->join($trip, TripRole::Editor);
        $this->actingAs($editor)->post("/trips/{$trip->id}/activities", $payload)->assertRedirect();

        $activity = Activity::sole();
        $this->assertSame('Kiyomizu-dera', $activity->title);
        $this->assertSame($editor->id, $activity->created_by);
    }

    public function test_activities_must_fall_inside_the_trip()
    {
        $user = User::factory()->create();
        $trip = $this->tripOf($user);

        $this->actingAs($user)->post("/trips/{$trip->id}/activities", [
            'date' => '2026-12-01', 'type' => 'visit', 'title' => 'Fuori',
        ])->assertSessionHasErrors('date');
    }

    public function test_moving_an_activity_to_the_idea_list_clears_its_time()
    {
        $user = User::factory()->create();
        $trip = $this->tripOf($user);
        $activity = Activity::factory()->for($trip)->create(['date' => '2026-11-04', 'start_time' => '10:00']);

        $this->actingAs($user)->patch("/trips/{$trip->id}/activities/{$activity->id}", ['date' => null])->assertRedirect();

        $this->assertNull($activity->fresh()->date);
        $this->assertNull($activity->fresh()->start_time);
    }

    public function test_activities_of_another_trip_cannot_be_touched()
    {
        $user = User::factory()->create();
        $trip = $this->tripOf($user);
        $foreign = Activity::factory()->create();

        $this->actingAs($user)->delete("/trips/{$trip->id}/activities/{$foreign->id}")->assertNotFound();
        $this->assertModelExists($foreign);
    }

    public function test_stays_must_end_after_they_start()
    {
        $user = User::factory()->create();
        $trip = $this->tripOf($user);

        $this->actingAs($user)->post("/trips/{$trip->id}/stays", [
            'name' => 'Hotel', 'city' => 'Tokyo', 'check_in' => '2026-11-05', 'check_out' => '2026-11-05',
        ])->assertSessionHasErrors('check_out');

        $this->actingAs($user)->post("/trips/{$trip->id}/stays", [
            'name' => 'Hotel', 'city' => 'Tokyo', 'check_in' => '2026-11-03', 'check_out' => '2026-11-05',
        ])->assertSessionHasNoErrors();
    }

    public function test_the_invite_link_adds_you_as_editor()
    {
        $owner = User::factory()->create();
        $trip = $this->tripOf($owner);
        $friend = User::factory()->create();

        $this->actingAs($friend)->get("/join/{$trip->invite_token}")->assertRedirect("/trips/{$trip->id}");

        $this->assertSame(TripRole::Editor, $trip->fresh()->roleOf($friend));
    }

    public function test_guests_following_an_invite_are_sent_to_login()
    {
        $trip = $this->tripOf(User::factory()->create());

        $this->get("/join/{$trip->invite_token}")->assertRedirect('/login');
    }

    public function test_regenerating_the_invite_kills_the_old_link()
    {
        $owner = User::factory()->create();
        $trip = $this->tripOf($owner);
        $old = $trip->invite_token;

        $this->actingAs($owner)->post("/trips/{$trip->id}/invite")->assertRedirect();

        $this->actingAs(User::factory()->create())->get("/join/{$old}")->assertNotFound();
    }

    public function test_only_owners_see_the_invite_link_and_change_roles()
    {
        $owner = User::factory()->create();
        $trip = $this->tripOf($owner);
        $editor = $this->join($trip, TripRole::Editor);

        $this->actingAs($editor)->get("/trips/{$trip->id}/group")
            ->assertInertia(fn (Assert $page) => $page->component('trips/group')->where('invite_url', null));
        $this->actingAs($editor)->patch("/trips/{$trip->id}/members/{$owner->id}", ['role' => 'viewer'])->assertForbidden();

        $this->actingAs($owner)->patch("/trips/{$trip->id}/members/{$editor->id}", ['role' => 'viewer'])->assertRedirect();
        $this->assertSame(TripRole::Viewer, $trip->fresh()->roleOf($editor));
    }

    public function test_the_last_owner_cannot_leave()
    {
        $owner = User::factory()->create();
        $trip = $this->tripOf($owner);

        $this->actingAs($owner)->delete("/trips/{$trip->id}/members/{$owner->id}")->assertSessionHasErrors('member');
        $this->assertSame(TripRole::Owner, $trip->fresh()->roleOf($owner));
    }

    public function test_members_can_leave()
    {
        $trip = $this->tripOf(User::factory()->create());
        $editor = $this->join($trip, TripRole::Editor);

        $this->actingAs($editor)->delete("/trips/{$trip->id}/members/{$editor->id}")->assertRedirect('/trips');
        $this->assertNull($trip->fresh()->roleOf($editor));
    }
}
