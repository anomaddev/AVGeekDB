import { readFileSync } from "node:fs";
import { join } from "node:path";
import { datasetLabel, downloadDataset, downloadFormat, downloadName, formatBytes, sortDownloads, type DownloadFile, type DownloadFormat } from "@/lib/downloads";

type Manifest = { data_version: string; generated_at: string; sample: boolean; files: DownloadFile[] };

const FORMATS: { id: DownloadFormat; title: string; detail: string }[] = [
  { id: "csv", title: "CSV", detail: "One file per table. Booleans are true or false, and lists are comma-separated. The first line records the data version." },
  { id: "json", title: "JSON", detail: "One file per table, shaped as { data_version, sample, data }. Lists stay arrays and booleans stay booleans." },
  { id: "sqlite", title: "SQLite", detail: "One database, avgeekdb.sqlite, with tables airports, airlines, aircraft_types, airline_hubs, and meta (data_version). Booleans are 0 or 1, and lists are comma-separated." },
];

function manifest(): Manifest | null {
  try { return JSON.parse(readFileSync(join(process.cwd(), "public", "downloads", "manifest.json"), "utf8")); } catch { return null; }
}

export const dynamic = "force-static";

export default function Downloads() {
  const m = manifest();
  const grouped = new Map<DownloadFormat, DownloadFile[]>();
  for (const file of m?.files ?? []) {
    const format = downloadFormat(file);
    if (!format) continue;
    grouped.set(format, [...(grouped.get(format) ?? []), file]);
  }
  return (
    <main className="downloads">
      <style>{`
        .downloads table { border-collapse: collapse; }
        .downloads th, .downloads td { text-align: left; padding: 4px 16px 4px 0; white-space: nowrap; }
        .downloads .table-wrap { overflow-x: auto; }
      `}</style>
      <h1>Downloads</h1>
      <p>The same dataset is available as CSV, JSON, and SQLite.</p>
      {!m ? <p>No build yet. Run <code>npm run data:build</code> to generate the files.</p> : (
        <>
          <p>Data version <b>{m.data_version}</b>{m.sample && " (SAMPLE data)"}, built {m.generated_at}.</p>
          {FORMATS.map((format) => {
            const files = sortDownloads(grouped.get(format.id) ?? []);
            if (!files.length) return null;
            return (
              <section key={format.id}>
                <h2>{format.title}</h2>
                <p>{format.detail}</p>
                <div className="table-wrap"><table>
                  <thead><tr><th>Dataset</th><th>File</th><th>Rows</th><th>Size</th><th>SHA-256</th><th></th></tr></thead>
                  <tbody>
                    {files.map((file) => (
                      <tr key={file.path}>
                        <td>{datasetLabel(downloadDataset(file))}</td>
                        <td><code>{file.path}</code></td>
                        <td>{file.rows ?? ""}</td>
                        <td>{formatBytes(file.bytes)}</td>
                        <td><code title={file.sha256}>{file.sha256.slice(0, 12)}…</code></td>
                        <td><a href={`/downloads/${file.path}`} download={downloadName(file.path)}>Download</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </section>
            );
          })}
        </>
      )}
      <p>License: code MIT, data license TBD (see README).</p>
    </main>
  );
}
