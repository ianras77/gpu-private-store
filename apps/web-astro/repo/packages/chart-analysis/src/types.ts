export interface AnalysisBasis {
  chartBasis: string[];
  sourceBasis: string[];
}

export interface MapNode extends AnalysisBasis {
  name: string;
  theme: string;
  gift: string;
  distortion: string;
  practice: string;
  mantra: string;
}

export interface MapPath extends AnalysisBasis {
  from: string;
  to: string;
  tension: string;
  medicine: string;
  practice: string;
}

export interface ChartAnalysis {
  version: "0.1.0";
  correspondences: AnalysisBasis[];
  developmentalTasks: AnalysisBasis[];
  integrationTensions: AnalysisBasis[];
  graceChannels: AnalysisBasis[];
  practiceNeeds: AnalysisBasis[];
  directInspirationStyle: AnalysisBasis;
  allegoryAssignments: Record<string, AnalysisBasis>;
  ageTransitionSignatures: AnalysisBasis[];
  internalMap: {
    root: MapNode;
    bodyTemple: MapNode;
    heartChamber: MapNode;
    voiceAndMind: MapNode;
    crownAndStar: MapNode;
    shadowGate: MapNode;
    serviceGate: MapNode;
    inspirationGate: MapNode;
    paths: MapPath[];
  };
}
