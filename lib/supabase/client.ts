"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supports both the legacy `*_ANON_KEY` name and the newer `*_PUBLISHABLE_KEY` shape
// (sb_publishable_...). Either works as a public/anon client key.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase env vars not configured");
  }
  client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
  return client;
}
