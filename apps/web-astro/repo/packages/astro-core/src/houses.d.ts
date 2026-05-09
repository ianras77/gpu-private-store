import type { HouseInfo, HouseSystem } from "./types";
export declare const computeWholeSignHouses: (ascendant: number) => HouseInfo;
export declare const computePlacidusHouses: (ascendant: number, midheaven: number) => HouseInfo;
export declare const computeHouses: (system: HouseSystem, ascendant: number, midheaven: number) => HouseInfo;
export declare const houseForDegree: (deg: number, cusps: number[]) => number;
//# sourceMappingURL=houses.d.ts.map