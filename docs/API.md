# API contract

Base URL: `http://localhost:4000`. All report routes require `Authorization: Bearer <Firebase ID token>`. JSON requests use `Content-Type: application/json`. Clients obtain fresh tokens through Firebase's `user.getIdToken()`.

Successful reports contain the Mongoose `_id`, `reporter_uid`, `image_url`, optional `description`, `ai_category`, `location`, `status`, optional `lgu_notes`, `createdAt`, and `updatedAt`. Dates are ISO-8601 strings. A new report always starts as Pending.

## Endpoints

| Method | Path | Access | Response |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | `{ "status": "ok" }` |
| POST | `/api/reports/photo` | Anonymous citizen | `201 { "path": "...", "url": "..." }` |
| DELETE | `/api/reports/photo` | Anonymous citizen, own photo | `204` |
| POST | `/api/reports/analyze` | Anonymous citizen | Analysis object below |
| POST | `/api/reports` | Anonymous citizen | `201 { "report": { ... } }` |
| GET | `/api/reports/my-reports/:uid` | Same anonymous UID | `{ "reports": [ ... ] }` newest first |
| GET | `/api/reports/lgu` | Authorized LGU password user | `{ "reports": [ ... ] }` newest first |
| PATCH | `/api/reports/:id/status` | Authorized LGU password user | `{ "report": { ... } }` |

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
  "detected_category": "Public Infrastructure",
  "confidence_score": 0.95,
  "user_confirmation_prompt": "Our AI categorized this under 'Public Infrastructure'. Is this correct?"
}
```

The server validates Gemini's JSON, category, confidence range, and confirmation text before returning it. The API returns a service error if Gemini is unavailable or returns invalid output; it never invents a category when the model fails.

## Create report

```json
{
  "reporter_uid": "<authenticated citizen UID>",
  "image_url": "<Cloudinary delivery URL from POST /api/reports/photo>",
  "description": "Optional citizen description",
  "ai_category": "Public Infrastructure",
  "location": { "latitude": 13.6218, "longitude": 123.1948 }
}
```

`reporter_uid` must equal the verified token UID. `latitude` must be between -90 and 90 and `longitude` between -180 and 180. Status and LGU notes cannot be set by a citizen on creation.

Valid categories:

```json
["City Services & Facilities", "Community Safety", "Waste Management", "Environment", "Public Infrastructure", "Veterinary", "Health", "Utilities", "Social Welfare", "Unverified"]
```

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

Clients display `error.message`. Relevant HTTP codes include 400 (invalid input), 401 (missing/invalid authentication), 403 (wrong UID or missing LGU role), 404 (unknown report/route), 413 (oversized payload), and 5xx (database/AI service failure). No privileged API route trusts a UID or role sent in the request body.
