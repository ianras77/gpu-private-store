"use client";

import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from "react-leaflet";
import type { GpsPoint } from "@jogmania/shared";

type RunMapMarker = {
  lat: number;
  lon: number;
  label?: string;
  tone?: "cyan" | "magenta" | "acid";
};

const markerTones = {
  cyan: "#3df5ff",
  magenta: "#ff3fa5",
  acid: "#b6ff3d"
};

export function RunMap({ points, markers = [] }: { points: GpsPoint[]; markers?: RunMapMarker[] }) {
  if (!points.length) {
    return <div className="h-64 jm-map-frame bg-jm-surface" />;
  }

  const positions = points.map((p) => [p.lat, p.lon]) as [number, number][];
  const center = positions[Math.floor(positions.length / 2)];

  return (
    <div className="h-64 jm-map-frame">
      <MapContainer center={center} zoom={14} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={positions} pathOptions={{ color: "#3df5ff", weight: 4 }} />
        {markers.map((marker, idx) => (
          <CircleMarker
            key={`${marker.lat}-${marker.lon}-${idx}`}
            center={[marker.lat, marker.lon]}
            radius={6}
            pathOptions={{
              color: markerTones[marker.tone ?? "cyan"],
              fillColor: markerTones[marker.tone ?? "cyan"],
              fillOpacity: 0.8
            }}
          >
            {marker.label && (
              <Tooltip direction="top" offset={[0, -6]} opacity={0.9}>
                {marker.label}
              </Tooltip>
            )}
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
