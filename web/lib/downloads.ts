export type DownloadFormat = "csv" | "json" | "sqlite";

export interface DownloadFile {
  path: string;
  bytes: number;
  sha256: string;
  format?: string;
  dataset?: string;
  rows?: number;
}

const DATASET_ORDER = ["airports", "airlines", "aircraft_types", "airline_hubs", "avgeekdb"];

export const DATASET_LABELS: Record<string, string> = {
  airports: "Airports",
  airlines: "Airlines",
  aircraft_types: "Aircraft types",
  airline_hubs: "Airline hubs",
  avgeekdb: "All tables",
};

export function downloadFormat(file: { path: string; format?: string }): DownloadFormat | null {
  if (file.format === "csv" || file.format === "json" || file.format === "sqlite") return file.format;
  if (file.path.endsWith(".csv")) return "csv";
  if (file.path.endsWith(".sqlite")) return "sqlite";
  if (file.path.endsWith(".json") && !file.path.endsWith("manifest.json")) return "json";
  return null;
}

export function downloadDataset(file: { path: string; dataset?: string }): string {
  if (file.dataset) return file.dataset;
  const base = file.path.split("/").pop() ?? file.path;
  return base.replace(/\.(csv|json|sqlite)$/, "");
}

export function datasetLabel(dataset: string): string {
  return DATASET_LABELS[dataset] ?? dataset;
}

export function sortDownloads<T extends { path: string; dataset?: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => {
    const ai = DATASET_ORDER.indexOf(downloadDataset(a));
    const bi = DATASET_ORDER.indexOf(downloadDataset(b));
    return (ai === -1 ? DATASET_ORDER.length : ai) - (bi === -1 ? DATASET_ORDER.length : bi) || a.path.localeCompare(b.path);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb >= 10 ? Math.round(kb) : Math.round(kb * 10) / 10} KB`;
  const mb = kb / 1024;
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

export function downloadName(path: string): string {
  return path.split("/").pop() ?? path;
}
