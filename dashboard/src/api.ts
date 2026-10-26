import type { User } from 'firebase/auth';
import type { Office, Queue, Report, ReportStatus, Session, StaffAccount } from './types';

const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
export async function request<T>(user: User, path: string, options: RequestInit = {}): Promise<T> {
  const token = await user.getIdToken();
  let response: Response;
  try { response = await fetch(`${apiUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } }); }
  catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw error; throw new Error('Cannot reach the report service. Check your connection and try again.'); }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || 'The service could not complete this request.');
  if (!body) throw new Error('The service returned an invalid response.');
  return body as T;
}
export const getSession = async (user: User) => (await request<{ account: Session }>(user, '/api/lgu/me')).account;
export const getOffices = async (user: User, admin = false) => (await request<{ offices: Office[] }>(user, `/api/lgu/${admin ? 'admin/' : ''}offices`)).offices;
export const getAccounts = async (user: User) => (await request<{ accounts: StaffAccount[] }>(user, '/api/lgu/admin/accounts')).accounts;
export const getReports = (user: User, query: URLSearchParams, signal?: AbortSignal) => request<Queue>(user, `/api/reports/lgu?${query}`, { signal });
export const updateReport = async (user: User, id: string, status: ReportStatus, notes: string) => (await request<{ report: Report }>(user, `/api/reports/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, lgu_notes: notes }) })).report;
export const saveOffice = async (user: User, office: Omit<Office, '_id'>, id?: string) => (await request<{ office: Office }>(user, `/api/lgu/admin/offices${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(office) })).office;
export const saveAccount = (user: User, body: Record<string, unknown>, uid?: string) => request(user, `/api/lgu/admin/accounts${uid ? `/${encodeURIComponent(uid)}` : ''}`, { method: uid ? 'PATCH' : 'POST', body: JSON.stringify(body) });
