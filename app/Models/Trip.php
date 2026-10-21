<?php

namespace App\Models;

use App\Enums\TripRole;
use Carbon\CarbonImmutable;
use Carbon\CarbonPeriod;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Trip extends Model
{
    /** @use HasFactory<\Database\Factories\TripFactory> */
    use HasFactory;

    protected $fillable = [
        'name',
        'destination',
        'start_date',
        'end_date',
        'color',
        'currency',
    ];

    protected $hidden = ['invite_token'];

    protected static function booted(): void
    {
        static::creating(function (Trip $trip) {
            $trip->invite_token ??= Str::random(32);
        });
    }

    protected function casts(): array
    {
        return [
            'start_date' => 'immutable_date',
            'end_date' => 'immutable_date',
        ];
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class)->withPivot('role')->withTimestamps();
    }

    public function activities(): HasMany
    {
        return $this->hasMany(Activity::class);
    }

    public function stays(): HasMany
    {
        return $this->hasMany(Stay::class);
    }

    public function roleOf(User $user): ?TripRole
    {
        $member = $this->members->firstWhere('id', $user->id);

        return $member ? TripRole::from($member->pivot->role) : null;
    }

    /**
     * @return list<CarbonImmutable>
     */
    public function days(): array
    {
        return array_map(
            fn ($day) => CarbonImmutable::parse($day),
            CarbonPeriod::create($this->start_date, $this->end_date)->toArray(),
        );
    }

    public function regenerateInviteToken(): void
    {
        $this->forceFill(['invite_token' => Str::random(32)])->save();
    }
}
