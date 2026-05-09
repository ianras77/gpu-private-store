import tzLookup from "tz-lookup";

export const resolveTimezoneFromLatLon = (lat: number, lon: number): string => {
  return tzLookup(lat, lon);
};
