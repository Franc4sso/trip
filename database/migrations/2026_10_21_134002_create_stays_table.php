<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stays', function (Blueprint $table) {
            $table->id();
            $table->foreignId('trip_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('city');
            $table->string('address')->nullable();
            $table->date('check_in');
            $table->date('check_out');
            $table->boolean('confirmed')->default(false);
            $table->string('booking_ref')->nullable();
            $table->unsignedInteger('cost')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['trip_id', 'check_in']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stays');
    }
};
