# MyNaga 1-Tap

A two-sided civic reporting MVP. Citizens take a photo, confirm an AI category, and follow their report. LGU officials sign in to review reports, change status, and leave notes.

## Project layout

```text
backend/     Node.js + Express + Mongoose API, Firebase Admin, Gemini
mobile/      React Native + Expo citizen app, Firebase anonymous auth
dashboard/   React + Vite + Tailwind LGU dashboard, Firebase email/password auth
firebase/    Legacy Firebase Storage rules (not needed for Cloudinary)
docs/        API contract and manual verification checklist
```

Each application has its own package manifest and lockfile; dependencies are intentionally installed separately for Expo compatibility.

## 1. Prerequisites

- Node.js **22.13 or newer** and npm.
- A reachable MongoDB instance (local MongoDB or Atlas).
- A Firebase project with **Anonymous** and **Email/Password** authentication enabled and a registered web app. No Firebase Storage bucket or Blaze upgrade is needed.
- A Cloudinary Free Image & Video API account for photo storage.
- A Firebase service account for the backend, and an email/password Firebase user for an LGU official.
- A Google Gemini API key and a model available to that key.
- A physical Android/iOS device with Expo Go supporting SDK 58, or an emulator/development build. On an iPhone, sign into the same free Expo account in Expo Go and Expo CLI (`npx expo login` from `mobile/`). Camera and GPS must be tested on a device.

**Gemini availability:** The brief requests the `@google/generative-ai` SDK and Gemini 1.5 Flash. The code preserves that SDK and exact system prompt, but uses `gemini-3.1-flash-lite` because 1.5 is retired and 2.5 is unavailable to new users. A live image classification test passed with the configured key. `GEMINI_MODEL` remains configurable; select an image-capable model available to your account. Free-tier quotas still apply. There is no substitute classifier or fake response. See [Google's model availability notice](https://firebase.google.com/docs/ai-logic/faq-and-troubleshooting) and [model lifecycle documentation](https://ai.google.dev/gemini-api/docs/deprecations).

## 2. Install

From this directory:

```powershell
npm run setup
```

This runs `npm install` separately inside `backend`, `mobile`, and `dashboard`. Use `npm run setup:ci` for repeatable installs from the checked-in lockfiles.

## 3. Configure Firebase and environment files

Copy the three examples, then fill in your values:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item mobile/.env.example mobile/.env
Copy-Item dashboard/.env.example dashboard/.env
```

Use the **same Firebase project** for all three applications. Public Firebase web configuration belongs in the frontend environment files. The service account and Gemini key belong only in the backend environment. Never copy server secrets into an `EXPO_PUBLIC_` or `VITE_` variable.

1. Enable Anonymous and Email/Password providers in Firebase Authentication.
2. Create the LGU user's email/password in the Firebase console. Add that user's UID to the backend's `LGU_ALLOWED_UIDS`, or grant the user the `lgu: true` custom claim with Firebase Admin. Creating a password account alone does not grant LGU access.
3. Configure Firebase Admin service account credentials as described in [backend/README.md](backend/README.md).
4. Follow [Cloudinary setup](docs/CLOUDINARY_SETUP.md) and set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `backend/.env`. No upload preset or Firebase Storage setup is required.
5. Configure MongoDB, the Gemini API key/model, allowed browser origin, and frontend API URLs. See each application's README for the exact variables.

Photos are uploaded to Cloudinary through an authenticated backend endpoint. The server assigns each guest a photo prefix derived from their verified UID, signs uploads with its private Cloudinary credentials, and returns the delivery URL. No Cloudinary secrets are included in the mobile app. Retakes remove unsubmitted photos best-effort; saved report images are preserved. Delivery URLs can be viewed by anyone who has the link.

## 4. Run the backend

```powershell
npm run dev:api
```

The API listens on port 4000 by default. Start MongoDB first. Startup validates its required server configuration and connects to MongoDB before accepting requests. API details: [docs/API.md](docs/API.md).

## 5. Run the citizen app

In another terminal:

```powershell
npm run dev:mobile
```

Scan the Expo QR code on a compatible device. Set `EXPO_PUBLIC_API_URL` to the backend computer's **LAN IP**, such as `http://192.168.1.10:4000`; a phone's `localhost` points to the phone. The phone and computer must be on the same reachable network. Android Emulator normally reaches the host at `10.0.2.2`; iOS Simulator can use host `localhost`. Allow the API port through your local firewall if needed.

For an iPhone, install/update Expo Go from the App Store, sign in there and in Expo CLI using the same Expo account, then scan the development QR code using the iPhone Camera app. The citizen app itself still uses an automatic Firebase guest session. See [the iPhone guide](mobile/README.md#open-on-an-iphone).

The app signs in anonymously, captures a photo and GPS location, uploads the image, requests AI analysis, and asks for confirmation. **Yes, Submit** saves the report; **No, Retake** returns to the camera. My Reports displays the authenticated citizen's reports, status, and LGU notes. Anonymous identity persists on the device; clearing app data or uninstalling can lose access to that identity.

Full mobile setup: [mobile/README.md](mobile/README.md).

## 6. Run the LGU dashboard

In a third terminal:

```powershell
npm run dev:dashboard
```

Open the Vite URL (normally `http://localhost:5173`) and sign in with the authorized LGU user's email/password. The four columns are Pending, Acknowledged, In Progress, and Resolved. Each report shows its image, category, date, and a Google Maps coordinate link. Change the status and notes, then save.

Full dashboard setup: [dashboard/README.md](dashboard/README.md).

## Verification

```powershell
npm run check
```

Runs backend tests, mobile TypeScript checking, and the dashboard production build (including TypeScript checking). No real Firebase, Gemini, or MongoDB account is used by unit/API tests. Run [docs/VERIFICATION.md](docs/VERIFICATION.md) with configured services to verify the full flow and device permissions.

## Access and data handling

Every report API route verifies a Firebase bearer ID token. Citizen access is tied to the verified UID; a client cannot read another citizen's reports by changing a URL parameter. LGU endpoints require a password-authenticated account and either the `lgu: true` claim or a configured UID allowlist. The Gemini key stays on the server. Inputs, categories, coordinates, image size/type, and status values are validated server-side. The API only fetches images from configured HTTPS hosts and refuses redirects.

This MVP uses explicit refreshes in the dashboard and citizen report list. It does not include push notifications, realtime subscriptions, duplicate detection, or deployment infrastructure.
