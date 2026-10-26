# LGU dashboard

React + Vite + TypeScript + Tailwind CSS. This is the email/password LGU side of MyNaga 1-Tap.

## Run locally

Use Node.js 22.12 or newer. From this directory:

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Fill in `.env` with the Firebase **web app** configuration from Firebase Console → Project settings. These public client identifiers are different from the server's service-account credentials. Never put a service-account private key in a `VITE_` environment variable. `VITE_API_URL` is the API origin without `/api`, for example `http://localhost:4000`.

The dev server uses `http://localhost:5173`. Add this origin to the backend's CORS allowlist. Vite reads environment variables at startup; restart after editing `.env`. Missing Firebase configuration displays a setup notice instead of attempting to sign in.

## Create an LGU account

1. Enable **Email/Password** in Firebase Authentication → Sign-in method.
2. Create an email/password user in Firebase Authentication → Users.
3. Authorize this user's UID on the backend with the `lgu: true` custom claim or the `LGU_ALLOWED_UIDS` environment variable described in the backend README.
4. Ensure `localhost` (or your deployed dashboard domain) is an authorized Firebase Authentication domain.

The API verifies the Firebase ID token and LGU role for every request. Creating an email/password account alone does not grant dashboard access. If a role claim was just granted, sign out and back in to refresh the token.

## Workflow

Sign in, review reports across **Pending**, **Acknowledged**, **In Progress**, and **Resolved**, then choose a status and enter optional LGU notes. **Save changes** persists both fields and moves the card to its corresponding column. Notes appear in the citizen's My Reports feed. An empty notes field clears existing notes. Coordinates open the exact location in Google Maps; report dates are displayed in Philippine time. Use **Refresh reports** to fetch new submissions. The board is horizontally scrollable on smaller screens.

The dashboard uses the real backend and contains no sample reports or authentication bypass. Login, network, access, image-loading, and save failures have visible error states. Failed saves preserve the draft for another attempt. Signing out and refreshing are disabled while a save is in flight.

## Verify and build

```powershell
npm run typecheck
npm run build
npm run preview
```

`build` checks TypeScript and creates `dist/`. Host that directory on static hosting and configure its origin in both Firebase and backend CORS. Environment variables are embedded at build time. No SPA fallback is necessary because the app has a single URL.

## Source map

- `src/firebase.ts`: guarded Firebase initialization.
- `src/api.ts`: authenticated API requests and error handling.
- `src/App.tsx`: auth state, login, Kanban, report updates.
- `src/types.ts`: report/status types.
- `src/styles.css`: Tailwind import and responsive visual styles.

Implementation references: [Vite](https://vite.dev/guide/), [Tailwind Vite setup](https://tailwindcss.com/docs/installation/using-vite), [Firebase email/password authentication](https://firebase.google.com/docs/auth/web/password-auth).
