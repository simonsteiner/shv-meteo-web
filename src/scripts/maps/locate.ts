// The pilot's position, asked for in two places: the header's GPS button
// on the map, and the map itself when another page hands over `?locate`
// (src/scripts/handoff.ts). No made-up position on failure: the caller
// gets null and the map stays as it is, without a pilot marker.

export interface LatLng {
  lat: number;
  lng: number;
}

/** What `locatePilot` needs of `navigator.geolocation`. */
export type Geo = Pick<Geolocation, "getCurrentPosition">;

const OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 6000 };

/** The device's position, or null after logging why not (no geolocation,
 * permission denied, timeout). */
export function locatePilot(
  geo: Geo | undefined = globalThis.navigator?.geolocation,
): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (!geo) {
      console.error("[locate] This browser has no geolocation");
      resolve(null);
      return;
    }
    geo.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        console.error("[locate] Cannot get the position:", err);
        resolve(null);
      },
      OPTIONS,
    );
  });
}
