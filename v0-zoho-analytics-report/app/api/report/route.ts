import { list, put, del } from "@vercel/blob"
import { NextResponse } from "next/server"

// Cache for access token
let tokenCache: { token: string; expiresAt: number } | null = null
let lastRefreshAttempt = 0
const MIN_REFRESH_INTERVAL = 60000 // 60 seconds minimum between refresh attempts
let rateLimitUntil = 0 // Timestamp when rate limit expires

async function getAccessToken(forceRefresh = false): Promise<string> {
  // Check if we're currently rate limited
  if (rateLimitUntil > Date.now()) {
    const waitSeconds = Math.ceil((rateLimitUntil - Date.now()) / 1000)
    throw new Error(`RATE_LIMITED:${waitSeconds}`)
  }

  // Check if we have a valid cached token (unless forcing refresh)
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now()) {
    console.log("[v0] Using cached token")
    return tokenCache.token
  }

  const now = Date.now()
  if (now - lastRefreshAttempt < MIN_REFRESH_INTERVAL) {
    console.log("[v0] Rate limit protection: Using cached token to avoid Zoho rate limit")
    if (tokenCache) {
      return tokenCache.token
    }
    const waitSeconds = Math.ceil((MIN_REFRESH_INTERVAL - (now - lastRefreshAttempt)) / 1000)
    throw new Error(`RATE_LIMITED:${waitSeconds}`)
  }

  lastRefreshAttempt = now

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
  })

  console.log("[v0] Requesting new access token from Zoho")
  const response = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error("[v0] Token refresh failed:", response.status, errorBody)

    if (response.status === 400 && errorBody.includes("too many requests")) {
      console.log("[v0] Rate limited by Zoho, setting rate limit period")
      // Set rate limit for 2 minutes
      rateLimitUntil = Date.now() + 2 * 60 * 1000
      const waitSeconds = 120
      throw new Error(`RATE_LIMITED:${waitSeconds}`)
    }

    throw new Error(`Failed to refresh access token: ${response.status}`)
  }

  const data = await response.json()
  console.log("[v0] Successfully got new access token")

  // Cache the token (expires in 1 hour, we'll cache for 50 minutes to be safe)
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + 50 * 60 * 1000,
  }

  return data.access_token
}

async function fetchReportData(accessToken: string) {
  const ownerEmail = process.env.ZOHO_OWNER_EMAIL!
  const workspaceName = encodeURIComponent(process.env.ZOHO_WORKSPACE_NAME!)
  const reportName = encodeURIComponent(process.env.ZOHO_REPORT_NAME!)

  const url = `https://analyticsapi.zoho.com/api/${ownerEmail}/${workspaceName}/${reportName}?ZOHO_ACTION=EXPORT&ZOHO_OUTPUT_FORMAT=JSON&ZOHO_ERROR_FORMAT=JSON&ZOHO_API_VERSION=1.0`

  const response = await fetch(url, {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
  })

  return response
}

async function syncZohoData() {
  console.log("[v0] Syncing fresh data from Zoho...")

  const accessToken = await getAccessToken()
  const response = await fetchReportData(accessToken)

  if (!response.ok) {
    const errorText = await response.text()
    console.error("[v0] Zoho API error:", errorText)
    throw new Error(`Failed to fetch report data: ${response.status}`)
  }

  const rawText = await response.text()

  // Fix common JSON escaping issues
  const cleanedText = rawText
    .replace(/\\/g, "\\\\")
    .replace(/\\\\"/g, '\\"')
    .replace(/\\\\n/g, "\\n")
    .replace(/\\\\t/g, "\\t")
    .replace(/\\\\r/g, "\\r")

  let data
  try {
    data = JSON.parse(cleanedText)
  } catch (parseError) {
    console.error("[v0] JSON parse error with cleaned text, trying original:", parseError)
    data = JSON.parse(rawText)
  }

  // Delete all existing blobs before writing the new one
  const { blobs: existingBlobs } = await list({
    prefix: "v0-zoho-analytics-report-blob",
  })

  if (existingBlobs.length > 0) {
    console.log(`[v0] Deleting ${existingBlobs.length} existing blob(s)`)
    await Promise.all(existingBlobs.map((blob) => del(blob.url)))
  }

  // Write to Vercel Blob
  const blob = await put("v0-zoho-analytics-report-blob.json", JSON.stringify(data), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: true,
  })

  console.log("[v0] Successfully synced data to Blob:", blob.url)
  return data
}

export async function GET() {
  try {
    const { blobs } = await list({
      prefix: "v0-zoho-analytics-report-blob",
    })

    if (blobs.length === 0) {
      console.log("[v0] No cached data found in Blob storage, fetching fresh data...")
      try {
        const data = await syncZohoData()
        return NextResponse.json(data)
      } catch (syncError) {
        console.error("[v0] Failed to sync data:", syncError)

        // Check if it's a rate limit error
        if (syncError instanceof Error && syncError.message.startsWith("RATE_LIMITED:")) {
          const waitSeconds = Number.parseInt(syncError.message.split(":")[1])
          return NextResponse.json(
            {
              error: `Zoho API rate limit reached. Please wait ${waitSeconds} seconds and refresh the page.`,
            },
            { status: 429, headers: { "Retry-After": waitSeconds.toString() } },
          )
        }

        throw syncError
      }
    }

    // Get the most recent blob (they're sorted by uploadedAt by default)
    const latestBlob = blobs[0]
    console.log("[v0] Reading cached data from Blob:", latestBlob.pathname)

    // Fetch the blob content
    const response = await fetch(latestBlob.downloadUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.status}`)
    }

    const data = await response.json()

    console.log(
      "[v0] Blob data retrieved:",
      JSON.stringify(
        {
          uploadedAt: latestBlob.uploadedAt,
          hasResponse: !!data.response,
          rowCount: data.response?.result?.rows?.length || 0,
        },
        null,
        2,
      ),
    )

    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Error fetching cached report:", error)
    return NextResponse.json({ error: "Failed to fetch cached report data" }, { status: 500 })
  }
}
