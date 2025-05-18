import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { refreshAllFilingsSentiment } from "./stock_sentiment.ts";
import { SP500_COMPANIES } from "./sp500.ts";

console.log("Starting batch refresh of filings sentiment for all S&P 500 stocks...");
await refreshAllFilingsSentiment({
  companies: SP500_COMPANIES,
  onProgress: (symbol, status, error) => {
    if (status === "success") {
      console.log(`Upserted filings sentiment for: ${symbol}`);
    } else if (status === "error") {
      console.error(`Error for ${symbol}:`, error);
    }
  }
});
console.log("Filings sentiment batch refresh complete."); 