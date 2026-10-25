/** Browser-safe bootstrap only; no server configuration or controls.
 * 서버 설정·제어를 제외한 브라우저 전용 초기 자료입니다. */
export interface ClientLocation {
  latitude: number;
  longitude: number;
}

export interface ClientPreset {
  origin: ClientLocation;
  destination: ClientLocation;
}

export interface ClientBootstrap {
  schema_version: "0.1" | "public-route-0.1";
  graph_id: string;
  source_class: "SYNTHETIC" | "PUBLIC_AGENCY";
  clock_basis: "SIMULATION_EVENT_TIME" | "WALL_CLOCK_UTC";
  bounds: [number, number, number, number];
  roads: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      properties: { name: string };
      geometry: { type: "LineString"; coordinates: number[][] };
    }>;
  };
  presets: { long: ClientPreset; short: ClientPreset };
  attribution: { text: string; url: string };
}
