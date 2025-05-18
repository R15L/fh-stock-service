import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { refreshAllCompanyProfiles } from "./company_profile.ts";

console.log("Starting batch refresh of all S&P 500 company profiles...");
await refreshAllCompanyProfiles({
  onProgress: (symbol, status, error) => {
    if (status === "success") {
      console.log(`Upserted to company_profile: ${symbol}`);
    } else if (status === "error") {
      console.error(`Error for ${symbol} (company profile):`, error);
    }
  }
});
console.log("Company profile batch refresh complete."); 