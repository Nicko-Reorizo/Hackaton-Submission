# Verification checklist

## Results in this checkout — 26 October 2026

| Check | Result |
| --- | --- |
| Root `npm run check` | Passed |
| Backend offline API/model/image/Cloudinary tests | 25 passed including model-error regression coverage |
| Citizen app TypeScript | Passed |
| Expo SDK dependency compatibility (offline) | Up to date against bundled SDK metadata |
| Android production export | Passed after SDK 58 upgrade; 667 modules, Hermes bundle generated in `mobile/dist/android` |
| Expo SDK 58 upgrade for iPhone | TypeScript 6 checking passed; iOS export passed (669 modules), generated in `mobile/dist`; dependency versions aligned with Expo Doctor |
| LGU TypeScript and Vite production build | Passed; generated `dashboard/dist` |
| Local dashboard HTTP readiness | HTTP 200 |
| Browser visual inspection | Unverified; computer-use helper stopped because it could not verify the current browser URL |
| Real Firebase, MongoDB, Gemini round trip | Unverified; service configuration/credentials required |
| Configured service connectivity | Firebase Admin/LGU account, MongoDB connection, and Cloudinary upload/cleanup passed during guided setup |
| Live Gemini image analysis | Passed with `gemini-3.1-flash-lite` on a generated blank image; returned valid Unverified JSON |
| Camera/GPS/native upload on device | Unverified; configured device required |

Installed dependencies and generated builds are ignored by Git. Each app's lockfile is included. Sandbox file restrictions required running the build tools outside the sandbox in this environment; normal local runs use the documented npm commands.

## Automated checks

Run `npm run check` from the repository root after installing dependencies. This runs backend tests, mobile TypeScript checking, and the dashboard production build. Backend tests inject token, database, and Gemini boundaries; passing them does not establish connectivity to real services.

## Service configuration

- [ ] MongoDB is running and the backend connects successfully.
- [ ] All three apps point to the same Firebase project.
- [ ] Firebase Anonymous and Email/Password providers are enabled.
- [ ] Backend Cloudinary cloud name, API key, and API secret are set. No Firebase Storage bucket or Blaze upgrade is required.
- [ ] The LGU email/password user's UID is in `LGU_ALLOWED_UIDS`, or its token has `lgu: true`.
- [ ] `GEMINI_MODEL` is an available image-capable model. The requested Gemini 1.5 Flash has been retired.
- [ ] The backend starts with a server-only Gemini API key and Firebase Admin credentials.
- [ ] The dashboard's origin matches `CORS_ORIGINS`.
- [ ] The mobile device can reach the configured API URL over the LAN or HTTPS.

## Citizen workflow on a physical device

1. Launch the app. Confirm Firebase creates an anonymous user.
2. Deny camera permission; confirm the app explains how to allow it. Allow camera access and return.
3. Deny location permission; confirm capture cannot submit without coordinates. Allow location and retry.
4. Photograph a civic issue. Confirm the app obtains GPS, uploads a JPEG through the backend to Cloudinary under `mynaga/reports/<hashed-uid>/`, and displays Gemini's confirmation prompt.
5. Tap **No, Retake**. Confirm no MongoDB report was created and the camera is ready again.
6. Take a second photo and tap **Yes, Submit** once. Confirm success and exactly one new report in MongoDB.
7. Open My Reports. Confirm the report has Pending status, the correct photo/category, and date.
8. Close/reopen the app. Confirm the UID and report history persist.
9. Disconnect the network during analysis/submission. Confirm an actionable error appears, and retry/recovery works without a false success.
10. Repeat a submission using the same uploaded image URL. Confirm the API returns the existing report and does not reset its status or notes. After an ambiguous submission error, retaking must preserve any photo a saved report may reference.

## LGU workflow

1. Sign in with incorrect credentials; confirm a readable error without revealing secret credentials.
2. Sign in with a password user without an authorized UID/claim; confirm the API returns 403 and reports are not displayed.
3. Sign in as an authorized official. Confirm reports are grouped under all four exact status labels.
4. Check that each card shows the image, category, date, GPS coordinates, and a working Google Maps link.
5. Change Pending → Acknowledged, enter a note, and save. Confirm the card moves columns and values survive refresh.
6. Change the status to In Progress, then Resolved. Confirm persistence after each save.
7. Refresh My Reports on the citizen device. Confirm the final status and LGU notes appear.
8. Sign out. Confirm the login form replaces the board.

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
- [ ] Run `npx expo login` in `mobile/` yourself and use the same Expo account as the phone. The CLI was not logged in at the upgrade check.
- [ ] Keep phone/computer on the same reachable Wi-Fi, allow local-network access if prompted, and scan the development QR using the iPhone Camera app.
- [ ] Test native camera/GPS and one real report submission; iOS JavaScript bundling does not verify these hardware or service operations.
