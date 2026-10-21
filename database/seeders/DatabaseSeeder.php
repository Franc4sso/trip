<?php

namespace Database\Seeders;

use App\Enums\TripRole;
use App\Models\Trip;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /** Demo trip that mirrors the mockup. Login: demo@tabi.test / password */
    public function run(): void
    {
        $me = User::factory()->create(['name' => 'Francesco', 'email' => 'demo@tabi.test']);
        $friends = collect(['Ale', 'Sara', 'Davide'])->map(fn ($name) => User::factory()->create([
            'name' => $name,
            'email' => strtolower($name).'@tabi.test',
        ]));

        $trip = Trip::create([
            'name' => 'Giappone',
            'destination' => 'Tokyo, Kyoto, Osaka',
            'start_date' => '2026-11-03',
            'end_date' => '2026-11-17',
            'currency' => 'JPY',
        ]);
        $trip->members()->attach($me, ['role' => TripRole::Owner->value]);
        $friends->each(fn (User $u, int $i) => $trip->members()->attach($u, ['role' => $i === 2 ? TripRole::Viewer->value : TripRole::Editor->value]));

        foreach ([
            ['Hotel Gracery Shinjuku', 'Tokyo', '2026-11-03', '2026-11-06', true],
            ['Ryokan a Higashiyama', 'Kyoto', '2026-11-06', '2026-11-11', true],
            ['Hotel a Namba', 'Osaka', '2026-11-11', '2026-11-16', false],
        ] as [$name, $city, $in, $out, $confirmed]) {
            $trip->stays()->create(compact('name', 'city', 'confirmed') + ['check_in' => $in, 'check_out' => $out]);
        }

        $activities = [
            ['2026-11-03', '15:00', 120, 'transport', 'Arrivo a Narita e transfer', 'Tokyo'],
            ['2026-11-03', '19:30', 90, 'food', 'Ramen a Shinjuku', 'Tokyo'],
            ['2026-11-04', '09:00', 120, 'visit', 'Senso-ji, Asakusa', 'Tokyo'],
            ['2026-11-04', '12:00', 60, 'food', 'Pranzo ad Asakusa', 'Tokyo'],
            ['2026-11-04', '17:00', 120, 'experience', 'teamLab Planets', 'Tokyo', 3800, true, '2026-10-28', true],
            ['2026-11-05', '08:30', 90, 'visit', 'Meiji Jingu', 'Tokyo'],
            ['2026-11-05', '10:00', 150, 'visit', 'Harajuku e Omotesando', 'Tokyo'],
            ['2026-11-05', '13:00', 60, 'food', 'Pranzo', 'Tokyo'],
            ['2026-11-05', '14:00', 210, 'visit', 'Odaiba', 'Tokyo'],
            ['2026-11-05', '18:00', 90, 'experience', 'Shibuya Sky', 'Tokyo', 2500, true, '2026-11-01'],
            ['2026-11-05', '20:00', 120, 'food', 'Izakaya a Shinjuku', 'Tokyo'],
            ['2026-11-06', '08:10', 135, 'transport', 'Shinkansen → Kyoto', 'Kyoto'],
            ['2026-11-06', '10:45', 30, 'transport', 'Deposito bagagli al ryokan', 'Kyoto'],
            ['2026-11-06', '14:00', 120, 'visit', 'Kiyomizu-dera', 'Kyoto', 500],
            ['2026-11-06', '16:30', 90, 'visit', 'Passeggiata a Gion', 'Kyoto'],
            ['2026-11-06', '19:30', 120, 'food', 'Cena kaiseki', 'Kyoto', 9000, true, '2026-10-30'],
            ['2026-11-07', '07:30', 180, 'visit', 'Fushimi Inari', 'Kyoto'],
            ['2026-11-07', '15:00', 90, 'visit', 'Tofuku-ji', 'Kyoto'],
            ['2026-11-08', '09:00', 240, 'visit', 'Arashiyama e bambù', 'Kyoto'],
            ['2026-11-09', '10:00', 180, 'visit', 'Kinkaku-ji', 'Kyoto'],
            ['2026-11-10', '10:00', 180, 'visit', 'Nijo-jo', 'Kyoto'],
            ['2026-11-11', '10:00', 60, 'transport', 'Treno → Osaka', 'Osaka'],
            ['2026-11-11', '18:00', 120, 'food', 'Street food a Dotonbori', 'Osaka'],
            ['2026-11-12', '09:00', 480, 'experience', 'Universal Studios', 'Osaka', 9000, true, '2026-11-05'],
            ['2026-11-15', '11:00', 120, 'visit', 'Castello di Osaka', 'Osaka'],
            ['2026-11-17', '10:00', 180, 'transport', 'Volo di ritorno', 'Osaka'],
            [null, null, 360, 'visit', 'Nara, cervi e Todai-ji', 'Nara'],
            [null, null, 300, 'visit', 'Castello di Himeji', 'Himeji'],
            [null, null, 120, 'experience', 'Onsen', null],
            [null, null, 120, 'experience', 'Ghibli Museum', 'Tokyo', 1000, true, null],
        ];

        foreach ($activities as $row) {
            [$date, $time, $duration, $type, $title, $city] = $row;
            $trip->activities()->create([
                'date' => $date,
                'start_time' => $time,
                'duration_minutes' => $duration,
                'type' => $type,
                'title' => $title,
                'city' => $city,
                'cost' => $row[6] ?? null,
                'booking_required' => $row[7] ?? false,
                'booking_deadline' => $row[8] ?? null,
                'booked' => $row[9] ?? false,
            ]);
        }
    }
}
