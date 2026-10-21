<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Stay extends Model
{
    /** @use HasFactory<\Database\Factories\StayFactory> */
    use HasFactory;

    protected $fillable = [
        'name',
        'city',
        'address',
        'check_in',
        'check_out',
        'confirmed',
        'booking_ref',
        'cost',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'check_in' => 'immutable_date',
            'check_out' => 'immutable_date',
            'confirmed' => 'boolean',
            'cost' => 'integer',
        ];
    }

    public function trip(): BelongsTo
    {
        return $this->belongsTo(Trip::class);
    }

    /** True when the night starting on $date is spent here. */
    public function coversNight(CarbonInterface $date): bool
    {
        return $date->greaterThanOrEqualTo($this->check_in) && $date->lessThan($this->check_out);
    }

    public function nights(): int
    {
        return (int) $this->check_in->diffInDays($this->check_out);
    }
}
