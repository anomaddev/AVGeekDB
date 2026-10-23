export type Entity = "airports" | "airlines" | "aircraft_types";
export const ENTITIES: Entity[] = ["airports", "airlines", "aircraft_types"];

export interface Airport { ident: string; iata: string | null; icao: string | null; name: string; city: string | null; country: string; latitude: number; longitude: number; elevation_ft: number | null; type: string; is_sample: boolean }
export interface Airline { iata: string | null; icao: string | null; name: string; callsign: string | null; country: string; hub_icao: string | null; active: boolean; is_sample: boolean }
export interface AircraftType { icao_code: string; iata_code: string | null; manufacturer: string; model: string; engine_type: string | null; engine_count: number | null; wake_category: string | null; is_sample: boolean }
export type Row = Record<string, string | number | boolean | null>;
