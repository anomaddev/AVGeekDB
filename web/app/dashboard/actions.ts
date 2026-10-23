"use server";
import { revalidatePath } from "next/cache";
import { createServiceClient, generateApiKey, hashApiKey } from "@avgeekdb/api";
import { createClient } from "@/lib/supabase/server";
import { requireAuthUser } from "@/lib/supabase/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function keyName(value: FormDataEntryValue | null): string | { error: string } {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!name) return "default";
  if (name.length > 80) return { error: "Key name must be 80 characters or fewer." };
  return name;
}

export async function createApiKey(formData: FormData): Promise<{ key: string } | { error: string }> {
  const name = keyName(formData.get("name"));
  if (typeof name !== "string") return name;
  try {
    const user = await requireAuthUser();
    const { key, prefix } = generateApiKey();
    const { error } = await createServiceClient().from("api_keys").insert({
      user_id: user.id,
      name,
      prefix,
      key_hash: hashApiKey(key),
    });
    if (error) {
      console.error("api key insert failed", error.code);
      return { error: "Could not create the API key." };
    }
    revalidatePath("/dashboard");
    return { key };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create the API key." };
  }
}

export async function revokeApiKey(id: string): Promise<{ ok: true } | { error: string }> {
  if (!UUID.test(id)) return { error: "Key not found." };
  try {
    await requireAuthUser();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .is("revoked_at", null)
      .select("id");
    if (error) {
      console.error("api key revoke failed", error.code);
      return { error: "Could not revoke the API key." };
    }
    if (!data?.length) return { error: "Key not found." };
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not revoke the API key." };
  }
}
