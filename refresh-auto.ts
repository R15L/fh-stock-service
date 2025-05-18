import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { refreshAllStocks } from "./stock_sentiment.ts";
import { refreshAllCompanyProfiles } from "./company_profile.ts";

const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY");

async function getMarketStatus(): Promise<boolean> {
  const url = `https://finnhub.io/api/v1/stock/market-status?exchange=US&token=${FINNHUB_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch market status");
  const data = await res.json();
  return data.isOpen;
}

serve(async (req) => {
  if (new URL(req.url).pathname === "/refresh-auto") {
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