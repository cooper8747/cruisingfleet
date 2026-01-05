"use client";
import CruisingFleetReport from "../../page";
import React from "react";

export default function ContactAdminReportPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = React.use(params);
  return <CruisingFleetReport showAdmin={true} contactIdFilter={contactId} />;
}

