export const CATEGORIES = [
  'City Services & Facilities', 'Community Safety', 'Waste Management',
  'Environment', 'Public Infrastructure', 'Veterinary', 'Health',
  'Utilities', 'Social Welfare', 'Unverified',
] as const;
export const ISSUE_CATEGORIES = CATEGORIES.filter(category => category !== 'Unverified');

export type Category = typeof CATEGORIES[number];
export type ReportStatus = 'Pending' | 'Acknowledged' | 'In Progress' | 'Resolved';

export interface Office {
  _id: string; name: string; area: string; categories: Category[];
  phone: string; email: string; address: string; active: boolean;
}

export interface Report {
  _id: string;
  reporter_uid: string;
  image_url: string;
  image_urls: string[];
  description?: string;
  ai_category: Category;
  ai_suggested_category?: Category;
  lgu_id: string;
  lgu: Office | null;
  can_edit: boolean;
  acknowledgedAt?: string;
  location: { latitude: number; longitude: number };
  status: ReportStatus;
  lgu_notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Analysis {
  is_valid_issue: true;
  detected_category: Category;
  confidence_score: number;
  user_confirmation_prompt: string;
}

export interface ReportInput {
  reporter_uid: string;
  image_url: string;
  image_urls?: string[];
  description?: string;
  ai_category: Category;
  ai_suggested_category?: Category;
  lgu_id?: string;
  location: { latitude: number; longitude: number };
}
