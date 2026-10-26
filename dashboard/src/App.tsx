import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { FirebaseError } from 'firebase/app';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { auth, configurationError } from './firebase';
import { getReports, updateReport } from './api';
import { STATUSES, type Report, type ReportStatus } from './types';

function Brand({ light = false }: { light?: boolean }) {
  return <div className={`brand ${light ? 'brand-light' : ''}`}>
    <span className="brand-mark" aria-hidden="true">n<span>↗</span></span>
    <div><span className="brand-name">MyNaga <span>1-Tap</span></span><span className="brand-caption">A little action. A better city.</span></div>
  </div>;
}

function Arrow({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <span className={className}>{children}<span aria-hidden="true"> ↗</span></span>;
}

function CityIllustration() {
  return <svg className="city-art" viewBox="0 0 560 280" fill="none" aria-hidden="true">
    <circle cx="420" cy="64" r="42" fill="#ecc58a" />
    <path d="M0 242C99 205 136 257 230 226C324 195 371 230 451 211C493 201 528 207 560 218V280H0Z" fill="#1e5147" />
    <path d="M27 240H534" stroke="#78a494" strokeWidth="2" />
    <path d="M182 239V128L269 85L356 128V239" fill="#d7e4d5" />
    <path d="M170 134L269 82L368 134" stroke="#d7e4d5" strokeWidth="8" strokeLinejoin="round" />
    <path d="M253 93V62H285V93" fill="#d7e4d5" />
    <path d="M269 62V41" stroke="#d7e4d5" strokeWidth="3" />
    <path d="M271 40H301L289 49H271Z" fill="#edac83" />
    <path d="M207 154H331" stroke="#123e38" strokeWidth="5" />
    <path d="M217 178V235M251 178V235M287 178V235M321 178V235" stroke="#123e38" strokeWidth="13" />
    <path d="M195 239H343M201 246H337" stroke="#d7e4d5" strokeWidth="4" />
    <path d="M64 237V183M133 237V165M416 237V175M490 237V184" stroke="#9bbba4" strokeWidth="5" />
    <path d="M64 139C32 174 35 204 64 205C94 204 96 173 64 139ZM133 120C100 157 103 186 133 188C164 186 165 155 133 120ZM416 128C381 165 385 195 416 197C448 195 449 164 416 128ZM490 143C461 177 463 206 490 207C518 206 520 175 490 143Z" fill="#6d977c" />
    <path d="M67 254C126 245 182 269 257 257C333 245 396 267 477 251" stroke="#386659" strokeWidth="3" strokeLinecap="round" />
    <path d="M353 69L362 64L370 69M112 72L120 68L129 72" stroke="#9cb9a8" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

function friendlyAuthError(error: unknown) {
  if (error instanceof FirebaseError) {
    if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password', 'auth/invalid-email'].includes(error.code)) {
      return 'The email or password is incorrect. Please try again.';
    }
    if (error.code === 'auth/too-many-requests') return 'Too many sign-in attempts. Please wait a moment before trying again.';
    if (error.code === 'auth/network-request-failed') return 'Cannot connect. Check your internet connection and try again.';
    if (error.code === 'auth/user-disabled') return 'This account has been disabled. Contact your administrator.';
    if (error.code === 'auth/operation-not-allowed') return 'Email/password sign-in is not enabled. Contact your administrator.';
    if (['auth/invalid-api-key', 'auth/api-key-not-valid.-please-pass-a-valid-api-key.'].includes(error.code)) {
      return 'The Firebase configuration is invalid. Check dashboard/.env and restart the dashboard.';
    }
  }
  return 'We could not sign you in. Please try again or contact your administrator.';
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!auth || busy) return;
    setBusy(true);
    setError('');
    try { await signInWithEmailAndPassword(auth, email.trim(), password); }
    catch (err) { setError(friendlyAuthError(err)); }
    finally { setBusy(false); }
  }

  return <main className="login-layout">
    <section className="login-story">
      <Brand light />
      <div className="story-content">
        <span className="eyebrow light-eyebrow"><span className="tiny-dot" /> CONNECTING OUR COMMUNITY</span>
        <h1>A better Naga<br />starts with <em>us.</em></h1>
        <p>Citizens report. Your team responds.<br />Turn everyday concerns into a safer,<br className="desktop-break" /> better cared-for city.</p>
        <CityIllustration />
        <div className="story-caption"><span>01 / SNAP</span><span>02 / CONFIRM</span><span>03 / RESPOND</span></div>
      </div>
      <span className="story-footer">MyNaga 1-Tap · Civic reporting</span>
    </section>
    <section className="login-form-panel" aria-label="LGU sign in">
      <span className="portal-label"><span className="tiny-dot" /> LGU PORTAL</span>
      <div className="login-form-wrap">
        <span className="eyebrow">HERE FOR OUR CITY</span>
        <h2>Welcome back.</h2>
        <p className="login-subtitle">Sign in to review and respond to citizen reports.</p>
        {configurationError && <div className="notice notice-warning" role="alert"><strong>Complete your setup</strong><p>{configurationError}</p></div>}
        <form onSubmit={submit} className="login-form">
          <label htmlFor="email">Email address</label>
          <input id="email" type="email" autoComplete="username" placeholder="you@your-lgu.gov.ph" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy || !auth} />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required disabled={busy || !auth} />
          {error && <p className="field-error" role="alert">{error}</p>}
          <button className="button button-primary login-submit" type="submit" disabled={busy || !auth}>
            {busy ? 'Signing in…' : <Arrow>Sign in to dashboard</Arrow>}
          </button>
        </form>
        <p className="account-note">For authorized LGU personnel.<br />Need access? Contact your account administrator.</p>
      </div>
      <p className="login-footer">Small reports. Meaningful change.</p>
    </section>
  </main>;
}

const statusStyles: Record<ReportStatus, string> = {
  Pending: 'pending', Acknowledged: 'acknowledged', 'In Progress': 'in-progress', Resolved: 'resolved',
};

function formatDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-PH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  }).format(parsed);
}

function ReportCard({ report, user, onUpdate, onBusyChange }: {
  report: Report;
  user: User;
  onUpdate: (report: Report) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [status, setStatus] = useState(report.status);
  const [notes, setNotes] = useState(report.lgu_notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const changed = status !== report.status || notes !== (report.lgu_notes || '');
  const shortId = report._id.slice(-6).toUpperCase();

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || !changed) return;
    setSaving(true);
    onBusyChange(true);
    setError('');
    try {
      const saved = await updateReport(user, report._id, status, notes);
      setNotes(saved.lgu_notes || '');
      setStatus(saved.status);
      onUpdate(saved);
    }
    catch (err) { setError(err instanceof Error ? err.message : 'The update could not be saved. Please try again.'); }
    finally { setSaving(false); onBusyChange(false); }
  }

  return <article className="report-card" aria-label={`Report ${shortId}: ${report.ai_category}`}>
    <div className="report-photo">
      {imageFailed ? <div className="image-fallback">Report photo unavailable</div> :
        <img src={report.image_url} alt={`Citizen photo for ${report.ai_category}`} loading="lazy" onError={() => setImageFailed(true)} />}
      <span className="report-reference">#{shortId}</span>
    </div>
    <div className="report-body">
      <h3>{report.ai_category}</h3>
      <time dateTime={report.createdAt} className="report-date">{formatDate(report.createdAt)} · PHT</time>
      {report.description && <p className="report-description">{report.description}</p>}
      <a className="location-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${report.location.latitude},${report.location.longitude}`)}`} target="_blank" rel="noreferrer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
        <Arrow>{report.location.latitude.toFixed(5)}, {report.location.longitude.toFixed(5)}</Arrow>
        <span className="sr-only"> Open in Google Maps in a new tab</span>
      </a>
      <form onSubmit={save} className="report-edit-form">
        <label htmlFor={`status-${report._id}`}>Status</label>
        <select id={`status-${report._id}`} value={status} onChange={e => setStatus(e.target.value as ReportStatus)} disabled={saving}>
          {STATUSES.map(value => <option key={value}>{value}</option>)}
        </select>
        <label htmlFor={`notes-${report._id}`}>LGU notes <span>Visible to the citizen</span></label>
        <textarea id={`notes-${report._id}`} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add an update for the citizen…" rows={3} maxLength={5000} disabled={saving} />
        {error && <p className="field-error" role="alert">{error}</p>}
        <button type="submit" className="button button-save" disabled={saving || !changed}>{saving ? 'Saving…' : 'Save changes'}<span aria-hidden="true">↗</span></button>
      </form>
    </div>
  </article>;
}

function Board({ user }: { user: User }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [saveCount, setSaveCount] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [signOutError, setSignOutError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getReports(user, controller.signal).then(result => {
      if (!controller.signal.aborted) setReports(result);
    }).catch(err => {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Reports could not be loaded. Please try again.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user, refreshKey]);

  function updated(next: Report) {
    setReports(current => current.map(report => report._id === next._id ? next : report));
    setAnnouncement(`Report ${next._id.slice(-6).toUpperCase()} saved as ${next.status}.`);
  }

  async function logOut() {
    if (!auth) return;
    setSignOutError('');
    try { await signOut(auth); }
    catch { setSignOutError('Could not sign out. Please try again.'); }
  }

  return <div className="dashboard-layout">
    <aside className="sidebar">
      <Brand light />
      <div className="sidebar-section-label">WORKSPACE</div>
      <div className="sidebar-nav-item" aria-current="page"><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2" y="3" width="4" height="14" rx="1"/><rect x="8" y="3" width="4" height="9" rx="1"/><rect x="14" y="3" width="4" height="12" rx="1"/></svg> Report triage <span>{reports.length}</span></div>
      <div className="sidebar-bottom"><span className="tiny-dot" /> MADE FOR A BETTER NAGA<p>One report at a time.</p></div>
    </aside>
    <div className="dashboard-main">
      <header className="topbar"><span className="topbar-title">LGU Dashboard <span>/</span> <strong>Report triage</strong></span><div className="account"><div className="account-avatar" aria-hidden="true">{(user.email || 'L').charAt(0).toUpperCase()}</div><span className="account-email">{user.email || 'LGU account'}</span><button className="signout-button" onClick={logOut} disabled={saveCount > 0}>Sign out</button></div></header>
      <main className="board-main">
        <div className="board-heading"><div><span className="eyebrow">CITY OPERATIONS</span><h1>Report triage<span className="heading-dot">.</span></h1><p>Keep citizen concerns moving toward a resolution.</p></div><button className="button button-secondary" onClick={() => { setAnnouncement(''); setRefreshKey(key => key + 1); }} disabled={loading || saveCount > 0}><span aria-hidden="true">↻</span> {loading ? 'Refreshing…' : 'Refresh reports'}</button></div>
        <div className="board-meta"><span><strong>{reports.length}</strong> citizen {reports.length === 1 ? 'report' : 'reports'}</span><span>Latest submissions first <span aria-hidden="true">↓</span></span></div>
        <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
        {announcement && <p className="save-notice">✓ {announcement}</p>}
        {signOutError && <p className="notice notice-error" role="alert">{signOutError}</p>}
        {error && <div className="notice notice-error" role="alert"><strong>Reports could not be refreshed</strong><p>{error}</p><button className="text-button" onClick={() => setRefreshKey(key => key + 1)} disabled={saveCount > 0}>Try again ↗</button></div>}
        {loading ? <div className="board-loading" role="status"><span className="spinner" /> Loading citizen reports…</div> :
          <div className="kanban" role="region" aria-label="Reports by status" tabIndex={0}>
            {STATUSES.map(status => <section className={`kanban-column ${statusStyles[status]}`} key={status} aria-label={`${status} reports`}>
              <header className="column-heading"><span className="status-dot" /><h2>{status}</h2><span className="column-count">{reports.filter(report => report.status === status).length}</span></header>
              <div className="column-body">
                {reports.filter(report => report.status === status).map(report => <ReportCard report={report} user={user} key={report._id} onUpdate={updated} onBusyChange={busy => setSaveCount(value => value + (busy ? 1 : -1))} />)}
                {!reports.some(report => report.status === status) && <div className="column-empty"><span aria-hidden="true">{status === 'Resolved' ? '✓' : '—'}</span><p>No {status.toLowerCase()} reports</p><small>{status === 'Pending' ? 'New citizen reports will appear here.' : status === 'Resolved' ? 'Completed reports will appear here.' : `Reports marked ${status.toLowerCase()} will appear here.`}</small></div>}
              </div>
            </section>)}
          </div>}
        <footer className="board-footer">MyNaga 1-Tap <span>Good city care starts with listening.</span></footer>
      </main>
    </div>
  </div>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(Boolean(auth));

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, next => { setUser(next); setInitializing(false); });
  }, []);

  if (initializing) return <main className="auth-loading"><Brand /><p role="status"><span className="spinner" /> Opening your workspace…</p></main>;
  return user ? <Board key={user.uid} user={user} /> : <Login />;
}
