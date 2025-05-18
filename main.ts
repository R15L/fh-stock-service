// deno-lint-ignore-file
// @ts-check
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { refreshAllStocks, fetchQuote, fetchLogo, fetchProfile, fetchEarningsDate, upsertStockSentiment, shuffleArray } from "./stock_sentiment.ts";
import { refreshAllCompanyProfiles } from "./company_profile.ts";
import { SP500_COMPANIES } from "./sp500.ts";

function withCORS(headers: Headers) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return headers;
}

serve(async (req) => {
  const url = new URL(req.url);
  const headers = withCORS(new Headers({ "Content-Type": "application/json" }));

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (url.pathname === "/refresh-quote" && req.method === "GET") {
    const symbol = url.searchParams.get("symbol");
    if (!symbol) {
      return new Response(JSON.stringify({ error: "Missing symbol parameter" }), { status: 400, headers });
    }
    try {
      const data = await fetchQuote(symbol);
      const logo = await fetchLogo(symbol);
      const company = SP500_COMPANIES.find((c) => c.symbol === symbol);
      const now = new Date().toISOString();
      const earnings_date = await fetchEarningsDate(symbol);
      const profile = await fetchProfile(symbol);
      await upsertStockSentiment({
        symbol,
        name: company ? company.name : symbol,
        current_price: data.c,
        high: data.h,
        low: data.l,
        open: data.o,
        previous_close: data.pc,
        last_retrieved: now,
        logo,
        earnings_date,
        sector: profile.sector,
        market_cap: profile.market_cap,
      });
      return new Response(JSON.stringify({
        success: true,
        symbol,
        data: {
          current_price: data.c,
          d: data.d ?? null,
          dp: data.dp ?? null,
          high: data.h,
          low: data.l,
          open: data.o,
          previous_close: data.pc,
          logo,
          earnings_date,
          sector: profile.sector,
          market_cap: profile.market_cap,
        }
      }), { status: 200, headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }

  if (url.pathname === "/refresh-all" && req.method === "POST") {
    refreshAllStocks().then(() => {
      console.log("Batch refresh complete");
    });
    return new Response(JSON.stringify({ started: true }), { status: 202, headers });
  }

  if (url.pathname === "/refresh-all-company-profiles" && req.method === "POST") {
    refreshAllCompanyProfiles().then(() => {
      console.log("Company profile batch refresh complete");
    });
    return new Response(JSON.stringify({ started: true }), { status: 202, headers });
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
}); 