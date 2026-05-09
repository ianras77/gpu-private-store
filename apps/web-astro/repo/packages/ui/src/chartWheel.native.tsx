import React from "react";
import Svg, { Circle, Line, G, Text as SvgText } from "react-native-svg";
import type { NatalChart } from "@astro/astro-core";

const polarToCartesian = (center: number, radius: number, angle: number) => {
  const rad = ((angle - 90) * Math.PI) / 180;
  return {
    x: center + radius * Math.cos(rad),
    y: center + radius * Math.sin(rad)
  };
};

export const ChartWheel: React.FC<{ chart: NatalChart; size?: number }> = ({
  chart,
  size = 260
}) => {
  const center = size / 2;
  const radius = size / 2 - 16;
  const cusps = chart.houses?.cusps ?? Array.from({ length: 12 }, (_, i) => i * 30);

  return (
    <Svg width={size} height={size}>
      <Circle cx={center} cy={center} r={radius} stroke="#999" strokeWidth={2} fill="none" />
      {cusps.map((deg, index) => {
        const { x, y } = polarToCartesian(center, radius, deg);
        return <Line key={`cusp-${index}`} x1={center} y1={center} x2={x} y2={y} stroke="#999" />;
      })}
      {chart.points
        .filter((point) => point.type === "planet")
        .map((point) => {
          const { x, y } = polarToCartesian(center, radius - 14, point.degree);
          return (
            <G key={point.key}>
              <Circle cx={x} cy={y} r={4} fill="#d4a100" />
              <SvgText x={x + 6} y={y - 4} fontSize={10} fill="#111">
                {point.key.slice(0, 2)}
              </SvgText>
            </G>
          );
        })}
    </Svg>
  );
};
