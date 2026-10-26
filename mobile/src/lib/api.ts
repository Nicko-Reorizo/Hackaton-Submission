import type { User } from 'firebase/auth';
import { apiUrl } from './config';
import { CATEGORIES, type Analysis, type Report, type ReportInput } from '../types';

export async function request<T>(user: User, path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const token = await user.getIdToken();
    const response = await fetch(`${apiUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (response.status === 204) return undefined as T;
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message ?? `Request failed (${response.status}). Please try again.`);
    if (!data) throw new Error('The server returned an empty response. Please try again.');
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The server took too long to respond. Please try again.');
    if (error instanceof TypeError) throw new Error('Cannot reach MyNaga. Check your internet connection and the API address.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function analyzePhoto(user: User, base64: string): Promise<Analysis> {
  const analysis = await request<Analysis>(user, '/api/reports/analyze', { image_base64: base64, mime_type: 'image/jpeg' });
  if (!CATEGORIES.includes(analysis.detected_category) || typeof analysis.user_confirmation_prompt !== 'string' || !Number.isFinite(analysis.confidence_score)) {
    throw new Error('We could not read the image classification. Please retake the photo.');
  }
  return analysis;
}

export async function submitReport(user: User, input: ReportInput): Promise<Report> {
  const { report } = await request<{ report: Report }>(user, '/api/reports', input);
  return report;
}

export async function fetchMyReports(user: User): Promise<Report[]> {
  const { reports } = await request<{ reports: Report[] }>(user, `/api/reports/my-reports/${encodeURIComponent(user.uid)}`);
  if (!Array.isArray(reports)) throw new Error('We could not load your reports. Please try again.');
  return reports;
}
