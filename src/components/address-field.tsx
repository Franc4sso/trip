import { PlaceInput } from '@/components/place-input';
import { type Coordinates } from '@/lib/places';
import { cn } from '@/lib/utils';
import { MapPin, MapPinOff } from 'lucide-react';

export interface AddressPick {
    address: string;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
}

interface Props {
    id: string;
    value: string;
    /** The address has a point on the map (picked, not typed). */
    hasPosition: boolean;
    /** Free typing: the caller keeps the text and drops the old point. */
    onChange: (address: string) => void;
    onPick: (pick: AddressPick) => void;
    city?: string | null;
    near?: Coordinates | null;
}

/** Address with map suggestions and free typing; whether it made it onto the map. */
export function AddressField({ id, value, hasPosition, onChange, onPick, city, near }: Props) {
    return (
        <div>
            <PlaceInput
                id={id}
                value={value}
                onChange={onChange}
                onSelect={(place) =>
                    onPick({
                        address: place.address ?? [place.name, place.detail].filter(Boolean).join(', '),
                        city: place.city,
                        latitude: place.latitude,
                        longitude: place.longitude,
                    })
                }
                near={near}
                city={city}
                placeholder="Via, numero, città: scrivilo pure a mano"
                maxLength={255}
            />

            {(hasPosition || value.trim()) && (
                <p className={cn('mt-1.5 flex min-w-0 items-center gap-1.5 text-xs', hasPosition ? 'text-leaf' : 'text-mute')}>
                    {hasPosition ? (
                        <>
                            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                            Sulla mappa
                        </>
                    ) : (
                        <>
                            <MapPinOff className="size-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">Scritto a mano: non compare sulla mappa</span>
                        </>
                    )}
                </p>
            )}
        </div>
    );
}
