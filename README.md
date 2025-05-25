# Deno Finnhub-Supabase Stock Quote Service

## Project Overview & Analysis (2024)

This backend service fetches stock and company data (primarily S&P 500) from the Finnhub API and saves it to a Supabase table. It exposes HTTP endpoints and batch scripts to trigger the fetch-and-save process. The frontend should fetch cached data directly from Supabase.

### Key Features & Structure
- Deno HTTP server and batch scripts
- Fetches stock/company data from Finnhub
- Upserts data into Supabase (`stock_overview` and `company_profile` tables)
- Exposes `/refresh-quote?symbol=...` endpoint
- Reads secrets from environment variables
- CORS enabled for local development
- Automated batch updates via GitHub Actions and Deno Deploy

### Current State
- **Stock sentiment/filings sentiment features have been removed.**
- **User settings and Clerk integration are not present.**
- Focus is on core stock/company data processing and automation.
- Batch scripts and endpoints respect API rate limits (1-second delay per symbol).
- Error handling and logging are present throughout.
- `.env` and `.gitignore` are used for secret management.
- No explicit tests or monitoring are present (recommended for production).

---

## Requirements
- [Deno](https://deno.com/) (v1.30+ recommended)
- Supabase project (with service key)
- Finnhub API key

## Environment Variables
Create a `.env` file (or set these in your environment):

```
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_KEY=your-supabase-service-key
FINNHUB_API_KEY=your-finnhub-api-key
```

## Supabase Table Schema
Create a table called `stock_overview` with the following columns:

| Column         | Type    | Notes         |
|---------------|---------|--------------|
| symbol        | text    | Primary key  |
| current_price | numeric | Current price|
| high          | numeric | High         |
| low           | numeric | Low          |
| open          | numeric | Open         |
| previous_close| numeric | Prev. close  |
| last_retrieved| timestamptz | Last update |
| name          | text    | Company name |
| logo          | text    | Logo URL     |
| earnings_date | text    | Earnings date|
| sector        | text    | Sector       |
| market_cap    | numeric | Market cap   |

## Batch Update Process & Rate Limiting

- The batch update script (`refresh-all.ts`) randomizes the order of S&P 500 symbols before processing.
- Stocks are processed one per second (to respect Finnhub's free API limit).
- If a stock fails to fetch after 3 retries (with exponential backoff), its symbol is tracked.
- At the end of the run, a summary of all failed symbols is printed to the console.
- You can retry just the failed symbols by modifying the script to process only those, or by re-running the batch (randomized order helps avoid repeated failures).

## Retrying Failed Symbols

If you see a list of failed symbols at the end of a batch run, you can:
- Copy the list and run a targeted update for just those symbols (by modifying the script or adding a retry mode).
- Or, simply re-run the batch script; the randomized order and retry logic will often succeed on a second attempt.

## Logging

- Each upserted stock is logged to the console.
- Errors and retries are logged for each symbol.
- Batch boundaries and wait times are logged for transparency.

## Running the Service

1. Set environment variables (see above).
2. Start the server:

```sh
deno run --allow-net --allow-env main.ts
```

```sh
deno run --allow-net --allow-env refresh-all.ts
```

## Batch Scripts

You can run batch updates for either company profiles or stock overview independently:

### Refresh all company profiles

Fetches and upserts company profile data for all S&P 500 symbols from Finnhub:

```sh
deno run --allow-net --allow-env refresh-all-company-profiles.ts
```

### Refresh all stock overview

Fetches and upserts stock quote data for all S&P 500 symbols from Finnhub:

```sh
deno run --allow-net --allow-env refresh-all-stock-overview.ts
```

Each script logs progress and errors to the console. You can run them as often as needed.

## Example Usage

Fetch and cache the latest quote for AAPL:

```
GET http://localhost:8000/refresh-quote?symbol=AAPL
```

Response:
```json
{
  "success": true,
  "symbol": "AAPL",
  "data": {
    "current_price": 123.45,
    "high": 125.00,
    "low": 122.00,
    "open": 124.00,
    "previous_close": 123.00,
    "logo": "https://static.finnhub.io/logo/2b6b6c6e-4c7b-11ea-8b1b-00000000092a.png"
  }
}
```

## Notes
- CORS headers are enabled for local development.
- The frontend should fetch cached data directly from Supabase, not from this service.

## Deno Deploy & Automated Scheduling

### Deno Deploy Handler: `/refresh-auto`

Deploy `refresh-auto.ts` to Deno Deploy. This endpoint:
- Checks if the US market is open using Finnhub's market status API.
- If open, runs a full stock overview refresh.
- If closed, runs a full company profile refresh.
- Returns a simple text response indicating what was refreshed.

Example manual call:
```sh
curl -X GET "https://YOUR_DENO_DEPLOY_URL/refresh-auto"
```

### GitHub Actions Scheduler

You can automate refreshes by calling your Deno Deploy endpoint on a schedule using GitHub Actions:

Create `.github/workflows/refresh-auto.yml`:
```yaml
name: Scheduled Deno Deploy Refresh

on:
  schedule:
    # Every 15 minutes during market hours (9:30am-4pm ET, Mon-Fri)
    - cron: '*/15 13-20 * * 1-5'
    # Once nightly at 8pm ET (0:00 UTC)
    - cron: '0 0 * * *'

jobs:
  call-deno-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Call Deno Deploy /refresh-auto endpoint
        run: |
          curl -X GET "https://YOUR_DENO_DEPLOY_URL/refresh-auto"
```
- Replace `https://YOUR_DENO_DEPLOY_URL/refresh-auto` with your actual Deno Deploy endpoint.
- Adjust cron times as needed for your timezone and requirements.

This setup ensures your data stays fresh with zero manual intervention. 