import { useState, useCallback, useRef, useEffect } from 'react';
import Map3D from './components/Map3D';
import PlaybackControls from './components/PlaybackControls';
import LocationSearch from './components/LocationSearch';
import AddStopForm from './components/AddStopForm';
import StopsList from './components/StopsList';
import { initGoogleMaps } from './utils/maps';
import { formatDuration } from './utils/route';
import type { LatLng, Stop, RouteInfo } from './types';
import { STOP_TYPE_ICONS } from './types';

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

interface RouteData {
  path: google.maps.LatLng[];
  info: RouteInfo;
  stopIndices: number[]; // path indices where each stop is located
}

// Nearest-neighbor ordering
function orderStops(start: LatLng, end: LatLng, stops: Stop[]): Stop[] {
  if (stops.length <= 1) return stops;
  const remaining = [...stops];
  const ordered: Stop[] = [];
  let current = start;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = google.maps.geometry.spherical.computeDistanceBetween(
        new google.maps.LatLng(current.lat, current.lng),
        new google.maps.LatLng(remaining[i].location.lat, remaining[i].location.lng)
      );
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    current = remaining[nearestIdx].location;
    ordered.push(remaining[nearestIdx]);
    remaining.splice(nearestIdx, 1);
  }
  return ordered;
}

// OSRM route
async function fetchOSRMRoute(points: LatLng[]): Promise<{ path: google.maps.LatLng[]; distanceMeters: number; durationSeconds: number }> {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route found');
  const route = data.routes[0];
  const path = route.geometry.coordinates.map((c: [number, number]) => new google.maps.LatLng(c[1], c[0]));
  return { path, distanceMeters: route.distance, durationSeconds: route.duration };
}

// Find nearest path index for a given location
function findNearestPathIndex(path: google.maps.LatLng[], loc: LatLng): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  const target = new google.maps.LatLng(loc.lat, loc.lng);
  // Sample every 10th point for performance, then refine
  const step = Math.max(1, Math.floor(path.length / 500));
  for (let i = 0; i < path.length; i += step) {
    const d = google.maps.geometry.spherical.computeDistanceBetween(path[i], target);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  // Refine around best
  const lo = Math.max(0, bestIdx - step);
  const hi = Math.min(path.length - 1, bestIdx + step);
  for (let i = lo; i <= hi; i++) {
    const d = google.maps.geometry.spherical.computeDistanceBetween(path[i], target);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}

function App() {
  const [apiReady, setApiReady] = useState(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  // Trip setup
  const [source, setSource] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [returnToStart, setReturnToStart] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);

  // Trip state
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [orderedStops, setOrderedStops] = useState<Stop[]>([]); // final ordered stops for animation
  const [tripStarted, setTripStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // Animation
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(6);
  const [progress, setProgress] = useState(0);
  const [pausedAtStop, setPausedAtStop] = useState<number | null>(null); // index in orderedStops
  const [nearPOI, setNearPOI] = useState(false);

  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const initRef = useRef(false);
  const passedStopsRef = useRef<Set<number>>(new Set());

  // Init Google Maps
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    (async () => {
      try {
        await initGoogleMaps(GOOGLE_API_KEY);
        await new Promise((r) => setTimeout(r, 100));
        const mapDiv = document.getElementById('google-map');
        if (mapDiv) {
          const newMap = new google.maps.Map(mapDiv, {
            center: { lat: 20.5937, lng: 78.9629 },
            zoom: 5, tilt: 0, mapTypeId: 'roadmap',
            gestureHandling: 'greedy',
            mapId: '60cf99602c94e2581fc95a01',
          });
          setMap(newMap);
        }
        setApiReady(true);
      } catch (err) { console.error('Failed to init:', err); }
    })();
  }, []);

  // Add / remove stops
  const handleAddStop = useCallback((stop: Stop) => {
    setStops((prev) => [...prev, stop]);
  }, []);

  const handleRemoveStop = useCallback((id: string) => {
    setStops((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // START TRIP — build route with all stops
  const handleStartTrip = useCallback(async () => {
    if (!source || !destination || !map) return;

    setIsLoading(true);
    setLoadingMessage('Planning your route...');
    setTripStarted(false);

    try {
      const onTheWay = stops.filter((s) => s.when === 'on_the_way');
      const whileReturning = stops.filter((s) => s.when === 'while_returning');

      const orderedOnTheWay = orderStops(source, destination, onTheWay);
      const orderedReturning = returnToStart
        ? orderStops(destination, source, whileReturning)
        : [];

      const allOrdered = [...orderedOnTheWay, ...orderedReturning];
      setOrderedStops(allOrdered);

      // Build waypoints
      const waypoints: LatLng[] = [source];
      orderedOnTheWay.forEach((s) => waypoints.push(s.location));
      waypoints.push(destination);
      orderedReturning.forEach((s) => waypoints.push(s.location));
      if (returnToStart) waypoints.push(source);

      const { path, distanceMeters, durationSeconds } = await fetchOSRMRoute(waypoints);

      const distKm = (distanceMeters / 1000).toFixed(1);
      const hrs = Math.floor(durationSeconds / 3600);
      const mins = Math.floor((durationSeconds % 3600) / 60);

      // Find path indices for each stop
      const stopIndices = allOrdered.map((s) => findNearestPathIndex(path, s.location));

      setRouteData({
        path,
        info: {
          distance: `${distKm} km`,
          duration: `${hrs}h ${mins}m`,
          durationValue: durationSeconds,
        },
        stopIndices,
      });

      setProgress(0);
      setIsPlaying(true);
      setTripStarted(true);
      setPausedAtStop(null);
      passedStopsRef.current = new Set();
    } catch (err) {
      console.error('Route error:', err);
      alert('Failed to calculate route. Please try again.');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [source, destination, stops, returnToStart, map]);

  // Continue after pause
  const handleContinue = useCallback(() => {
    setPausedAtStop(null);
    setIsPlaying(true);
  }, []);

  // Animation loop — pauses at stops
  useEffect(() => {
    if (!isPlaying || !routeData || pausedAtStop !== null) return;

    const path = routeData.path;
    const SPEED_MPS = 100; // 100 meters per second at 1x speed

    // Compute total route distance in meters
    let totalDistM = 0;
    for (let i = 1; i < path.length; i++) {
      totalDistM += google.maps.geometry.spherical.computeDistanceBetween(path[i - 1], path[i]);
    }
    // Total animation duration = distance / speed
    const totalAnimDuration = totalDistM / SPEED_MPS;

    const animate = (time: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const delta = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      setProgress((prev) => {
        const idx = Math.min(Math.floor(prev * path.length), path.length - 1);

        // Check if we've reached any stop
        for (let si = 0; si < routeData.stopIndices.length; si++) {
          const stopIdx = routeData.stopIndices[si];
          if (!passedStopsRef.current.has(si) && idx >= stopIdx - 5) {
            passedStopsRef.current.add(si);
            setPausedAtStop(si);
            setIsPlaying(false);
            return stopIdx / path.length;
          }
        }

        // Slow near stops
        let minDist = Infinity;
        const carPos = path[idx];
        if (carPos) {
          for (const si of routeData.stopIndices) {
            const stopPos = path[Math.min(si, path.length - 1)];
            if (stopPos) {
              const d = google.maps.geometry.spherical.computeDistanceBetween(carPos, stopPos);
              if (d < minDist) minDist = d;
            }
          }
        }

        const SLOW_RADIUS = 5000; // 5km slow zone
        const isNear = minDist < SLOW_RADIUS;
        setNearPOI(isNear);
        const slowFactor = isNear ? 0.3 + 0.7 * (minDist / SLOW_RADIUS) : 1.0;

        const next = prev + (delta * playbackSpeed * slowFactor) / totalAnimDuration;
        if (next >= 1) { setIsPlaying(false); return 1; }
        return next;
      });

      animFrameRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = 0;
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, playbackSpeed, routeData, pausedAtStop]);

  const handlePlayPause = useCallback(() => {
    if (pausedAtStop !== null) return; // Use Continue button instead
    if (progress >= 1) { setProgress(0); passedStopsRef.current = new Set(); setIsPlaying(true); }
    else setIsPlaying((prev) => !prev);
  }, [progress, pausedAtStop]);

  const handleSeek = useCallback((p: number) => {
    setProgress(p);
    setIsPlaying(false);
  }, []);

  const handleSourceChange = useCallback((name: string, location: LatLng) => { setSource(location); }, []);
  const handleDestChange = useCallback((name: string, location: LatLng) => { setDestination(location); }, []);

  const canStartTrip = !!source && !!destination && !isLoading;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Road Trip Planner</h1>
          <p>Plan your perfect journey with 3D visualization</p>
        </div>

        <div className="sidebar-content">
          {!apiReady ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div className="loading-spinner" style={{ margin: '0 auto' }} />
              <div className="loading-text">Loading Google Maps...</div>
            </div>
          ) : !tripStarted ? (
            /* ── TRIP SETUP PHASE ── */
            <>
              {/* 1. Start & Destination */}
              <div className="location-section">
                <LocationSearch label="Start Location" variant="start" value="" onChange={handleSourceChange} apiReady={apiReady} />
                <LocationSearch label="Destination" variant="end" value="" onChange={handleDestChange} apiReady={apiReady} />
              </div>

              {/* 2. Return to Start */}
              <label className="return-checkbox">
                <input
                  type="checkbox"
                  checked={returnToStart}
                  onChange={(e) => setReturnToStart(e.target.checked)}
                />
                <span>Return to Start</span>
              </label>

              {/* 3. Add Stops */}
              <AddStopForm apiReady={apiReady} returnToStart={returnToStart} onAdd={handleAddStop} />

              {/* 4. Stops List */}
              <StopsList stops={stops} onRemove={handleRemoveStop} returnToStart={returnToStart} />

              {/* 5. Loading */}
              {isLoading && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div className="loading-spinner" style={{ margin: '0 auto' }} />
                  <div className="loading-text">{loadingMessage}</div>
                </div>
              )}

              {/* 6. Start Trip Button */}
              <button className="start-trip-btn" onClick={handleStartTrip} disabled={!canStartTrip}>
                {stops.length > 0
                  ? `Start Trip with ${stops.length} Stop${stops.length > 1 ? 's' : ''}`
                  : 'Start Trip'}
              </button>
            </>
          ) : (
            /* ── TRIP ANIMATION PHASE ── */
            <>
              {routeData && (
                <div className="route-info">
                  <div className="route-stat"><div className="value">{routeData.info.distance}</div><div className="label">Distance</div></div>
                  <div className="route-stat"><div className="value">{routeData.info.duration}</div><div className="label">Duration</div></div>
                  <div className="route-stat"><div className="value">{orderedStops.length}</div><div className="label">Stops</div></div>
                </div>
              )}

              {routeData && (
                <div className="trip-progress">
                  <div className="trip-progress-bar">
                    <div className="trip-progress-fill" style={{ width: `${progress * 100}%` }} />
                  </div>
                  <span className="trip-progress-text">
                    {formatDuration(routeData.info.durationValue * progress)} / {routeData.info.duration}
                  </span>
                </div>
              )}

              {/* Paused at stop */}
              {pausedAtStop !== null && orderedStops[pausedAtStop] && (
                <div className="stop-pause-card">
                  <div className="stop-pause-icon">{STOP_TYPE_ICONS[orderedStops[pausedAtStop].stopType]}</div>
                  <div className="stop-pause-info">
                    <div className="stop-pause-label">Arrived at Stop {pausedAtStop + 1}</div>
                    <div className="stop-pause-name">{orderedStops[pausedAtStop].name}</div>
                    <div className="stop-pause-type">{orderedStops[pausedAtStop].stopType.replace('_', ' ')}</div>
                  </div>
                  <button className="continue-btn" onClick={handleContinue}>
                    Continue ▶
                  </button>
                </div>
              )}

              {/* Stops timeline */}
              <div className="stops-timeline">
                {orderedStops.map((stop, i) => {
                  const passed = passedStopsRef.current.has(i);
                  const current = pausedAtStop === i;
                  return (
                    <div key={stop.id} className={`timeline-stop ${passed ? 'passed' : ''} ${current ? 'current' : ''}`}>
                      <div className="timeline-dot">{i + 1}</div>
                      <div className="timeline-info">
                        <span className="timeline-icon">{STOP_TYPE_ICONS[stop.stopType]}</span>
                        {stop.name}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reset */}
              <button className="reset-btn" onClick={() => { setTripStarted(false); setRouteData(null); setProgress(0); setIsPlaying(false); setPausedAtStop(null); }}>
                Plan New Trip
              </button>
            </>
          )}
        </div>
      </aside>

      <div className="map-container">
        <Map3D
          map={map}
          source={source}
          destination={destination}
          routePath={routeData?.path || null}
          stops={orderedStops}
          progress={progress}
          isPlaying={isPlaying}
          nearPOI={nearPOI}
        />
        {routeData && pausedAtStop === null && (
          <PlaybackControls
            isPlaying={isPlaying}
            progress={progress}
            speed={playbackSpeed}
            totalDuration={routeData.info.durationValue}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            onSpeedChange={setPlaybackSpeed}
          />
        )}
      </div>
    </div>
  );
}

export default App;
