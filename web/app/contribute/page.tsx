import { Turnstile } from "@/components/Turnstile";
/** Correction/submission form (STUB). TODO: insert into public.submissions (role contributor+), verify Turnstile server-side. */
export default function Contribute() {
  return (
    <main>
      <h1>Suggest a correction</h1>
      <form>
        <p><select name="entity" defaultValue="airports"><option>airports</option><option>airlines</option><option value="aircraft_types">aircraft</option></select></p>
        <p><textarea name="payload" placeholder='{"iata": "JFK", "name": "..."}' rows={4} cols={50} /></p>
        <p><input name="source_url" placeholder="Source URL" /></p>
        <Turnstile />
        <button type="submit" disabled>Submit (TODO)</button>
      </form>
    </main>
  );
}
