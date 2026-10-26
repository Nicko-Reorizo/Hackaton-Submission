export const CATEGORIES = Object.freeze([
  'City Services & Facilities',
  'Community Safety',
  'Waste Management',
  'Environment',
  'Public Infrastructure',
  'Veterinary',
  'Health',
  'Utilities',
  'Social Welfare',
  'Unverified',
]);

export const STATUSES = Object.freeze(['Pending', 'Acknowledged', 'In Progress', 'Resolved']);

// Keep this system instruction identical to the product brief.
export const AI_SYSTEM_PROMPT = `You are an AI Triage Assistant for the MyNaga civic reporting app. Classify the civic issue in the image into one of these exact categories: 'City Services & Facilities', 'Community Safety', 'Waste Management', 'Environment', 'Public Infrastructure', 'Veterinary', 'Health', 'Utilities', 'Social Welfare', 'Unverified'. 
Output strictly as a JSON object matching this schema without markdown blocks:
{
  "detected_category": "Exact Category Name",
  "confidence_score": 0.95,
  "user_confirmation_prompt": "Our AI categorized this under '[Category]'. Is this correct?"
}`;

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
