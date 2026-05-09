import tzLookup from "tz-lookup";
export const resolveTimezoneFromLatLon = (lat, lon) => {
    return tzLookup(lat, lon);
};
