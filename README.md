# Cruising Fleet - Zoho Analytics Report Viewer

A Next.js application that displays data from a Zoho Analytics report with automatic caching using Vercel Blob storage.

## Features

- 📊 Fetches data from Zoho Analytics API
- 💾 Caches data in Vercel Blob storage for fast access
- 🔄 Automatic daily refresh via cron job
- 🔃 Manual refresh capability
- 🎨 Modern UI with Tailwind CSS
- 🌓 Dark/Light theme support
- 🔍 Search and filter functionality

## Setup

### 1. Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# Zoho API Credentials
ZOHO_CLIENT_ID=your_client_id_here
ZOHO_CLIENT_SECRET=your_client_secret_here
ZOHO_REFRESH_TOKEN=your_refresh_token_here
ZOHO_OWNER_EMAIL=your_email@example.com
ZOHO_WORKSPACE_NAME=your_workspace_name
ZOHO_REPORT_NAME=your_report_name_here

# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN=your_blob_token_here

# Cron Job Secret
CRON_SECRET=your_cron_secret_here
```

**IMPORTANT:** The `ZOHO_REPORT_NAME` must be the exact name of your report in Zoho Analytics.

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Endpoints

### `/api/report`
- **GET**: Fetches report data from Blob cache or Zoho API
- Returns the full Zoho Analytics report data

### `/api/refresh`
- **GET**: Manually refreshes data from Zoho API and updates Blob cache
- Useful for testing or forcing an immediate update

### `/api/cron/sync-zoho`
- **GET**: Cron job endpoint that syncs data daily
- Requires `Authorization: Bearer {CRON_SECRET}` header
- Configured in `vercel.json` to run daily at midnight

## Data Structure

The app displays:
1. **Data Structure Card**: Shows column names and sample data
2. **Report Data Table**: Full table view of all rows with search functionality

The data structure is automatically detected from the Zoho API response:
- `response.result.column_order`: Array of column names
- `response.result.rows`: Array of data rows

## Customization

After querying the `/api/report` endpoint and seeing the actual data structure, you can customize the display in `app/page.tsx` to:
- Group data by specific columns
- Add filtering options
- Create custom visualizations
- Format specific fields

## Deployment

This app is configured for Vercel deployment:

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

The cron job will automatically be set up to run daily at midnight UTC.

## Project Structure

```
cruisingfleet/
├── app/
│   ├── api/
│   │   ├── report/
│   │   │   └── route.ts          # Main report endpoint
│   │   ├── refresh/
│   │   │   └── route.ts          # Manual refresh endpoint
│   │   └── cron/
│   │       └── sync-zoho/
│   │           └── route.ts      # Daily cron job
│   ├── page.tsx                   # Main page component
│   ├── layout.tsx                 # Root layout
│   ├── loading.tsx                # Loading component
│   └── globals.css                # Global styles
├── components/
│   └── ui/                        # UI components (shadcn/ui)
├── lib/
│   └── utils.ts                   # Utility functions
├── vercel.json                    # Cron job configuration
└── components.json                # shadcn/ui configuration
```

## Next Steps

1. **Set up environment variables** in `.env.local`
2. **Run the app** and query `/api/report` to see the data structure
3. **Customize the display** in `app/page.tsx` based on your report's structure
4. **Deploy to Vercel** for production use
