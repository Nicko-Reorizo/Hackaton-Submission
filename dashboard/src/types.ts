export const STATUSES = ['Pending', 'Acknowledged', 'In Progress', 'Resolved'] as const;
export type ReportStatus = typeof STATUSES[number];
export const CATEGORIES = ['City Services & Facilities', 'Community Safety', 'Waste Management', 'Environment', 'Public Infrastructure', 'Veterinary', 'Health', 'Utilities', 'Social Welfare', 'Unverified'] as const;
export const ISSUE_CATEGORIES = CATEGORIES.filter(category => category !== 'Unverified');
export interface Office { _id: string; name: string; area: string; categories: string[]; phone: string; email: string; address: string; active: boolean }
export interface StaffAccount { _id: string; name: string; email: string; office_id: string; categories: string[]; active: boolean }
export interface Session { role: 'admin' | 'official'; name: string; office: Office | null; categories: string[] }
export interface Report {
  _id: string; reporter_uid: string; image_url: string; image_urls: string[]; description?: string;
  ai_category: string; ai_suggested_category?: string; lgu_id: string; lgu: Office | null;
  location: { latitude: number; longitude: number }; status: ReportStatus; lgu_notes?: string;
  createdAt: string; updatedAt: string; acknowledgedAt?: string; can_edit: boolean;
}
export interface Queue { reports: Report[]; counts: Record<ReportStatus, number>; pagination: { page: number; page_size: number; total: number; total_pages: number } }
