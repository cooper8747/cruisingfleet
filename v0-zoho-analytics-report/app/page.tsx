"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Loader2, AlertCircle, Search, CheckCircle, Ban, UserPlus, Calendar } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface Attendee {
  accountName: string
  designation: string
  boatName: string
  contacts: string
  status: string
  vesselType: string
  loa: string
  beam: string
  accountId: string
}

interface Event {
  name: string
  date: string
  endDate: string
  fleetName: string
  category: string
  attendees: Attendee[]
  stats: {
    confirmed: number
    waitlisted: number
    cancelled: number
  }
}

export function ZohoReportView({ accountIdFilter }: { accountIdFilter?: string }) {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fleetFilter, setFleetFilter] = useState("")
  const [retryAfter, setRetryAfter] = useState<number | null>(null)
  const [showUserEventsOnly, setShowUserEventsOnly] = useState(true)

  const fetchReport = async () => {
    setLoading(true)
    setError(null)
    setRetryAfter(null)

    try {
      const response = await fetch("/api/report")

      if (response.status === 429) {
        const data = await response.json()
        setRetryAfter(data.retryAfter || 60)
        throw new Error(data.error || "Rate limited by Zoho API")
      }

      if (!response.ok) {
        throw new Error("Failed to fetch report")
      }

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      const processedEvents = processReportData(data)
      setEvents(processedEvents)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReport()
  }, [])

  useEffect(() => {
    if (events.length > 0) {
      fetchReport()
    }
  }, [showUserEventsOnly])

  const parseDateString = (dateStr: string): Date | null => {
    if (!dateStr) return null

    // Handle format like "Jan 29, 2026 07:00 PM"
    const cleanDate = dateStr.replace(/\\/g, "").trim()

    // Try parsing as standard date string (handles "Jan 29, 2026 07:00 PM" format)
    const parsed = new Date(cleanDate)
    if (!isNaN(parsed.getTime())) {
      return parsed
    }

    // Fallback: try old format "2026, 01/29"
    const parts = cleanDate.split(",").map((s) => s.trim())
    if (parts.length >= 2) {
      const year = parts[0]
      const datePart = parts[1].split(" ")[0]
      const [month, day] = datePart.split("/")
      if (year && month && day) {
        return new Date(Number.parseInt(year), Number.parseInt(month) - 1, Number.parseInt(day))
      }
    }

    return null
  }

  const formatDate = (dateStr: string): string => {
    const date = parseDateString(dateStr)
    if (!date) return dateStr

    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  const formatDateRange = (startDateStr: string, endDateStr: string): string => {
    const startDate = parseDateString(startDateStr)
    if (!startDate) return startDateStr

    const endDate = parseDateString(endDateStr)
    if (!endDate || endDate.getTime() === startDate.getTime()) {
      // No end date or same as start date
      return startDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    }

    const sameYear = startDate.getFullYear() === endDate.getFullYear()
    const sameMonth = sameYear && startDate.getMonth() === endDate.getMonth()

    if (sameMonth) {
      // Same month and year: "February 20-22, 2026"
      const month = startDate.toLocaleDateString("en-US", { month: "long" })
      return `${month} ${startDate.getDate()}-${endDate.getDate()}, ${startDate.getFullYear()}`
    } else if (sameYear) {
      // Same year, different month: "February 20 - March 5, 2026"
      const startFormatted = startDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })
      const endFormatted = endDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })
      return `${startFormatted} - ${endFormatted}, ${startDate.getFullYear()}`
    } else {
      // Different year: "December 28, 2025 - January 2, 2026"
      const startFormatted = startDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      const endFormatted = endDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      return `${startFormatted} - ${endFormatted}`
    }
  }

  const processReportData = (data: any): Event[] => {
    const columnOrder = data.response?.result?.column_order || []
    const rows = data.response?.result?.rows || []

    const eventIndex = columnOrder.indexOf("Event")
    const statusIndex = columnOrder.indexOf("Status")
    const accountNameIndex = columnOrder.indexOf("Account Name")
    const designationIndex = columnOrder.indexOf("Designation")
    const boatNameIndex = columnOrder.indexOf("BoatName")
    const contactsIndex = columnOrder.indexOf("Contacts")
    const categoryIndex = columnOrder.indexOf("Fleet_Event_Category")
    const vesselTypeIndex = columnOrder.indexOf("VesselType")
    const loaIndex = columnOrder.indexOf("LOA")
    const beamIndex = columnOrder.indexOf("Beam")
    const accountIdIndex = columnOrder.indexOf("Account_ID")
    const endDateIndex = columnOrder.indexOf("End_Date")

    if (eventIndex === -1 || statusIndex === -1) {
      console.error("[v0] Required columns not found")
      return []
    }

    const unescapeText = (text: string): string => {
      if (!text) return text
      return text.replace(/\\'/g, "'").replace(/\\\//g, "/")
    }

    // Group rows by event
    const eventMap = new Map<string, Event>()

    for (const row of rows) {
      const eventName = row[eventIndex]
      const status = row[statusIndex]
      const accountName = unescapeText(row[accountNameIndex] || "")
      const designation = unescapeText(row[designationIndex] || "")
      const boatName = unescapeText(row[boatNameIndex] || "")
      const contacts = row[contactsIndex] || ""
      const category = row[categoryIndex] || ""
      const vesselType = unescapeText(row[vesselTypeIndex] || "")
      const loa = unescapeText(row[loaIndex] || "")
      const beam = unescapeText(row[beamIndex] || "")
      const accountId = row[accountIdIndex] || ""
      const endDate = row[endDateIndex] || ""

      if (!eventName) continue

      // Parse event name to extract date and fleet name
      const [datePart, fleetPart] = eventName.split(":").map((s: string) => s.trim())

      if (!eventMap.has(eventName)) {
        eventMap.set(eventName, {
          name: eventName,
          date: datePart || "",
          endDate: endDate,
          fleetName: fleetPart || eventName,
          category: category,
          attendees: [],
          stats: {
            confirmed: 0,
            waitlisted: 0,
            cancelled: 0,
          },
        })
      }

      const event = eventMap.get(eventName)!

      // Add attendee
      event.attendees.push({
        accountName,
        designation,
        boatName,
        contacts,
        status,
        vesselType,
        loa,
        beam,
        accountId,
      })

      // Update stats based on status
      if (status.includes("Confirmed")) {
        event.stats.confirmed++
      } else if (status.includes("Waitlisted")) {
        event.stats.waitlisted++
      } else if (status.includes("Cancelled")) {
        event.stats.cancelled++
      }
    }

    let eventsArray = Array.from(eventMap.values())

    if (accountIdFilter) {
      if (showUserEventsOnly) {
        eventsArray = eventsArray.filter((event) =>
          event.attendees.some((attendee) => attendee.accountId === accountIdFilter),
        )
      }

      // Sort attendees within each event to show the filtered account at the top
      eventsArray.forEach((event) => {
        event.attendees.sort((a, b) => {
          if (a.accountId === accountIdFilter && b.accountId !== accountIdFilter) return -1
          if (a.accountId !== accountIdFilter && b.accountId === accountIdFilter) return 1
          return 0
        })
      })
    }

    return eventsArray
  }

  const getStatusBadge = (status: string) => {
    if (status.includes("Confirmed")) {
      return <Badge className="bg-green-600 hover:bg-green-700">Confirmed</Badge>
    } else if (status.includes("Waitlisted")) {
      return <Badge className="bg-yellow-600 hover:bg-yellow-700">Waitlisted</Badge>
    } else if (status.includes("Cancelled")) {
      return <Badge className="bg-red-600 hover:bg-red-700">Cancelled</Badge>
    }
    return <Badge variant="secondary">{status}</Badge>
  }

  const parseEventDate = (dateStr: string): Date | null => {
    if (!dateStr) return null

    const cleanDate = dateStr.replace(/\\/g, "")
    const parts = cleanDate.split(",").map((s) => s.trim())

    if (parts.length !== 2) return null

    const year = parts[0]
    const [month, day] = parts[1].split("/")

    if (!year || !month || !day) return null

    return new Date(Number.parseInt(year), Number.parseInt(month) - 1, Number.parseInt(day))
  }

  const generateGoogleCalendarUrl = (event: Event): string => {
    const startDate = parseEventDate(event.date)
    if (!startDate) return "#"

    // Format start date as YYYYMMDD for all-day event
    const startDateStr = startDate.toISOString().split("T")[0].replace(/-/g, "")

    // Use actual end date if available, otherwise use start date + 1 day
    let endDate = parseEventDate(event.endDate)
    if (!endDate) {
      endDate = new Date(startDate)
    }
    // Add 1 day because Google Calendar end date is exclusive for all-day events
    endDate.setDate(endDate.getDate() + 1)
    const endDateStr = endDate.toISOString().split("T")[0].replace(/-/g, "")

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: event.fleetName,
      dates: `${startDateStr}/${endDateStr}`,
      details: event.category ? `Category: ${event.category}` : "",
    })

    return `https://calendar.google.com/calendar/render?${params.toString()}`
  }

  const generateIcsFile = (event: Event): void => {
    const startDate = parseEventDate(event.date)
    if (!startDate) return

    const startDateStr = startDate.toISOString().split("T")[0].replace(/-/g, "")

    // Use actual end date if available, otherwise use start date + 1 day
    let endDate = parseEventDate(event.endDate)
    if (!endDate) {
      endDate = new Date(startDate)
    }
    // Add 1 day because ICS end date is exclusive for all-day events
    endDate.setDate(endDate.getDate() + 1)
    const endDateStr = endDate.toISOString().split("T")[0].replace(/-/g, "")

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Zoho Report//EN",
      "BEGIN:VEVENT",
      `DTSTART;VALUE=DATE:${startDateStr}`,
      `DTEND;VALUE=DATE:${endDateStr}`,
      `SUMMARY:${event.fleetName}`,
      event.category ? `DESCRIPTION:Category: ${event.category}` : "",
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .filter(Boolean)
      .join("\r\n")

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${event.fleetName.replace(/[^a-z0-9]/gi, "_")}.ics`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const filteredEvents = events.filter((event) => event.fleetName.toLowerCase().includes(fleetFilter.toLowerCase()))

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <div className="relative max-w-md flex items-center gap-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Filter by event..."
              value={fleetFilter}
              onChange={(e) => setFleetFilter(e.target.value)}
              className="pl-10 flex-1"
            />
            {accountIdFilter && (
              <button
                onClick={() => setShowUserEventsOnly(!showUserEventsOnly)}
                className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 shrink-0"
              >
                {showUserEventsOnly ? "Show All Events" : "Show My Events Only"}
              </button>
            )}
          </div>
          {fleetFilter && (
            <p className="mt-2 text-sm text-muted-foreground">
              Showing {filteredEvents.length} of {events.length} events
            </p>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error}
              {retryAfter && (
                <span className="mt-1 block text-sm">
                  Please wait {retryAfter} seconds and refresh the page to try again.
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!loading && !error && filteredEvents.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            {events.length === 0 ? "No events found in the report" : "No events match your filter"}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredEvents.map((event, index) => (
            <Card key={index} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-baseline justify-between gap-2">
                  <CardTitle className="text-lg text-balance">{event.fleetName}</CardTitle>
                  <div className="flex items-center gap-2">
                    <CardDescription className="text-sm whitespace-nowrap">
                      {formatDateRange(event.date, event.endDate)}
                    </CardDescription>
                    <TooltipProvider>
                      <div className="relative">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                              onClick={(e) => {
                                const dropdown = e.currentTarget.nextElementSibling
                                if (dropdown) {
                                  dropdown.classList.toggle("hidden")
                                }
                              }}
                            >
                              <Calendar className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Add to Calendar</TooltipContent>
                        </Tooltip>
                        <div className="hidden absolute right-0 top-full mt-1 z-10 min-w-[160px] rounded-md border bg-popover p-1 shadow-md">
                          <a
                            href={generateGoogleCalendarUrl(event)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
                            onClick={(e) => {
                              const dropdown = e.currentTarget.parentElement
                              if (dropdown) dropdown.classList.add("hidden")
                            }}
                          >
                            Google Calendar
                          </a>
                          <button
                            className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-muted cursor-pointer text-left"
                            onClick={(e) => {
                              generateIcsFile(event)
                              const dropdown = e.currentTarget.parentElement
                              if (dropdown) dropdown.classList.add("hidden")
                            }}
                          >
                            Apple Calendar (.ics)
                          </button>
                        </div>
                      </div>
                    </TooltipProvider>
                  </div>
                </div>
                {event.category && (
                  <CardDescription
                    className={`text-xs mt-1 ${
                      event.category === "Special Event"
                        ? "text-red-600"
                        : event.category === "Cruise"
                          ? "text-green-600"
                          : "text-muted-foreground"
                    }`}
                  >
                    {event.category}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex-1 space-y-4 pt-0">
                <TooltipProvider>
                  <div className="flex items-center gap-4 rounded-lg bg-muted p-3">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-semibold text-green-600">{event.stats.confirmed}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Confirmed</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5">
                          <UserPlus className="h-4 w-4 text-yellow-600" />
                          <span className="text-sm font-semibold text-yellow-600">{event.stats.waitlisted}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Waitlisted</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1.5">
                          <Ban className="h-4 w-4 text-red-600" />
                          <span className="text-sm font-semibold text-red-600">{event.stats.cancelled}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>Cancelled</TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Attendees</h4>
                  <div className="max-h-64 space-y-2 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
                    {event.attendees.map((attendee, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between rounded-md border p-2 text-sm bg-card ${
                          accountIdFilter && attendee.accountId === accountIdFilter ? "border-primary border-2" : ""
                        }`}
                      >
                        <div className="flex flex-col">
                          <span
                            className={`text-card-foreground ${
                              accountIdFilter && attendee.accountId === accountIdFilter ? "font-bold" : "font-medium"
                            }`}
                          >
                            {attendee.accountName}
                            {attendee.designation && (
                              <>
                                {" - "}
                                <span className="text-xs text-blue-600">{attendee.designation}</span>
                              </>
                            )}
                          </span>
                          {attendee.boatName && (
                            <span className="text-xs text-muted-foreground">{attendee.boatName}</span>
                          )}
                          {(attendee.vesselType || attendee.loa || attendee.beam) && (
                            <span className="text-xs text-muted-foreground">
                              {attendee.vesselType}
                              {attendee.vesselType && (attendee.loa || attendee.beam) && " • "}
                              {attendee.loa && <><span className="font-bold">LOA:</span> {attendee.loa}</>}
                              {attendee.loa && attendee.beam && " • "}
                              {attendee.beam && <><span className="font-bold">Beam:</span> {attendee.beam}</>}
                            </span>
                          )}
                        </div>
                        {getStatusBadge(attendee.status)}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ZohoReportPage() {
  return <ZohoReportView />
}
