import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.42.5";
import { SP500_COMPANIES } from "./sp500.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_KEY");
const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !FINNHUB_API_KEY) {
  throw new Error("Missing required environment variables.");
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export async function fetchCompanyProfile(symbol: string) {
  const url = `https://finnhub.io/api/v1/stock/profile?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[fetchCompanyProfile] Finnhub company profile fetch failed for ${symbol}:`, res.status, res.statusText);
    return null;
  }
  const data = await res.json();
  if (!data || Object.keys(data).length === 0) {
    console.warn(`[fetchCompanyProfile] No profile data returned for ${symbol}`);
    return null;
  }
  return data;
}

export async function upsertCompanyProfile(profile: any) {
  // Upsert into company_profile table, using symbol as primary key
  const { error } = await supabase.from("company_profile").upsert(profile, { onConflict: ["symbol"] });
  if (error) throw error;
}

export async function refreshAllCompanyProfiles({ onProgress, companies } = {}) {
  let toProcess = companies || SP500_COMPANIES.slice();
  // Shuffle for rate limit fairness
  for (let i = toProcess.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [toProcess[i], toProcess[j]] = [toProcess[j], toProcess[i]];
  }
  for (const company of toProcess) {
    try {
      const profile = await fetchCompanyProfile(company.symbol);
      if (profile && (profile.symbol || profile.ticker)) {
        // Ensure 'symbol' field exists for upsert
        if (!profile.symbol && profile.ticker) {
          profile.symbol = profile.ticker;
        }
        await upsertCompanyProfile(profile);
        if (onProgress) onProgress(company.symbol, "success");
      } else {
        if (onProgress) onProgress(company.symbol, "error", new Error("No profile data returned"));
      }
    } catch (e) {
      if (onProgress) onProgress(company.symbol, "error", e);
    }
    await new Promise((r) => setTimeout(r, 1000)); // Rate limit
  }
} 