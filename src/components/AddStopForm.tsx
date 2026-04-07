import { useState, useCallback, useRef } from 'react';
import type { LatLng, StopType, StopWhen, Stop } from '../types';
import { STOP_TYPE_LABELS } from '../types';

interface Props {
  apiReady: boolean;
  returnToStart: boolean;
  onAdd: (stop: Stop) => void;
}

export default function AddStopForm({ apiReady, returnToStart, onAdd }: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<{ text: string; placeId: string }[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ name: string; location: LatLng } | null>(null);
  const [stopType, setStopType] = useState<StopType>('sight_seeing');
  const [when, setWhen] = useState<StopWhen>('on_the_way');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);
      setSelectedLocation(null);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (val.length < 2 || !apiReady) {
        setSuggestions([]);
        setShowDropdown(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        try {
          const response = await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: val });
          const items = (response.suggestions || [])
            .filter((s: google.maps.places.AutocompleteSuggestion) => s.placePrediction)
            .map((s: google.maps.places.AutocompleteSuggestion) => ({
              text: s.placePrediction!.text.toString(),
              placeId: s.placePrediction!.placeId,
            }));
          setSuggestions(items);
          setShowDropdown(items.length > 0);
        } catch {
          setSuggestions([]);
          setShowDropdown(false);
        }
      }, 300);
    },
    [apiReady]
  );

  const handleSelect = useCallback(async (item: { text: string; placeId: string }) => {
    setQuery(item.text);
    setShowDropdown(false);
    setSuggestions([]);

    try {
      const place = new google.maps.places.Place({ id: item.placeId });
      await place.fetchFields({ fields: ['displayName', 'location'] });
      if (place.location) {
        setSelectedLocation({
          name: place.displayName || item.text,
          location: { lat: place.location.lat(), lng: place.location.lng() },
        });
      }
    } catch (err) {
      console.error('Place details error:', err);
    }
  }, []);

  const handleAdd = useCallback(() => {
    if (!selectedLocation) return;

    const stop: Stop = {
      id: `stop-${Date.now()}`,
      name: selectedLocation.name,
      location: selectedLocation.location,
      stopType,
      when: returnToStart ? when : 'on_the_way',
    };

    onAdd(stop);
    setQuery('');
    setSelectedLocation(null);
    setStopType('sight_seeing');
    setWhen('on_the_way');
  }, [selectedLocation, stopType, when, returnToStart, onAdd]);

  return (
    <div className="add-stop-form">
      <div className="add-stop-header">Add a Stop</div>

      {/* Location */}
      <div className="add-stop-field">
        <div className="location-group" style={{ marginBottom: 0 }}>
          <input
            className="location-input"
            style={{ paddingLeft: 12 }}
            type="text"
            placeholder="Search for a place..."
            value={query}
            onChange={handleInput}
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            disabled={!apiReady}
          />
          {showDropdown && (
            <div className="autocomplete-dropdown">
              {suggestions.map((s) => (
                <div key={s.placeId} className="autocomplete-item" onMouseDown={() => handleSelect(s)}>
                  {s.text}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Type + When row */}
      <div className="add-stop-row">
        <div className="add-stop-field" style={{ flex: 1 }}>
          <label className="add-stop-label">Type</label>
          <select
            className="stop-select"
            value={stopType}
            onChange={(e) => setStopType(e.target.value as StopType)}
          >
            {Object.entries(STOP_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {returnToStart && (
          <div className="add-stop-field" style={{ flex: 1 }}>
            <label className="add-stop-label">When</label>
            <select
              className="stop-select"
              value={when}
              onChange={(e) => setWhen(e.target.value as StopWhen)}
            >
              <option value="on_the_way">On the way</option>
              <option value="while_returning">While returning</option>
            </select>
          </div>
        )}
      </div>

      <button
        className="add-stop-btn"
        onClick={handleAdd}
        disabled={!selectedLocation}
      >
        + Add Stop
      </button>
    </div>
  );
}
