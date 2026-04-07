import { useState, useRef, useCallback } from 'react';
import type { LatLng } from '../types';

interface Suggestion {
  text: string;
  placeId: string;
}

interface Props {
  label: string;
  variant: 'start' | 'end';
  value: string;
  onChange: (name: string, location: LatLng) => void;
  apiReady: boolean;
}

export default function LocationSearch({ label, variant, value, onChange, apiReady }: Props) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (val.length < 2 || !apiReady) {
        setSuggestions([]);
        setShowDropdown(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        try {
          const response = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: val,
          });

          const items: Suggestion[] = (response.suggestions || [])
            .filter((s: google.maps.places.AutocompleteSuggestion) => s.placePrediction)
            .map((s: google.maps.places.AutocompleteSuggestion) => ({
              text: s.placePrediction!.text.toString(),
              placeId: s.placePrediction!.placeId,
            }));

          setSuggestions(items);
          setShowDropdown(items.length > 0);
        } catch (err) {
          console.warn('Autocomplete error:', err);
          setSuggestions([]);
          setShowDropdown(false);
        }
      }, 300);
    },
    [apiReady]
  );

  const handleSelect = useCallback(
    async (item: Suggestion) => {
      setQuery(item.text);
      setShowDropdown(false);
      setSuggestions([]);

      try {
        const place = new google.maps.places.Place({ id: item.placeId });
        await place.fetchFields({ fields: ['displayName', 'location'] });

        if (place.location) {
          onChange(item.text, {
            lat: place.location.lat(),
            lng: place.location.lng(),
          });
        }
      } catch (err) {
        console.error('Place details error:', err);
      }
    },
    [onChange]
  );

  return (
    <div className="location-group">
      <label>{label}</label>
      <span className={`location-dot ${variant}`} />
      <input
        className="location-input"
        type="text"
        placeholder={variant === 'start' ? 'Enter starting point...' : 'Enter destination...'}
        value={query}
        onChange={handleInput}
        onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        disabled={!apiReady}
      />
      {showDropdown && (
        <div className="autocomplete-dropdown">
          {suggestions.map((s) => (
            <div
              key={s.placeId}
              className="autocomplete-item"
              onMouseDown={() => handleSelect(s)}
            >
              {s.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
