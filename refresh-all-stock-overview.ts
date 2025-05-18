import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { refreshAllStocks } from "./stock_overview.ts";

console.log("Starting batch refresh of all S&P 500 stocks...");
await refreshAllStocks({
  onProgress: (symbol, status, error) => {
    if (status === "success") {
      console.log(`Upserted to stock_overview: ${symbol}`);
    } else if (status === "error") {
      console.error(`Error for ${symbol} (sentiment):`, error);
    }
  }
});
console.log("Stock sentiment batch refresh complete."); 