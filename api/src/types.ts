export type Entity = "airports" | "airlines" | "aircraft_types";
export const ENTITIES: Entity[] = ["airports", "airlines", "aircraft_types"];
/** Every CSV dataset in data/ (entities + join tables). */
export type Dataset = Entity | "airline_hubs";
export const DATASETS: Dataset[] = [...ENTITIES, "airline_hubs"];

export interface Airport { ident: string; iata: string | null; icao: string | null; name: string; municipality: string | null; country: string; latitude: number; longitude: number; elevation_ft: number | null; type: string;
  continent: string | null; iso_region: string | null; scheduled_service: boolean; gps_code: string | null; local_code: string | null;
  home_link: string | null; wikipedia_link: string | null; keywords: string | null; is_sample: boolean }
export interface Airline { ident: string; name: string; iata: string | null; icao: string | null; callsign: string | null; country: string | null; country_code: string; active: boolean; major: boolean; is_sample: boolean; hubs: string[] }
export interface AircraftType {
  ident: string; icao: string | null; iata: string | null; family: string | null; name: string; short_name: string | null; alternate_names: string[];
  manufacturer: string | null; engine_count: number | null; engine_type: string | null; aircraft_type: string | null; in_production: boolean;
  status: string | null; major: boolean; cargo: boolean; military: boolean; wiki_link: string | null; is_primary: boolean; wake_category: string | null; is_sample: boolean;
}
export type Cell = string | number | boolean | null | Cell[] | { [key: string]: Cell };
export type Row = Record<string, Cell>;
