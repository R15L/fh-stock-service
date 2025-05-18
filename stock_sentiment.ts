import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.42.5";
import { SP500_COMPANIES } from "./sp500.ts";

export interface StockSentiment {
  symbol: string;
  name: string;
  logo: string; // company logo URL
  current_price: number; // current price
  high: number;          // high
  low: number;           // low
  open: number;          // open
  previous_close: number;// previous close
  last_retrieved: string; // ISO timestamp
  // Optional fields for future use:
  volume?: number;
  marketCap?: number;
  earnings_date?: string;
  sentiment?: {
    positive: number;
    negative: number;
    neutral: number;
  };
  sector?: string;
  market_cap?: number;
  // Add more fields as needed
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_KEY");
const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !FINNHUB_API_KEY) {
  throw new Error("Missing required environment variables.");
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export async function fetchQuote(symbol: string, retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (!data || typeof data.c !== "number") throw new Error("Invalid Finnhub response");
      return data;
    }
    if (attempt < retries) {
      console.warn(`Retrying ${symbol} (attempt ${attempt}) after error: ${res.status}`);
      await new Promise(r => setTimeout(r, delay * attempt)); // Exponential backoff
    } else {
      throw new Error(`Finnhub error: ${res.status}`);
    }
  }
}

export async function fetchLogo(symbol: string): Promise<string> {
  const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return "";
  const data = await res.json();
  return data.logo || "";
}

export async function fetchProfile(symbol: string): Promise<{ sector?: string; market_cap?: number }> {
  const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[fetchProfile] Finnhub profile fetch failed for ${symbol}:`, res.status, res.statusText);
    return {};
  }
  const data = await res.json();
  console.log(`[fetchProfile] Finnhub response for ${symbol}:`, data);
  return {
    sector: data.sector || data.finnhubIndustry,
    market_cap: data.marketCapitalization,
  };
}

export async function fetchEarningsDate(symbol: string): Promise<string | undefined> {
  const today = new Date().toISOString().slice(0, 10);
  const sixMonthsLater = new Date(Date.now() + 15552000000).toISOString().slice(0, 10); // ~180 days
  const url = `https://finnhub.io/api/v1/calendar/earnings?symbol=${encodeURIComponent(symbol)}&from=${today}&to=${sixMonthsLater}&token=${FINNHUB_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[fetchEarningsDate] Finnhub earnings fetch failed for ${symbol}:`, res.status, res.statusText);
    return undefined;
  }
  const data = await res.json();
  if (data.earningsCalendar && data.earningsCalendar.length > 0) {
    // Find the first event with a date >= today
    const next = data.earningsCalendar.find((e: any) => e.date >= today);
    return next?.date;
  }
  return undefined;
}

export async function upsertStockSentiment(data: StockSentiment) {
  const { error } = await supabase.from("stock_sentiment").upsert(data);
  if (error) throw error;
}

export function shuffleArray(array: any[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export async function refreshAllStocks({ onProgress, companies } = {}) {
  let toProcess = companies || shuffleArray([...SP500_COMPANIES]);
  let failedSymbols = [];
  let round = 1;
  const MAX_TIME_MS = 60 * 60 * 1000; // 1 hour
  const startTime = Date.now();
  do {
    console.log(`\n=== Batch round ${round} ===`);
    failedSymbols = [];
    // Process one symbol per second, randomized order
    for (let i = 0; i < toProcess.length; i++) {
      const company = toProcess[i];
      try {
        const quote = await fetchQuote(company.symbol);
        const logo = await fetchLogo(company.symbol);
        const profile = await fetchProfile(company.symbol);
        const now = new Date().toISOString();
        const earnings_date = await fetchEarningsDate(company.symbol);
        const sentiment = {
          symbol: company.symbol,
          name: company.name,
          current_price: quote.c,
          high: quote.h,
          low: quote.l,
          open: quote.o,
          previous_close: quote.pc,
          last_retrieved: now,
          logo,
          earnings_date,
          sector: profile.sector,
          market_cap: profile.market_cap,
        };
        await upsertStockSentiment(sentiment);
        if (onProgress) onProgress(company.symbol, "success");
      } catch (e) {
        failedSymbols.push(company.symbol);
        if (onProgress) onProgress(company.symbol, "error", e);
      }
      // Wait 1 second between each symbol to respect Finnhub rate limits
      if (i < toProcess.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (failedSymbols.length > 0) {
      console.log(`\nFailed symbols after round ${round}:`, failedSymbols.join(", "));
      if (Date.now() - startTime > MAX_TIME_MS) {
        console.warn("\nHard stop: 1 hour elapsed. Some symbols may not have succeeded.");
        break;
      }
      console.log("Waiting 60 seconds before retrying failed symbols...");
      await new Promise((r) => setTimeout(r, 60000));
      toProcess = SP500_COMPANIES.filter(c => failedSymbols.includes(c.symbol));
      toProcess = shuffleArray([...toProcess]);
    } else {
      console.log("All symbols upserted successfully!");
    }
    round++;
  } while (failedSymbols.length > 0);
  const elapsed = ((Date.now() - startTime) / 60000).toFixed(2);
  console.log(`\nBatch process finished in ${elapsed} minutes.`);
  if (failedSymbols.length > 0) {
    console.log("\nFinal failed symbols after hard stop:", failedSymbols.join(", "));
  }
  return failedSymbols;
} 