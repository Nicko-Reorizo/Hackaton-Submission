# API contract

Base URL: `http://localhost:4000`. All report routes require `Authorization: Bearer <Firebase ID token>`. JSON requests use `Content-Type: application/json`. Clients obtain fresh tokens through Firebase's `user.getIdToken()`.

Citizen routes accept both anonymous guest and email/password Firebase identities. Both can submit and track only their own issues. Citizen signup does not grant LGU access. See [citizen sessions and signup](CITIZEN_ACCOUNTS.md).

Successful reports contain the Mongoose `_id`, `reporter_uid`, `image_url`, `image_urls`, optional `description`, final `ai_category`, original `ai_suggested_category`, `lgu_id`, public `lgu` office/contact details, `can_edit`, `location`, `status`, optional `lgu_notes`/`acknowledgedAt`, `createdAt`, and `updatedAt`. Dates are ISO-8601 strings. A new report always starts as Pending. See [office/account and editing details](OFFICES_AND_REPORTS.md) for directory and administrator endpoints.

## Endpoints

| Method | Path | Access | Response |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | `{ "status": "ok" }` |
| POST | `/api/reports/photo` | Guest or registered citizen | `201 { "path": "...", "url": "..." }` |
| DELETE | `/api/reports/photo` | Guest or registered citizen, own photo | `204` |
| POST | `/api/reports/analyze` | Guest or registered citizen | Analysis object below |
| POST | `/api/reports` | Guest or registered citizen | `201 { "report": { ... } }` |
| GET | `/api/reports/my-reports/:uid` | Same verified citizen UID | `{ "reports": [ ... ] }` newest first |
| GET | `/api/reports/lgu` | Assigned LGU password user or administrator | `{ "reports": [ ... ], "counts": { ... }, "pagination": { ... } }` |
| PATCH | `/api/reports/:id/status` | Authorized LGU password user | `{ "report": { ... } }` |
| PATCH | `/api/reports/:id` | Owner, Pending and never acknowledged | `{ "report": { ... } }` |
| DELETE | `/api/reports/:id` | Owner, Pending and never acknowledged | `204` |

A repeated create request for the same verified citizen and uploaded image URL returns `200 { "report": { ... } }` with the existing report. A unique compound database index makes retries safe if the first response is lost. It preserves any LGU status/notes already saved.

## Analyze

Send base64 bytes, with MIME type, or an image URL:

```json
{
  "image_base64": "<base64-encoded JPEG bytes>",
  "mime_type": "image/jpeg"
}
```

```json
{ "image_url": "https://firebasestorage.googleapis.com/v0/b/your-bucket/o/reports%2Fuid%2Fphoto.jpg?alt=media&token=..." }
```

The mobile client sends base64 captured by Expo Camera; the saved report uses the Cloudinary delivery URL. URL analysis is restricted to configured HTTPS hosts, with timeout/size/type checks and redirects disabled.

The photo endpoint accepts `{ "image_base64": "...", "mime_type": "image/jpeg" }`, uploads server-side with private Cloudinary credentials, and returns `{ "path": "mynaga/reports/...", "url": "https://res.cloudinary.com/..." }`. Cleanup accepts `DELETE /api/reports/photo` with `{ "path": "<returned path>" }`. Both routes require a citizen Firebase token. Cleanup rejects foreign paths and preserves photos referenced by reports. New Cloudinary reports require the configured cloud and the verified citizen's upload prefix.

```json
{
  "is_valid_issue": true,
  "detected_category": "Public Infrastructure",
  "confidence_score": 0.95,
  "user_confirmation_prompt": "Our AI categorized this under 'Public Infrastructure'. Is this correct?"
}
```

The server validates Gemini's JSON, category, confidence range, and confirmation text before returning it. The API returns a service error if Gemini is unavailable or returns invalid output; it never invents a category when the model fails.

Photos with no clear civic issue return `422 { "error": { "code": "INVALID_ISSUE_IMAGE", "message": "..." } }`. They do not return a submit-ready classification. Legacy Unverified analysis is also treated as invalid; AI outages remain separate service errors.

Temporary Google 500/503 failures are retried up to twice on the server within 45 seconds. Continued capacity failure returns 503 `AI_BUSY`; quota exhaustion returns 429 `AI_QUOTA_EXCEEDED` without automatic retries. Retrying analysis uses the current draft photo; it does not create a report or another upload.

## Create report

```json
{
  "reporter_uid": "<authenticated citizen UID>",
  "image_url": "<original Cloudinary delivery URL from POST /api/reports/photo>",
  "image_urls": ["<original Cloudinary delivery URL>", "<optional additional owned photo URL>"],
  "description": "Optional citizen description",
  "ai_category": "Public Infrastructure",
  "ai_suggested_category": "Unverified",
  "lgu_id": "<receiving office ID from GET /api/lgu/offices>",
  "location": { "latitude": 13.6218, "longitude": 123.1948 }
}
```

`reporter_uid` must equal the verified token UID. `latitude` must be between -90 and 90 and `longitude` between -180 and 180. Status and LGU notes cannot be set by a citizen on creation.

`image_urls` accepts 1–5 unique owned URLs with `image_url` first; omitting it defaults to the original photo only. The receiving office must handle the final category. If `lgu_id` is omitted, the server can select it only when exactly one active office handles that category. Citizen edits accept description, final classification, office, and attachments; they preserve the original photo, GPS, and original AI suggestion. The first non-Pending status permanently locks citizen edits/deletion. Locked or racing updates return 409.

The LGU list accepts `page`, `page_size` (maximum 100), `status`, `category`, administrator `office_id`, and `q` (maximum 120 characters). Staff scope applies to both rows and counts. `pagination` contains `page`, `page_size`, `total`, and `total_pages`.

Valid categories:

```json
["City Services & Facilities", "Community Safety", "Waste Management", "Environment", "Public Infrastructure", "Veterinary", "Health", "Utilities", "Social Welfare"]
```

Unverified remains readable on historical reports, but cannot be used for a new submission or active office assignment.

## Update status and notes

```json
{
  "status": "In Progress",
  "lgu_notes": "Assigned to the road maintenance team."
}
```

`status` is one of `Pending`, `Acknowledged`, `In Progress`, `Resolved`. Omitting `lgu_notes` preserves the previous notes; sending an empty string clears them. IDs must be MongoDB ObjectIds.

## Errors

```json
{ "error": { "message": "You may only view your own reports." } }
```

Clients display `error.message`. Relevant HTTP codes include 400 (invalid input), 401 (missing/invalid authentication), 403 (wrong UID or missing LGU assignment), 404 (unknown report/route), 409 (locked/concurrently changed report), 413 (oversized payload), 422 (no clear civic issue), 429 (AI quota reached), and 5xx (database/AI service failure). No privileged API route trusts a UID or role sent in the request body.
