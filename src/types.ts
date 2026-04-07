export interface LatLng {
  lat: number;
  lng: number;
}

export interface Stop {
  id: string;
  name: string;
  location: LatLng;
  stopType: StopType;
  when: StopWhen;
}

export type StopType = 'break' | 'meal' | 'sight_seeing' | 'hotel' | 'mall' | 'other';
export type StopWhen = 'on_the_way' | 'while_returning';

export interface RouteInfo {
  distance: string;
  duration: string;
  durationValue: number; // seconds
}

export const STOP_TYPE_LABELS: Record<StopType, string> = {
  break: 'Break',
  meal: 'Meal',
  sight_seeing: 'Sight Seeing',
  hotel: 'Hotel',
  mall: 'Mall',
  other: 'Other',
};

export const STOP_TYPE_ICONS: Record<StopType, string> = {
  break: '☕',
  meal: '🍽️',
  sight_seeing: '📸',
  hotel: '🏨',
  mall: '🛍️',
  other: '📍',
};

export const STOP_WHEN_LABELS: Record<StopWhen, string> = {
  on_the_way: 'On the way',
  while_returning: 'While returning',
};
