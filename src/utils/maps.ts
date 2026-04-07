let mapsLoaded = false;

export async function initGoogleMaps(apiKey: string): Promise<void> {
  if (mapsLoaded) return;

  await new Promise<void>((resolve, reject) => {
    if (window.google?.maps) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Maps script'));
    document.head.appendChild(script);
  });

  await google.maps.importLibrary('places');
  await google.maps.importLibrary('geometry');

  mapsLoaded = true;
}

export function isLoaded(): boolean {
  return mapsLoaded;
}
