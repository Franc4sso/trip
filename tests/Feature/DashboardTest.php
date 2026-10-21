<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_are_redirected_to_the_login_page()
    {
        $this->get('/dashboard')->assertRedirect('/login');
    }

    public function test_the_dashboard_sends_users_to_their_trips()
    {
        $this->actingAs(User::factory()->create());

        $this->get('/dashboard')->assertRedirect('/trips');
        $this->get('/')->assertRedirect('/trips');
    }
}
