import { PlaceInput } from '@/components/place-input';
import { geocodeAddress, type Coordinates } from '@/lib/places';
import { cn } from '@/lib/utils';
import { Loader2, MapPin, MapPinOff } from 'lucide-react';
import { useState } from 'react';

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

/** Address with map suggestions and free typing; a typed address is looked up on the map too. */
export function AddressField({ id, value, hasPosition, onChange, onPick, city, near }: Props) {
    const [locating, setLocating] = useState(false);
    const [notFound, setNotFound] = useState(false);
    const [approximate, setApproximate] = useState(false);

    // a written address gets its point as well, so every real address ends up on the map
    const locate = async () => {
        const address = value.trim();
        if (hasPosition || address.length < 6 || locating) return;
        setLocating(true);
        setNotFound(false);
        try {
            const found = await geocodeAddress(address, { city, near });
            if (found) {
                setApproximate(found.approximate);
                onPick({ address, city: null, latitude: found.latitude, longitude: found.longitude });
            } else setNotFound(true);
        } catch {
            setNotFound(true);
        } finally {
            setLocating(false);
        }
    };

    return (
        <div onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && locate()}>
            <PlaceInput
                id={id}
                value={value}
                onChange={(address) => {
                    setNotFound(false);
                    setApproximate(false);
                    onChange(address);
                }}
                onSelect={(place) => {
                    setApproximate(false);
                    onPick({
                        address: place.address ?? [place.name, place.detail].filter(Boolean).join(', '),
                        city: place.city,
                        latitude: place.latitude,
                        longitude: place.longitude,
                    });
                }}
                near={near}
                city={city}
                placeholder="Via, numero, città: scrivilo pure a mano"
                maxLength={255}
            />

            {(hasPosition || value.trim()) && (
                <div className="mt-1.5 flex min-h-8 items-center justify-between gap-2">
                    <p className={cn('flex min-w-0 items-center gap-1.5 text-xs', hasPosition ? 'text-leaf' : 'text-mute')}>
                        {locating ? (
                            <>
                                <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
                                Cerco l'indirizzo sulla mappa…
                            </>
                        ) : hasPosition ? (
                            <>
                                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                                {approximate ? 'Sulla mappa: zona della via, non il portone' : 'Sulla mappa'}
                            </>
                        ) : (
                            <>
                                <MapPinOff className="size-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{notFound ? 'Non lo trovo sulla mappa: controlla l’indirizzo' : 'Non ancora sulla mappa'}</span>
                            </>
                        )}
                    </p>
                    {!hasPosition && !locating && value.trim().length >= 6 && (
                        <button type="button" onClick={locate} className="h-8 shrink-0 rounded-[10px] border border-field bg-card px-2.5 text-xs font-bold text-indigo hover:bg-hover">
                            Trova sulla mappa
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
