# MyNaga 1-Tap · Citizen app

An Expo / React Native app with a persistent Firebase anonymous guest account. The only two tabs are **Report an issue** and **My reports**.

## Run

Requirements: Node.js 22.13+ and an Android/iOS device or emulator. This project uses Expo SDK 58 with React Native 0.88 and React 19.3. Use an Expo Go build that supports SDK 58. The Apple App Store version was verified as 58.0.5 (SDK 58) on 26 October 2026.

```powershell
cd mobile
npm install
Copy-Item .env.example .env
# Fill in .env from your Firebase project's web app configuration.
npm start
```

## Open on an iPhone

1. Install/update **Expo Go** from the Apple App Store. Its SDK must match this project's SDK 58. If your region's store still provides an older release, check its version before changing the project again.
2. Create a free Expo account if needed, and sign into Expo Go on your phone.
3. In a terminal on this computer, run `cd C:\Users\nicko\Hackaton-Submission\mobile` and then `npx expo login`. Sign into the same Expo account yourself; never share your password in chat. Physical iOS devices require matching Expo accounts in Expo Go and the CLI.
4. Connect phone and computer to the same Wi-Fi and start `npm start -- --lan`. Keep the backend running on port 4000.
5. Scan the terminal QR code using the iPhone Camera app and tap the **Open in Expo Go** banner, or enter the printed `exp://<LAN-IP>:8081` URL in Expo Go.
6. Allow local-network access if iOS asks, then allow the app's camera and foreground location permissions.

The citizen Firebase guest session starts automatically; Expo account sign-in is only part of the development tooling. No paid Apple Developer membership is needed for opening this SDK-matched app in the App Store Expo Go build. A separate native iOS development/distribution build has different signing requirements.

[Expo account requirement on physical iOS](https://docs.expo.dev/troubleshooting/expo-go-sign-in-required/).

Set `EXPO_PUBLIC_API_URL` to the **API origin**, without `/api`, for example `http://192.168.1.10:4000`. A physical phone cannot use your computer's `localhost`: connect to the same Wi-Fi and use the computer's LAN IP. Android emulator uses `http://10.0.2.2:4000`; iOS simulator can use `http://localhost:4000`. Allow the API port through your development firewall. Use HTTPS for deployed services.

In the same Firebase project used by the API and dashboard:

1. Register a web app and copy its config into `.env`.
2. Enable **Authentication → Sign-in method → Anonymous**.
3. Configure Cloudinary on the backend using `../docs/CLOUDINARY_SETUP.md`. No Firebase Storage bucket or upload preset is needed, and the Firebase storage bucket client setting is optional.
4. Start the backend using its setup instructions.

`EXPO_PUBLIC_` values are included in the app bundle. Firebase web configuration is public client configuration; never put service-account credentials or the Gemini key here. Restart Expo after environment changes (`npm start -- --clear` if needed).

## Flow

`App.tsx` initializes Firebase, waits for persisted auth, and calls `signInAnonymously()` only if there is no current account. On Android/iOS, `getReactNativePersistence(AsyncStorage)` preserves the guest UID between app restarts. Uninstalling or clearing app data loses that guest identity and access to its previous reports.

`ReportScreen.tsx` requests camera permission, takes a JPEG using `CameraView`, obtains fresh foreground GPS coordinates, uploads through the backend to Cloudinary, and sends `{ image_base64, mime_type: "image/jpeg" }` to the analysis endpoint. GPS permission or capture failure leaves the user on the camera screen. Upload/analysis failures allow retry or retake. The confirmation modal displays the returned prompt and the exact **Yes, Submit** / **No, Retake** actions. The app stores the report only after confirmation. A submitted photo is preserved; abandoned uploads are deleted on a best-effort basis. Once submission has been attempted, the photo is preserved even if the response is lost, because the server may already have saved the report. Retrying submission uses the same image URL so the backend can return the existing report.

`src/lib/photos.ts` sends camera base64 to `POST /api/reports/photo` with a Firebase ID token. The server owns Cloudinary credentials and uploads the image. Retakes call authenticated `DELETE /api/reports/photo`; the backend rejects another citizen's path and preserves any photo already referenced by a report.

`MyReportsScreen.tsx` fetches only the guest's reports, displays all four statuses and LGU notes, and supports pull to refresh. Every API request includes a freshly obtained Firebase ID token as a Bearer token. No API key or authentication bypass is embedded.

## Verify

```powershell
npm run typecheck
npx expo install --check
npm run export
npm run export:ios
```

The native camera, foreground GPS permission prompts, real Firebase upload/auth, and full API round trip need testing on a physical device with your configured services. Android/iOS exports check Metro bundling; they are not native APK/IPA builds or hardware tests.

## Official references

- [Expo SDK 58 camera](https://docs.expo.dev/versions/v58.0.0/sdk/camera/)
- [Expo SDK 58 location](https://docs.expo.dev/versions/v58.0.0/sdk/location/)
- [Expo Firebase integration](https://docs.expo.dev/guides/using-firebase/)
- [Expo Firebase auth persistence setup](https://github.com/expo/fyi/blob/main/firebase-js-auth-setup.md)
- [Firebase JavaScript SDK supported environments](https://firebase.google.com/docs/web/environments-js-sdk)
- [Cloudinary Upload API](https://cloudinary.com/documentation/image_upload_api_reference)

The API and schema are defined in `../backend/README.md`.
