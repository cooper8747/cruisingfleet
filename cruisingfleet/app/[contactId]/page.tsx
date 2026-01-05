"use client";
import CruisingFleetReport from "../page";
import React from "react";

export default function ContactReportPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = React.use(params);
  return <CruisingFleetReport contactIdFilter={contactId} />;
}

