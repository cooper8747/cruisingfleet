"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import AdminPanel from "@/components/AdminPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Loader2, AlertCircle, Search, Users, Calendar, MapPin, CheckCircle, Ban, UserPlus, Utensils, Mic, Wand,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { usePathname } from "next/navigation";

interface Attendee {
  firstName: string;
  lastName: string;
  fullName: string;
  status: string;
  mobile: string;
  email: string;
  contactId: string;
  accountId: string;
  accountName?: string;
}
interface Event {
  name: string;
  eventId: string;
  category: string;
  venue: string;
  start: string;
  end: string;
  attendees: Attendee[];
}
interface Props {
  contactIdFilter?: string;
}
function getCategoryColorClass(cat: string) {
  const colors = [
    "bg-blue-200 text-blue-800", "bg-rose-200 text-rose-800", "bg-green-200 text-green-800",
    "bg-yellow-200 text-yellow-900", "bg-purple-200 text-purple-800", "bg-orange-200 text-orange-800",
    "bg-pink-200 text-pink-800", "bg-cyan-200 text-cyan-900",
  ];
  let hash = 0;
  for (let i = 0; i < cat.length; i++)
    hash = cat.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function CruisingFleetReport({ contactIdFilter, showAdmin, }: Props & { showAdmin?: boolean }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showFutureOnly, setShowFutureOnly] = useState(false);
  const pathname = usePathname();
  const [logs, setLogs] = useState<string[]>([]);
  const exportAnchorRef = useRef<HTMLAnchorElement>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [showOnlyMyEvents, setShowOnlyMyEvents] = useState(!!contactIdFilter);
  const [activeContactId, setActiveContactId] = useState(contactIdFilter);
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (error) setLogs((prev) => [...prev, `[${new Date().toLocaleString()}] ${error}`]);
  }, [error]);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    setRetryAfter(null);
    try {
      const response = await fetch("/api/report");
      if (response.status === 429) {
        const data = await response.json();
        setRetryAfter(data.retryAfter || 60);
        throw new Error(data.error || "Rate limited by Zoho API");
      }
      if (!response.ok) throw new Error("Failed to fetch report");
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchReport(); }, []);

  const events = useMemo<Event[]>(() => {
    if (!data?.response?.result) return [];
    const columnOrder = data.response.result.column_order || [];
    const rows = data.response.result.rows || [];
    const idx = (name: string) => columnOrder.indexOf(name);
    const eventMap = new Map<string, Event>();
    const unescapeText = (text: string) =>
      text?.replace(/\'/g, "'").replace(/\\/g, "") ?? "";
    for (const row of rows) {
      let eventName = unescapeText(row[idx("Event")]);
      eventName = eventName.replace(/\/{2,}/g, "/");
      if (!eventName) continue;
      if (!eventMap.has(eventName)) {
        eventMap.set(eventName, {
          name: eventName,
          eventId: row[idx("EventID")] || "",
          category: unescapeText(row[idx("Category")]),
          venue: unescapeText(row[idx("Venue")]),
          start: row[idx("Start")] || "",
          end: row[idx("End")] || "",
          attendees: [],
        });
      }
      eventMap.get(eventName)!.attendees.push({
        firstName: unescapeText(row[idx("FirstName")]),
        lastName: unescapeText(row[idx("LastName")]),
        fullName: unescapeText(row[idx("Full Name")]),
        status: row[idx("Status")] || "",
        mobile: row[idx("Mobile")] || "",
        email: row[idx("Email")] || "",
        contactId: row[idx("ContactID")] || "",
        accountId: row[idx("AccountID")] || "",
        accountName: unescapeText(row[idx("Account")] || ""),
      });
    }
    const eventsArray = Array.from(eventMap.values());
    eventsArray.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    eventsArray.forEach((event) =>
      event.attendees.sort((a, b) => {
        if (activeContactId) {
          const isA = String(a.contactId).trim() === String(activeContactId).trim();
          const isB = String(b.contactId).trim() === String(activeContactId).trim();
          if (isA && !isB) return -1;
          if (!isA && isB) return 1;
        }
        return (
          (a.lastName || "").localeCompare(b.lastName || "", undefined, { sensitivity: "base" }) ||
          (a.firstName || "").localeCompare(b.firstName || "", undefined, { sensitivity: "base" })
        );
      })
    );
    return eventsArray;
  }, [data, activeContactId]);

  const accountContacts = useMemo(() => {
    if (!activeContactId) return [];
    const allAttendees = events.flatMap(e => e.attendees);
    const primary = allAttendees.find(a => String(a.contactId).trim() === String(activeContactId).trim());
    if (!primary) return [];
    const { accountId } = primary;
    const seen = new Set();
    return allAttendees.filter(a => a.accountId === accountId && !seen.has(a.contactId) && seen.add(a.contactId));
  }, [events, activeContactId]);

  const filteredEvents = useMemo(() => {
    let filtered = events;
    const effectiveContactId = activeContactId;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          e.venue.toLowerCase().includes(q) ||
          e.attendees.some(
            (a) =>
              a.fullName.toLowerCase().includes(q) ||
              a.status.toLowerCase().includes(q)
          )
      );
    }
    if (showOnlyMyEvents && effectiveContactId) {
      filtered = filtered.filter(e =>
        e.attendees.some(a => String(a.contactId).trim() === String(effectiveContactId).trim())
      );
    }
    if (showFutureOnly) {
      const now = new Date();
      filtered = filtered.filter(e => {
        const start = new Date(e.start);
        return !isNaN(start.getTime()) && start >= now;
      });
    }
    return filtered;
  }, [events, searchFilter, showOnlyMyEvents, activeContactId, showFutureOnly]);

  const toggleExpand = (eventName: string) =>
    setExpandedEvents((state) => ({ ...state, [eventName]: !state[eventName] }));
  const handleExpandAll = () => {
    const expanded: Record<string, boolean> = {};
    filteredEvents.forEach(e => { expanded[e.name] = true; });
    setExpandedEvents(expanded);
  };
  const handleCollapseAll = () => { setExpandedEvents({}); };
  const allExpanded = filteredEvents.length > 0 && filteredEvents.every(e => expandedEvents[e.name]);

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes("attended")) return <Badge className="bg-green-600">Attended</Badge>;
    if (s.includes("no-show") || s.includes("noshow")) return <Badge className="bg-red-600">No-Show</Badge>;
    if (s.includes("cancelled") || s.includes("canceled")) return <Badge className="bg-gray-400 text-gray-900">Cancelled</Badge>;
    if (s.includes("pre-registered")) return <Badge className="bg-yellow-400 text-yellow-900">Pre-Registered</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
  };

  const eventCards = filteredEvents.map((event, index) => {
    let attended = 0, noShow = 0, cancelled = 0, prereg = 0;
    event.attendees.forEach((a) => {
      const s = a.status.toLowerCase();
      if (s.includes("attended")) attended++;
      else if (s.includes("no-show") || s.includes("noshow")) noShow++;
      else if (s.includes("cancelled") || s.includes("canceled")) cancelled++;
      else if (s.includes("pre-registered")) prereg++;
    });
    const categoryIconMap = {
      "Daytripper": <Utensils className={`h-3 w-3 ${getCategoryColorClass(event.category).split(" ").find(cls=>cls.startsWith("text-")) || "text-gray-700"}`} />,
      "CF Committee": <Users className={`h-3 w-3 ${getCategoryColorClass(event.category).split(" ").find(cls=>cls.startsWith("text-")) || "text-gray-700"}`} />,
      "Fleet Meeting": <Mic className={`h-3 w-3 ${getCategoryColorClass(event.category).split(" ").find(cls=>cls.startsWith("text-")) || "text-gray-700"}`} />,
      "Special Event": <Wand className={`h-3 w-3 ${getCategoryColorClass(event.category).split(" ").find(cls=>cls.startsWith("text-")) || "text-gray-700"}`} />,
    };
    const CategoryIcon = categoryIconMap[event.category as keyof typeof categoryIconMap] || null;
    return (
      <Card key={index} className="flex flex-col">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-lg cursor-pointer select-none flex items-center gap-2" onClick={() => toggleExpand(event.name)}>
              {(showAdmin || pathname === '/admin' || pathname.endsWith('/admin')) && event.eventId ? (
                <a
                  href={`https://crm.zoho.com/crm/spyc/tab/Products/${event.eventId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-800 underline hover:text-blue-600"
                  title="View Product in Zoho CRM"
                  onClick={e => e.stopPropagation()}
                >
                  {event.name.replace(/^[^:]*:\s*/, "")}
                </a>
              ) : (
                event.name.replace(/^[^:]*:\s*/, "")
              )}
              <span className="flex items-center gap-1">
                {expandedEvents[event.name] ? (
                  <svg width="18" height="18" viewBox="0 0 20 20" className="text-red-600"><polyline points="6 12 10 8 14 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 20 20" className="text-red-600"><polyline points="6 8 10 12 14 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                )}
                <span className="text-xs text-muted-foreground ml-0.5 select-none">
                  {expandedEvents[event.name] ? "Collapse List" : "Expand List"}
                </span>
              </span>
            </CardTitle>
            {event.category && (
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold mb-2 mr-2 ${getCategoryColorClass(event.category)}`}>
                {CategoryIcon} {event.category}
              </span>
            )}
            <div className="flex gap-4 rounded-lg bg-muted p-3 mt-2 text-sm">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 cursor-pointer">
                    <Users className="h-4 w-4 text-gray-600" /> {event.attendees.length}
                  </div>
                </TooltipTrigger>
                <TooltipContent>Total Attendees</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-green-600 flex items-center gap-1 cursor-pointer">
                    <CheckCircle className="h-4 w-4" /> {attended}
                  </div>
                </TooltipTrigger>
                <TooltipContent>Attended</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-red-600 flex items-center gap-1 cursor-pointer">
                    <Ban className="h-4 w-4" /> {noShow}
                  </div>
                </TooltipTrigger>
                <TooltipContent>No-Show</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-gray-500 flex items-center gap-1 cursor-pointer">
                    <Ban className="h-4 w-4" /> {cancelled}
                  </div>
                </TooltipTrigger>
                <TooltipContent>Cancelled</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-yellow-700 flex items-center gap-1 cursor-pointer">
                    <UserPlus className="h-4 w-4" /> {prereg}
                  </div>
                </TooltipTrigger>
                <TooltipContent>Pre-Registered</TooltipContent>
              </Tooltip>
            </div>
            <div className="text-xs text-muted-foreground space-y-1 mb-2">
              {event.venue && (
                <div className="flex gap-1 items-center">
                  <MapPin className="h-3 w-3" /> {event.venue}
                </div>
              )}
              {event.start && (
                <div className="flex gap-1 items-center">
                  <Calendar className="h-3 w-3" />
                  {event.start}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        {expandedEvents[event.name] && (
          <CardContent className="space-y-2">
            {event.attendees.map((a, i) => (
              <div
                key={i}
                className={`flex justify-between items-center rounded border p-2 ${
                  activeContactId === a.contactId
                    ? "border-primary border-2"
                    : ""
                }`}
              >
                {(showAdmin || pathname === '/admin' || pathname.endsWith('/admin')) ? (
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            window.open(`/${a.contactId}/admin`, '_blank');
                          }}
                          className="text-gray-600 hover:text-green-700"
                          tabIndex={-1}
                          type="button"
                        >
                          <UserPlus className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Impersonate Member</TooltipContent>
                    </Tooltip>
                    <a
                      href={`https://crm.zoho.com/crm/spyc/tab/Contacts/${a.contactId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-blue-800 underline hover:text-blue-600"
                      title="View in Zoho CRM"
                    >
                      {a.fullName}
                    </a>
                  </div>
                ) : (
                  <span className="truncate">{a.fullName}</span>
                )}
                {getStatusBadge(a.status)}
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    );
  });

  return (
    <div className="p-6">
      {(showAdmin || pathname === '/admin' || pathname.endsWith('/admin')) && (
        <>
          <AdminPanel
            logs={logs}
            onExport={() => {}}
            onDownloadLog={() => {}}
            onRefresh={fetchReport}
            refreshing={refreshing}
            onShowRawData={() => setShowRawData(true)}
            onClose={() => {
              if (activeContactId) {
                window.location.pathname = `/${activeContactId}`;
              } else {
                window.location.pathname = "/";
              }
            }}
          />
          <a ref={exportAnchorRef} style={{ display: 'none' }} tabIndex={-1} />
        </>
      )}
      <div className="mb-2">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold whitespace-nowrap truncate">Member Participation Report</h1>
        <div className="text-sm mt-1 font-normal">
          {activeContactId ? (
            <div className="flex items-center gap-2">
              <span className="text-black">Displaying Activity for </span>
              <select
                className="font-bold text-black border rounded px-2 py-1"
                value={activeContactId}
                onChange={e => setActiveContactId(e.target.value)}
              >
                {accountContacts.map(a =>
                  <option key={a.contactId} value={a.contactId}>{a.fullName}</option>
                )}
              </select>
            </div>
          ) : (
            <>
              <span className="text-black">Displaying Activity for </span>
              <span className="font-bold text-black">all Members</span>
            </>
          )}
        </div>
        {activeContactId && (
          <div>
            {/* Vessel Activity Line */}
            {(() => {
              // Find Account Name for this contact
              const allAttendees = events.flatMap(e => e.attendees);
              const primary = allAttendees.find(a => String(a.contactId).trim() === String(activeContactId).trim());
              const accountName = primary?.accountName || "this Account";
              return (
                <div className="mb-2 mt-3 text-sm font-normal text-black">
  <a
    href={`https://v0-cruising-fleet-member-activity.vercel.app/${primary?.accountId || ""}`}
    className="hover:underline"
    target="_blank"
    rel="noopener noreferrer"
  >
    <span className="italic">View Vessel Activity for</span>{' '}
    <span className="font-semibold text-blue-700">{accountName}</span>
  </a>
</div>
              );
            })()}
            <div className="font-bold text-base mb-2 mt-4">Participation by Status</div>
            {(() => {
              let total = 0, attended = 0, noShow = 0, cancelled = 0;
              for (const event of filteredEvents) {
                const a = event.attendees.find(a => String(a.contactId).trim() === String(activeContactId).trim());
                if (!a) continue;
                total++;
                const s = a.status.toLowerCase();
                if (s.includes("attended")) attended++;
                else if (s.includes("no-show") || s.includes("noshow")) noShow++;
                else if (s.includes("cancelled") || s.includes("canceled")) cancelled++;
              }
              return (
                <div className="flex gap-4 rounded-lg bg-muted/70 px-4 py-2 my-3 text-base items-center">
                  <div className="flex items-center gap-1" title="Total Events">
                    <Users className="h-5 w-5 text-gray-600" />
                    <span className="font-semibold text-black">{total}</span>
                  </div>
                  <div className="flex items-center gap-1 text-green-600" title="Attended">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-semibold text-black">{attended}</span>
                  </div>
                  <div className="flex items-center gap-1 text-red-600" title="No-Show">
                    <Ban className="h-5 w-5" />
                    <span className="font-semibold text-black">{noShow}</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-600" title="Cancelled">
                    <Ban className="h-5 w-5" />
                    <span className="font-semibold text-black">{cancelled}</span>
                  </div>
                </div>
              );
            })()}
            <div className="font-bold text-base mb-2 mt-4">Participation by Event Type</div>
            {(() => {
              const eventTypeCounts: Record<string, number> = {};
              const iconMap = {
                "Daytripper": Utensils, "CF Committee": Users, "Fleet Meeting": Mic, "Special Event": Wand,
              };
              const colorClassMap = {
                "Daytripper": getCategoryColorClass("Daytripper").split(" ").find(cls => cls.startsWith("text-")) || "text-blue-900",
                "CF Committee": getCategoryColorClass("CF Committee").split(" ").find(cls => cls.startsWith("text-")) || "text-rose-900",
                "Fleet Meeting": getCategoryColorClass("Fleet Meeting").split(" ").find(cls => cls.startsWith("text-")) || "text-green-900",
                "Special Event": getCategoryColorClass("Special Event").split(" ").find(cls => cls.startsWith("text-")) || "text-purple-900",
              };
              for (const event of filteredEvents) {
                const category = event.category;
                const match = event.attendees.find(a => String(a.contactId).trim() === String(activeContactId).trim());
                if (!match) continue;
                if (!eventTypeCounts[category]) eventTypeCounts[category] = 0;
                eventTypeCounts[category]++;
              }
              return (
                <div className="flex gap-6 bg-muted/50 rounded-lg px-4 py-2 mb-3 text-base items-center">
                  {Object.entries(iconMap).map(([type, Icon]) => {
                    const colorClass = colorClassMap[type as keyof typeof colorClassMap] || "text-gray-800";
                    return (
                      <Tooltip key={type}>
                        <TooltipTrigger asChild>
                          <div className={`flex items-center gap-1 cursor-pointer ${colorClass}`}>
                            <Icon className={`h-5 w-5 ${colorClass}`} />
                            <span className="font-semibold text-black">{eventTypeCounts[type] || 0}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{type}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>
      <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
        <div style={{ maxWidth: 400 }} className="w-full flex items-center gap-2">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
            <Input
              className="pl-10"
              placeholder="Search events or attendees…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
          {activeContactId && (
            <button
              type="button"
              className={`flex items-center gap-1 rounded px-3 py-2 text-sm font-semibold border border-gray-300 hover:bg-gray-100 transition-colors ${showOnlyMyEvents ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'}`}
              onClick={() => setShowOnlyMyEvents(v => !v)}
              style={{ whiteSpace: 'nowrap' }}
            >
              {showOnlyMyEvents ? "Show All Events" : "Show Only My Events"}
            </button>
          )}
        </div>
      </div>
      <div className="mb-2 flex items-center gap-4">
        <span
          className="flex items-center gap-2 cursor-pointer select-none"
          style={{ userSelect: 'none' }}
          onClick={allExpanded ? handleCollapseAll : handleExpandAll}
        >
          {allExpanded ? (
            <svg width="18" height="18" viewBox="0 0 20 20" className="text-red-600"><polyline points="6 12 10 8 14 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 20 20" className="text-red-600"><polyline points="6 8 10 12 14 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          )}
          <span className="text-xs text-muted-foreground ml-0.5">
            {allExpanded ? "Collapse All Lists" : "Expand All Lists"}
          </span>
        </span>
      </div>
      <div className="w-full flex mt-1 mb-4">
        <label className="flex items-center space-x-1 text-xs sm:text-sm">
          <input
            type="checkbox"
            checked={showFutureOnly}
            onChange={() => setShowFutureOnly((v) => !v)}
            className="accent-primary h-4 w-4 rounded focus:ring-2 focus:ring-blue-500 border border-gray-300"
          />
          <span>Show Only Future Events</span>
        </label>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error}
            {retryAfter && ` Retry after ${retryAfter}s.`}
          </AlertDescription>
        </Alert>
      )}
      {showRawData && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-60 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-lg max-w-3xl max-h-[85vh] relative overflow-auto">
            <button
              className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-red-500 text-white hover:bg-red-700"
              onClick={() => setShowRawData(false)}
              title="Close Raw Data"
            >
              Close
            </button>
            <div className="text-xs max-w-full whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100">
              <pre className="overflow-auto">{JSON.stringify(data, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin h-8 w-8" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {eventCards}
        </div>
      )}
    </div>
  );
}
