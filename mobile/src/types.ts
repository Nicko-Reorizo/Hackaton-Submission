export const CATEGORIES = [
  'City Services & Facilities', 'Community Safety', 'Waste Management',
  'Environment', 'Public Infrastructure', 'Veterinary', 'Health',
  'Utilities', 'Social Welfare', 'Unverified',
] as const;

export type Category = typeof CATEGORIES[number];
export type ReportStatus = 'Pending' | 'Acknowledged' | 'In Progress' | 'Resolved';

export interface Report {
  _id: string;
  reporter_uid: string;
  image_url: string;
  description?: string;
  ai_category: Category;
  location: { latitude: number; longitude: number };
  status: ReportStatus;
  lgu_notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Analysis {
  detected_category: Category;
  confidence_score: number;
  user_confirmation_prompt: string;
}

export interface ReportInput {
  reporter_uid: string;
  image_url: string;
  description?: string;
  ai_category: Category;
  location: { latitude: number; longitude: number };
}
