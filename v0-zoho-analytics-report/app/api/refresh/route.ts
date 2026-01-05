import { put, list, del } from "@vercel/blob"
import { NextResponse } from "next/server"

// Cache for access token
let tokenCache: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    console.log("[v0] Using cached token")
    return tokenCache.token
  }

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

export async function GET() {
  try {
    console.log("[v0] Manual refresh triggered: Syncing Zoho data to Blob")

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

    return NextResponse.json({
      success: true,
      message: "Zoho data successfully refreshed",
      blobUrl: blob.url,
      timestamp: new Date().toISOString(),
      rowCount: data.response?.result?.rows?.length || 0,
    })
  } catch (error) {
    console.error("[v0] Error syncing Zoho data:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
