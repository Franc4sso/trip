<?php

namespace App\Enums;

enum ActivityType: string
{
    case Visit = 'visit';
    case Food = 'food';
    case Transport = 'transport';
    case Experience = 'experience';
    case Shopping = 'shopping';
    case Note = 'note';

    public function label(): string
    {
        return match ($this) {
            self::Visit => 'Visita',
            self::Food => 'Cibo',
            self::Transport => 'Spostamento',
            self::Experience => 'Esperienza',
            self::Shopping => 'Shopping',
            self::Note => 'Nota',
        };
    }
}
