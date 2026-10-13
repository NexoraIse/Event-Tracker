"use client";

import { SpreadsheetImportCard } from "@/components/import/SpreadsheetImportCard";

export default function ImportPage() {
  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold text-black">Data Import</h1>
        <p className="mt-2 text-sm text-[#475467]">Preview and import both concern form spreadsheets from the same upload flow.</p>
      </div>

      <div className="space-y-8">
        <SpreadsheetImportCard
          form="form1"
          eyebrow="Concern Form"
          title="Concern Form"
          subtitle="Import and review student concern registration records from the concern form data sheet."
          emptyHint="Select a concern form Excel file to preview the uploaded records."
          importButtonLabel="Import Form 1"
          onImportSuccess={() => { window.location.href = "/"; }}
          
          columns={[
        { key: "usn", label: "USN" },
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: 'academicYear', label: 'Academic Year' },
        { key: 'yearOfStudy', label: 'Year of Study' },
        { key: 'eventName', label: 'Event Name' },
        { key: 'activityType', label: 'Activity Type' },
        { key: 'venue', label: 'Venue' },
        { key: 'eventDate', label: 'Event Date' },
        { key: 'numberOfDays', label: 'Number of Days' },
        { key: 'permissionFile', label: 'Permission Letter' },
      ]}
        />

        <SpreadsheetImportCard
          form="form2"
          eyebrow="Post Event Participation Form"
          title="Participation Form"
          subtitle="Import participation, certificate, and document updates from the post-event data sheet."
          description="Event records • Documents updates"
          emptyHint="Select a participation Excel file to preview the imported records."
          importButtonLabel="Import Form 2"
          onImportSuccess={() => { window.location.href = "/"; }}
          
          columns={[
            { key: "usn", label: "USN" },
            { key: "name", label: "Name" },
            { key: "academicYear", label: "Academic Year" },
            { key: "eventName", label: "Event Name" },
            { key: "eventType", label: "Activity Type" },
            { key: "venue", label: "Venue" },
            { key: "eventDate", label: "Event Date" },
            { key: "certificate_file", label: "Certificate / Proof" },
            { key: "photo_geo_file", label: "Photo with Geo Tag" },
            { key: "photo_non_geo_file", label: "Photo without Geo Tag" },
            { key: "matchStatus", label: "Status" },
          ]}
        />
      </div>
    </div>
  );
}
