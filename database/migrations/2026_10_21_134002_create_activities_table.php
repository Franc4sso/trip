<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('trip_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            // null date = idea in the wishlist, not yet placed on a day
            $table->date('date')->nullable();
            $table->time('start_time')->nullable();
            $table->unsignedSmallInteger('duration_minutes')->nullable();
            $table->string('type', 16);
            $table->string('title');
            $table->string('location')->nullable();
            $table->string('city')->nullable();
            $table->text('notes')->nullable();
            $table->unsignedInteger('cost')->nullable();
            $table->boolean('booking_required')->default(false);
            $table->date('booking_deadline')->nullable();
            $table->boolean('booked')->default(false);
            $table->string('booking_url')->nullable();
            $table->timestamps();

            $table->index(['trip_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activities');
    }
};
