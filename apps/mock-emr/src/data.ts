// Sample patients, staff and chat records. Made up; no real people.

export type Name = { en: string; ar: string };

export type StoredAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  content: Buffer;
};

export type StoredRecord = {
  recordId: string;
  recordName: string;
  fileNumber: string;
  provider: { staffId: string; name: string };
  startedAt: string;
  endedAt: string;
  finishedBy: "provider" | "auto" | "deactivation";
  messages: Array<{ seq: number; sentAt: string; sender: "patient" | "provider" | "system"; text?: string; attachmentId?: string }>;
  attachments: StoredAttachment[];
};

export const patients: Record<string, { name: Name; visits: string[] }> = {
  "10482": { name: { en: "Layla Hassan", ar: "ليلى حسن" }, visits: ["2026-10-07", "2026-09-02", "2026-07-15", "2026-06-03"] },
  "10517": { name: { en: "Yousef Darwish", ar: "يوسف درويش" }, visits: ["2026-10-01", "2026-08-20"] },
  "10633": { name: { en: "Mariam Saleh", ar: "مريم صالح" }, visits: ["2026-09-28"] },
  "10790": { name: { en: "Khaled Ibrahim", ar: "خالد إبراهيم" }, visits: ["2026-10-19", "2026-10-14"] }
};

export function seedRecords(): StoredRecord[] {
  return [
    {
      recordId: "EMR-DOC-880011",
      recordName: "10482_2026-09-10_19-42",
      fileNumber: "10482",
      provider: { staffId: "ST-0193", name: "Dr. Sara Al-Mansour" },
      startedAt: "2026-09-10T19:42:00+03:00",
      endedAt: "2026-09-10T20:20:00+03:00",
      finishedBy: "provider",
      messages: [
        { seq: 1, sentAt: "2026-09-10T19:42:00+03:00", sender: "patient", text: "I started the new medication on Monday. I feel a bit nauseous in the mornings. Is that expected?" },
        { seq: 2, sentAt: "2026-09-10T20:03:00+03:00", sender: "provider", text: "Yes, mild nausea is common in the first one to two weeks. Take it with breakfast, and keep a short sleep diary for me until your next visit." },
        { seq: 3, sentAt: "2026-09-10T20:20:00+03:00", sender: "patient", text: "OK, I will. Thank you." }
      ],
      attachments: []
    },
    {
      recordId: "EMR-DOC-881245",
      recordName: "10482_2026-09-24_11-05",
      fileNumber: "10482",
      provider: { staffId: "ST-0207", name: "Omar Khalil" },
      startedAt: "2026-09-24T11:05:00+03:00",
      endedAt: "2026-09-24T11:57:00+03:00",
      finishedBy: "provider",
      messages: [
        { seq: 1, sentAt: "2026-09-24T11:05:00+03:00", sender: "patient", text: "I tried the thought record you gave me. Here is yesterday's." },
        { seq: 2, sentAt: "2026-09-24T11:57:00+03:00", sender: "provider", text: "Well done. Notice how the \"evidence against\" column brought your rating down from 90 to 60. We will build on that in our next session." }
      ],
      attachments: []
    }
  ];
}
