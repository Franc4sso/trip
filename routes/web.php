<?php

use App\Http\Controllers\ActivityController;
use App\Http\Controllers\DayController;
use App\Http\Controllers\MemberController;
use App\Http\Controllers\StayController;
use App\Http\Controllers\TripController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return auth()->check() ? to_route('trips.index') : Inertia::render('welcome');
})->name('home');

Route::middleware(['auth'])->group(function () {
    Route::redirect('dashboard', 'trips')->name('dashboard');

    Route::resource('trips', TripController::class);
    Route::get('join/{token}', [MemberController::class, 'join'])->name('join');

    Route::prefix('trips/{trip}')->name('trips.')->scopeBindings()->group(function () {
        Route::get('days/{date}', [DayController::class, 'show'])
            ->where('date', '\d{4}-\d{2}-\d{2}')
            ->name('days.show');
        Route::get('balance', [TripController::class, 'balance'])->name('balance');
        Route::get('bookings', [TripController::class, 'bookings'])->name('bookings');

        Route::resource('activities', ActivityController::class)->only(['store', 'update', 'destroy']);
        Route::resource('stays', StayController::class)->only(['store', 'update', 'destroy']);

        Route::get('group', [MemberController::class, 'index'])->name('group');
        Route::patch('members/{user}', [MemberController::class, 'update'])->withoutScopedBindings()->name('members.update');
        Route::delete('members/{user}', [MemberController::class, 'destroy'])->withoutScopedBindings()->name('members.destroy');
        Route::post('invite', [MemberController::class, 'regenerateInvite'])->name('invite.regenerate');
    });
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
