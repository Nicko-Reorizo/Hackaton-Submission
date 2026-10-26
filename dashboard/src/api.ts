import type { User } from 'firebase/auth';
import type { Report, ReportStatus } from './types';

const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

async function request<T>(user: User, path: string, options: RequestInit = {}): Promise<T> {
  const token = await user.getIdToken();
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Cannot reach the report service. Check your connection and the API URL, then try again.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('This account does not have LGU access. Ask your administrator to grant LGU access to this account.');
    }
    throw new Error(body?.error?.message || (response.status === 401
      ? 'Your session could not be verified. Sign out and sign in again.'
      : 'The report service could not complete this request. Please try again.'));
  }
  if (!body || typeof body !== 'object') throw new Error('The report service returned an invalid response.');
  return body as T;
}

export async function getReports(user: User, signal?: AbortSignal) {
  const result = await request<{ reports: Report[] }>(user, '/api/reports/lgu', { signal });
  if (!Array.isArray(result.reports)) throw new Error('The report service returned an invalid report list.');
  return result.reports;
}

export async function updateReport(user: User, id: string, status: ReportStatus, notes: string) {
  const result = await request<{ report: Report }>(user, `/api/reports/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, lgu_notes: notes }),
  });
  if (!result.report?._id) throw new Error('The report service returned an invalid report. Refresh to check whether the update was saved.');
  return result.report;
}
