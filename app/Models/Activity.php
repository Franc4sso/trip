<?php

namespace App\Models;

use App\Enums\ActivityType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Activity extends Model
{
    /** @use HasFactory<\Database\Factories\ActivityFactory> */
    use HasFactory;

    protected $fillable = [
        'date',
        'start_time',
        'duration_minutes',
        'type',
        'title',
        'location',
        'city',
        'notes',
        'cost',
        'booking_required',
        'booking_deadline',
        'booked',
        'booking_url',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'immutable_date',
            'booking_deadline' => 'immutable_date',
            'type' => ActivityType::class,
            'booking_required' => 'boolean',
            'booked' => 'boolean',
            'duration_minutes' => 'integer',
            'cost' => 'integer',
        ];
    }

    public function trip(): BelongsTo
    {
        return $this->belongsTo(Trip::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Minutes from midnight, or null when the activity has no time. */
    public function startMinute(): ?int
    {
        if ($this->start_time === null) {
            return null;
        }

        [$h, $m] = array_map('intval', explode(':', $this->start_time));

        return $h * 60 + $m;
    }

    public function endMinute(): ?int
    {
        $start = $this->startMinute();

        return $start === null ? null : $start + ($this->duration_minutes ?? 60);
    }
}
