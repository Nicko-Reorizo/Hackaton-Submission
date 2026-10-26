# MyNaga API

Node 22+, Express 5, Mongoose, Firebase Admin authentication, and the requested `@google/generative-ai` SDK. The API starts only after MongoDB connects. No database, Firebase, or AI credentials are embedded in this repository.

## Run

1. From `backend/`, run `npm install`.
2. Copy `.env.example` to `.env` and fill in MongoDB, Firebase project/Admin credentials, LGU UID(s), Gemini key, and Cloudinary credentials. Follow [Cloudinary setup](../docs/CLOUDINARY_SETUP.md). Firebase Storage and billing setup are not needed.
3. Run `npm run dev` (or `npm start`). The default port is `4000` and host is `0.0.0.0`, allowing a phone on the same network to reach it.
4. `GET http://localhost:4000/api/health` returns `{ "status": "ok" }`. This endpoint has no authentication; report endpoints require Firebase tokens.

Run `npm test` for offline model validation, image handling, and HTTP authorization/route tests with injected database, Firebase, and AI dependencies. Tests do not contact live services.

## Required model availability change

The source defaults to `gemini-3.1-flash-lite`, verified with a real image-analysis request using the configured key. The brief's Gemini 1.5 Flash is retired, and Gemini 2.5 Flash is unavailable to new users. Set `GEMINI_MODEL` to override the model with another image-capable model available to your AI Studio account. The exact system prompt and strict JSON output contract remain unchanged. No fallback silently substitutes a category or pretends that analysis succeeded. Model access and free-tier quotas depend on the account. A 404 reports model availability; 429 and 503 report quota/capacity separately and no longer misleadingly mention 1.5 retirement.

Official references: [Google release notes](https://ai.google.dev/gemini-api/docs/changelog), [current deprecation schedule](https://ai.google.dev/gemini-api/docs/deprecations). The requested JavaScript SDK is a legacy SDK; it is deliberately retained to follow the brief.

## Authentication and LGU access

Enable **Anonymous** and **Email/Password** providers in the same Firebase project. The mobile app uses anonymous guest identities. Create officials' email/password accounts in Firebase Console; there is no public official registration endpoint.

Send `Authorization: Bearer <Firebase ID token>` on every report request. The server verifies the token and checks revocation via Firebase Admin. See [Firebase token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

An LGU account must sign in with email/password and must either have its UID in the server's comma-separated `LGU_ALLOWED_UIDS`, or carry the verified custom claim `lgu: true`. Email/password sign-in alone grants no report access. Custom claims must be set using Firebase Admin in a trusted environment; see [Firebase custom claims](https://firebase.google.com/docs/auth/admin/custom-claims). Sign in again after changing claims. The dashboard displays the Cloudinary delivery URLs returned by the API.

For Admin credentials, point `GOOGLE_APPLICATION_CREDENTIALS` at a service account JSON file kept outside the repository, or set `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`. On Google infrastructure, application default credentials may be used. Never place private keys in `VITE_*` or `EXPO_PUBLIC_*` variables.

## Endpoint contract

All request/response bodies are JSON. Dates are ISO 8601 strings; report `_id` is MongoDB's generated ObjectId string. Errors use `{ "error": { "message": "...", "code": "optional_machine_code" } }`.

| Method | Path | Authorization | Response |
| --- | --- | --- | --- |
| POST | `/api/reports/photo` | Anonymous citizen | `201 { "path": "...", "url": "https://res.cloudinary.com/..." }` |
| DELETE | `/api/reports/photo` | Anonymous citizen, own photo | `204`; preserves photos referenced by reports |
| POST | `/api/reports/analyze` | Anonymous citizen | AI JSON below |
| POST | `/api/reports` | Anonymous citizen, own UID | `201 { "report": { ... } }`; `200` for a retry of the same upload |
| GET | `/api/reports/my-reports/:uid` | Anonymous citizen, own UID | `{ "reports": [ ... ] }`, newest first |
| GET | `/api/reports/lgu` | Authorized LGU | `{ "reports": [ ... ] }`, newest first |
| PATCH | `/api/reports/:id/status` | Authorized LGU | `{ "report": { ... } }` |

Analyze accepts exactly one of:

```json
{ "image_base64": "<base64 JPEG>", "mime_type": "image/jpeg" }
```

```json
{ "image_url": "https://firebasestorage.googleapis.com/v0/b/your-bucket/o/reports%2Fguest-uid%2Fphoto.jpg?alt=media&token=..." }
```

Base64 data URIs are also supported. Analysis accepts JPEG, PNG, and WebP up to 8 MB decoded. The photo upload endpoint accepts JPEG and returns a URL in the configured Cloudinary cloud with a server-assigned citizen prefix; another citizen's prefix is rejected on report creation. Image URL fetches use HTTPS, exact configured hostnames, no redirects or credentials, a 15-second timeout, and a streamed size limit. `res.cloudinary.com` is included automatically. Legacy Firebase URLs remain supported; `FIREBASE_STORAGE_BUCKET` can constrain them if needed, but a Firebase bucket is not required.

Analyze returns:

```json
{
  "detected_category": "Public Infrastructure",
  "confidence_score": 0.95,
  "user_confirmation_prompt": "Our AI categorized this under 'Public Infrastructure'. Is this correct?"
}
```

Create accepts only the citizen-supplied fields below. Server-controlled `status`, timestamps, and `lgu_notes` cannot be mass assigned.

Each guest/upload URL pair can create only one report. Retrying the same submission after a lost response returns the existing report without changing its fields, notes, or status. A unique compound index enforces this for concurrent requests, and startup waits for index initialization. For an existing deployment, reconcile any duplicate `(reporter_uid, image_url)` pairs before starting this version; index creation will fail if duplicate records remain. This is an additive index migration; no schema fields are added and no records are deleted automatically.

```json
{
  "reporter_uid": "<current Firebase guest UID>",
  "image_url": "<Cloudinary delivery URL returned by the photo endpoint>",
  "description": "Optional description, at most 3000 characters",
  "ai_category": "Public Infrastructure",
  "location": { "latitude": 13.6248, "longitude": 123.1874 }
}
```

Status updates accept a required exact status (`Pending`, `Acknowledged`, `In Progress`, or `Resolved`) and optional `lgu_notes` of at most 5000 characters. Omitting notes preserves existing notes; an empty string clears them.

```json
{ "status": "Acknowledged", "lgu_notes": "Assigned to the city engineering office." }
```

`CORS_ORIGINS` permits explicit dashboard origins, comma separated. Native mobile clients do not send browser origins. Use an HTTPS API endpoint for deployed clients; localhost HTTP is for local development.
