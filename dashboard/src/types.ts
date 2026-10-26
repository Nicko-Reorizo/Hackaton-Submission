export const STATUSES = ['Pending', 'Acknowledged', 'In Progress', 'Resolved'] as const;
export type ReportStatus = (typeof STATUSES)[number];

export interface Report {
  _id: string;
  reporter_uid: string;
  image_url: string;
  description?: string;
  ai_category: string;
  location: { latitude: number; longitude: number };
  status: ReportStatus;
  lgu_notes?: string;
  createdAt: string;
  updatedAt: string;
}
