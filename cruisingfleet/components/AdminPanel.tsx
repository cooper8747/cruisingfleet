"use client";
import { useState } from "react";
import { X } from "lucide-react";

export default function AdminPanel({ logs, onExport, onDownloadLog, onRefresh, refreshing, onShowRawData, onClose } : {
  logs: string[];
  onExport: () => void;
  onDownloadLog: () => void;
  onRefresh: () => void;
  onShowRawData: () => void;
  refreshing: boolean;
  onClose?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="fixed z-50 top-2 right-2 max-w-sm min-w-[270px] bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-300 p-3">
      <div className="flex justify-between items-center mb-2 pb-2 border-b">
        <div className="flex items-center gap-2">
          <span className="bg-red-600 text-white text-xs font-semibold rounded px-2 py-1">Admin Mode</span>
          <span className="text-gray-400 text-xs">Panel</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-xs text-blue-500 hover:text-blue-700 font-bold ml-2"
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? "Expand Panel" : "Collapse Panel"}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
          {onClose && (
            <button
              className="ml-1 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800"
              title="Exit Admin Mode"
              aria-label="Close admin panel"
              onClick={onClose}
            >
              <X className="h-5 w-5 text-gray-500 hover:text-red-500 transition-colors" />
            </button>
          )}
        </div>
      </div>
      {!collapsed && (
        <>
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              className="bg-blue-600 rounded px-2 py-1 text-xs text-white font-bold hover:bg-blue-700 shadow"
              onClick={onExport}
              title="Export table data as CSV"
            >
              Export Data
            </button>
            <button
              className="bg-gray-600 rounded px-2 py-1 text-xs text-white font-bold hover:bg-gray-700 shadow"
              onClick={onDownloadLog}
              title="Download log as TXT"
            >
              Download Log
            </button>
            <button
              className="bg-primary rounded px-2 py-1 text-xs text-white font-semibold hover:bg-primary/90 shadow min-h-0"
              onClick={onRefresh}
              disabled={refreshing}
              style={{ height: '2rem' }}
              title="Refresh Zoho Data Now"
            >
              {refreshing ? 'Refreshing...' : 'Refresh Data'}
            </button>
            <button
              className="bg-teal-700 rounded px-2 py-1 text-xs text-white font-bold hover:bg-teal-900 shadow"
              onClick={onShowRawData}
              title="Show Raw Zoho Report Data on Screen"
            >
              Show Raw Data
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto bg-gray-50 rounded border border-gray-200 p-2 text-xs text-gray-700 whitespace-pre-wrap dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700">
            {logs && logs.length > 0 ? logs.map((log, i) => (
              <div key={i}>{log}</div>
            )) : <span className="italic">No logs available.</span>}
          </div>
        </>
      )}
    </div>
  );
}
