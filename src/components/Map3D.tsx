import { useEffect, useRef, useState } from 'react';
import type { Stop, LatLng } from '../types';
import { STOP_TYPE_ICONS } from '../types';

interface Props {
  map: google.maps.Map | null;
  source: LatLng | null;
  destination: LatLng | null;
  routePath: google.maps.LatLng[] | null;
  stops: Stop[];
  progress: number;
  isPlaying: boolean;
  nearPOI: boolean;
}

export default function Map3D({ map, source, destination, routePath, stops, progress, isPlaying, nearPOI }: Props) {
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const glowPolylineRef = useRef<google.maps.Polyline | null>(null);
  const carMarkerRef = useRef<google.maps.Marker | null>(null);
  const stopMarkersRef = useRef<google.maps.Marker[]>([]);
  const startMarkerRef = useRef<google.maps.Marker | null>(null);
  const endMarkerRef = useRef<google.maps.Marker | null>(null);

  // Draw route polyline
  useEffect(() => {
    if (!map) return;
    polylineRef.current?.setMap(null);
    glowPolylineRef.current?.setMap(null);
    if (!routePath || routePath.length === 0) return;

    glowPolylineRef.current = new google.maps.Polyline({ path: routePath, strokeColor: '#4285F4', strokeOpacity: 0.3, strokeWeight: 14, map });
    polylineRef.current = new google.maps.Polyline({ path: routePath, strokeColor: '#4285F4', strokeOpacity: 1, strokeWeight: 6, map });

    const bounds = new google.maps.LatLngBounds();
    routePath.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 80);
  }, [map, routePath]);

  // Start/End markers
  useEffect(() => {
    if (!map) return;
    startMarkerRef.current?.setMap(null);
    endMarkerRef.current?.setMap(null);
    if (source) {
      startMarkerRef.current = new google.maps.Marker({
        position: source, map,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#34A853', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
        zIndex: 10,
      });
    }
    if (destination) {
      endMarkerRef.current = new google.maps.Marker({
        position: destination, map,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#EA4335', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
        zIndex: 10,
      });
    }
  }, [map, source, destination]);

  // Stop markers
  useEffect(() => {
    if (!map) return;
    stopMarkersRef.current.forEach((m) => m.setMap(null));
    stopMarkersRef.current = [];
    stops.forEach((stop, i) => {
      const marker = new google.maps.Marker({
        position: stop.location, map,
        title: `${i + 1}. ${stop.name}`,
        label: { text: `${STOP_TYPE_ICONS[stop.stopType]} ${i + 1}`, fontSize: '14px', fontWeight: 'bold' },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
        zIndex: 20,
      });
      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="color:#333;font-size:13px;padding:4px;"><strong>Stop ${i + 1}: ${stop.name}</strong><br/>${STOP_TYPE_ICONS[stop.stopType]} ${stop.stopType.replace('_', ' ')}</div>`,
      });
      marker.addListener('click', () => infoWindow.open(map, marker));
      stopMarkersRef.current.push(marker);
    });
  }, [map, stops]);

  // Car animation — Google Maps navigation style camera
  useEffect(() => {
    if (!map || !routePath || routePath.length === 0) return;

    const totalPoints = routePath.length;
    const idx = Math.min(Math.floor(progress * totalPoints), totalPoints - 1);
    const pos = routePath[idx];
    if (!pos) return;

    const lookAheadIdx = Math.min(idx + Math.max(5, Math.floor(totalPoints * 0.002)), totalPoints - 1);
    const heading = google.maps.geometry.spherical.computeHeading(pos, routePath[lookAheadIdx]);

    // Car marker
    if (!carMarkerRef.current) {
      carMarkerRef.current = new google.maps.Marker({
        position: pos, map,
        icon: { path: 'M -8,-4 L 8,-4 L 8,4 L -8,4 Z', scale: 1, fillColor: 'transparent', fillOpacity: 0, strokeWeight: 0, rotation: heading, anchor: new google.maps.Point(0, 0) },
        label: { text: '🚗', fontSize: '32px' }, zIndex: 100,
      });
    } else {
      carMarkerRef.current.setPosition(pos);
      const icon = carMarkerRef.current.getIcon() as google.maps.Symbol;
      if (icon) { icon.rotation = heading; carMarkerRef.current.setIcon(icon); }
    }

    // Navigation-style camera: tilted, heading-aligned, street-level zoom
    if (isPlaying && progress > 0) {
      const cameraPos = google.maps.geometry.spherical.computeOffset(pos, 150, heading + 180);
      map.moveCamera({
        center: cameraPos,
        zoom: nearPOI ? 18 : 17,
        tilt: 67.5,  // Max tilt for 3D buildings
        heading,
      });
    }
  }, [map, routePath, progress, isPlaying, nearPOI]);

  useEffect(() => {
    if (!routePath && carMarkerRef.current) {
      carMarkerRef.current.setMap(null);
      carMarkerRef.current = null;
    }
  }, [routePath]);

  return <div id="google-map" style={{ width: '100%', height: '100%' }} />;
}
