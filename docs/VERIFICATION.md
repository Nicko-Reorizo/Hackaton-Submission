# Verification checklist

## Results in this checkout — 27 October 2026

| Check | Result |
| --- | --- |
| Root `npm run check` | Passed |
| Backend offline API/model/image/Cloudinary/workflow tests | 43 passed, including bounded capacity retries, quota distinction, registered/guest ownership, invalid-photo rejection, archive migration, office isolation, attachment ownership, and acknowledgment races |
| Citizen app TypeScript | Passed |
| Citizen confirmation flow | 6 tests passed for three-photo correction gate, explicit comment choice, skipping old text, and reset for a new issue |
| Citizen authentication flow | 7 tests passed for guest reuse, signup linking, existing-account login, validation, and failed-link preservation; Firebase operations injected |
| Expo SDK dependency compatibility (offline) | Up to date against bundled SDK metadata |
| Android production export | Generated Hermes bundle and metadata in `mobile/dist/android` after attachment changes |
| Expo SDK 58 for iPhone | TypeScript 6 checking passed; iOS export passed (684 modules) with the KitaKo PNG wordmark; Hermes bundle and asset metadata generated in `mobile/dist` |
| LGU TypeScript and Vite production build | Passed; generated `dashboard/dist` |
| Local dashboard HTTP readiness | HTTP 200 |
| Browser visual inspection | Passed against the signed-in local administrator: KitaKo SVG wordmark, navy/yellow branding, request table, office/contact editor, account editor, and keyboard focus trap; latest screenshot in `artifacts/kitako-dashboard.png` |
| Branding assets | Original SVGs preserved; transparent web/native derivatives exported and inspected; native launcher/adaptive icons configured |
| Real Firebase, MongoDB, Gemini round trip | Unverified; service configuration/credentials required |
| Configured service connectivity | Firebase Admin/LGU account, MongoDB connection, and Cloudinary upload/cleanup passed during guided setup |
| Live Gemini image analysis | Confirmed 3.1 Flash-Lite returned provider 503. Switched to available 3.5 Flash-Lite: live request returned 200 with `is_valid_issue: false` for the blank test image; complete analyzer correctly returned 422 `INVALID_ISSUE_IMAGE` |
| Camera/GPS/native upload on device | Unverified; configured device required |
| Additive office migration | Live read confirmed 9 active desks, 1 inactive archive, 3 reports, and 0 unassigned reports; migration also covered by a regression test |

Installed dependencies and generated builds are ignored by Git. Each app's lockfile is included. Sandbox file restrictions required running the build tools outside the sandbox in this environment; normal local runs use the documented npm commands.

## Automated checks

Run `npm run check` from the repository root after installing dependencies. This runs backend tests, mobile report-flow tests and TypeScript checking, and the dashboard production build. Backend tests inject token, database, and Gemini boundaries; passing them does not establish connectivity to real services.

## Service configuration

- [ ] MongoDB is running and the backend connects successfully.
- [ ] All three apps point to the same Firebase project.
- [ ] Firebase Anonymous and Email/Password providers are enabled.
- [ ] Backend Cloudinary cloud name, API key, and API secret are set. No Firebase Storage bucket or Blaze upgrade is required.
- [ ] The administrator password user's UID is in `LGU_ALLOWED_UIDS`; staff have an active office/category assignment. A role claim alone does not grant access.
- [ ] `GEMINI_MODEL` is an available image-capable model. The requested Gemini 1.5 Flash has been retired.
- [ ] The backend starts with a server-only Gemini API key and Firebase Admin credentials.
- [ ] The dashboard's origin matches `CORS_ORIGINS`.
- [ ] The mobile device can reach the configured API URL over the LAN or HTTPS.

## Citizen workflow on a physical device

1. Launch the app and verify Log in / Sign up / Continue as Guest. Continue as Guest, submit a valid issue, then restart the app and continue as the same guest. Confirm the report remains in My reports. Create an account from this guest and confirm the same history remains. Sign out/in and verify registered-account tracking. A separate account must not see those reports.
2. Deny camera permission; confirm the app explains how to allow it. Allow camera access and return.
3. Deny location permission; confirm capture cannot submit without coordinates. Allow location and retry.
4. Photograph a civic issue. Confirm the app obtains GPS, uploads a JPEG through the backend to Cloudinary under `mynaga/reports/<hashed-uid>/`, and displays Gemini's confirmation prompt.
5. Tap **No, Retake**. Confirm no MongoDB report was created and the camera is ready again.
6. Verify the classification picker is hidden. Take/choose three photos for the same issue, rejecting each with **No, Retake**. The third rejection should offer **Choose classification** or **Retake photo**. Choose a classification and check the eligible receiving office updates. Analysis/network retries and extra attachments must not unlock the picker. Attach extra pictures (up to five total).
7. Tap **Yes, Submit**: confirm the comment question appears before any report is created. Choose **Yes, add a comment**, enter a description, and submit. Repeat with another issue using **No, submit now** and confirm its description is empty. Confirm the next issue starts with the picker hidden.
8. Open My Reports. Confirm the report has Pending status, the correct photo/category, and date. Classification must be displayed without an editing control.
9. Close/reopen the app. Confirm the UID and report history persist.
10. Disconnect the network during analysis/submission. Confirm an actionable error appears, and retry/recovery works without a false success.
11. Repeat a submission using the same uploaded image URL. Confirm the API returns the existing report and does not reset its status or notes. After an ambiguous submission error, retaking must preserve any photo a saved report may reference.
12. Try **Choose from pictures** and verify library selection and JPEG preparation on the iPhone. Confirm GPS uses the current location.
13. Edit a Pending report's description/office/attachments and refresh. Delete another Pending report through the confirmation dialog. After acknowledgment, confirm Edit/Delete are unavailable and the API rejects direct attempts.
14. Check receiving-office details; after verified contacts are entered, try Call/Email on the phone.
15. Try blank, blurry, and unrelated primary photos: confirm an invalid-photo/retake message, no confirmation/submit controls, and no new report. Invalid photos must never reach manual classification, even after three attempts. Confirm real AI capacity/quota errors remain retryable service errors.

## LGU workflow

1. Sign in with incorrect credentials; confirm a readable error without revealing secret credentials.
2. Sign in with a password user without an administrator UID or active assignment; confirm the API returns 403 and reports are not displayed.
3. Sign in as an assigned official. Confirm only their office/categories appear in rows and counts. Try status tabs, search, classification filters, and pagination.
4. Open **Review** and check all pictures, description, category, office, date, GPS coordinates, and Google Maps link.
5. Change Pending → Acknowledged, enter a note, and save. Confirm the row leaves Pending and values survive refresh.
6. Change the status to In Progress, then Resolved. Confirm persistence after each save.
7. Refresh My Reports on the citizen device. Confirm the final status and LGU notes appear.
8. As administrator, enter verified public contacts under **LGU offices**. Create/link staff under **Office accounts**, choose office/category scope, and verify with that separate login. Do not create disposable accounts in the live project solely for automated tests.
9. Sign out. Confirm the login form replaces the workspace.

## API isolation checks

- [ ] Missing/invalid Firebase token returns 401 on every report route.
- [ ] Citizen A cannot query Citizen B's UID or submit under that UID.
- [ ] An anonymous citizen cannot list all reports or patch a status.
- [ ] Invalid categories, out-of-range coordinates, invalid ObjectIds/statuses, and malformed AI JSON are rejected.
- [ ] Image URLs on an unapproved host, redirecting URLs, non-image content, and oversized images are rejected.
- [ ] Frontend bundles contain no Gemini key or Firebase service account private key.

Actual external-service, camera, GPS, and native upload verification requires the above configured accounts and a device. No preview mode skips authentication or inserts sample reports.

## iPhone development prerequisites

- [ ] Install/update the App Store Expo Go build supporting SDK 58 (Apple lookup returned Expo Go 58.0.5 with SDK 58 support on 26 October 2026).
- [ ] Create/sign into a free Expo account on the phone.
- [ ] Run `npx expo login` in `mobile/` yourself if needed and use the same Expo account as the phone.
- [ ] Keep phone/computer on the same reachable Wi-Fi, allow local-network access if prompted, and scan the development QR using the iPhone Camera app.
- [ ] Test native camera/GPS and one real report submission; iOS JavaScript bundling does not verify these hardware or service operations.
