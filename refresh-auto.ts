import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { refreshAllStocks } from "./stock_overview.ts";
import { refreshAllCompanyProfiles } from "./company_profile.ts";
import { refreshFilingsSentiment } from "./stock_sentiment.ts";
import { SP500_COMPANIES } from "./sp500.ts";

const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY");

async function getMarketStatus(): Promise<boolean> {
  const url = `https://finnhub.io/api/v1/stock/market-status?exchange=US&token=${FINNHUB_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch market status");
  const data = await res.json();
  return data.isOpen;
}

serve(async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/refresh-filings-sentiment") {
    let failed = [];
    for (const company of SP500_COMPANIES) {
      try {
        await refreshFilingsSentiment(company.symbol);
      } catch (e) {
        failed.push(company.symbol);
      }
    }
    if (failed.length > 0) {
      return new Response(`Failed for: ${failed.join(", ")}`, { status: 500 });
    }
    return new Response("Filings sentiment batch complete", { status: 200 });
  }
  if (url.pathname === "/refresh-auto") {
    try {
      const isOpen = await getMarketStatus();
      if (isOpen) {
        await refreshAllStocks();
        return new Response("Stock sentiment refreshed (market open)", { status: 200 });
      } else {
        await refreshAllCompanyProfiles();
        return new Response("Company profiles refreshed (market closed)", { status: 200 });
      }
    } catch (e) {
      return new Response(`Error: ${e.message}`, { status: 500 });
    }
  }
  return new Response("Not found", { status: 404 });
}); 