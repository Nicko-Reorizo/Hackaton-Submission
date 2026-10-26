# Cloudinary Free setup

Photo storage uses Cloudinary. Firebase remains responsible for Anonymous and Email/Password login. No Firebase Storage bucket, Blaze upgrade, or unsigned Cloudinary upload preset is required.

1. Sign into your Cloudinary **Image & Video API / Programmable Media** account. Remain on the Free plan.
2. Open **Settings → API Keys**. Locate the product environment's **Cloud name**, **API key**, and **API secret**. The cloud name is not the `c-...` identifier in your console URL.
3. Open `backend/.env` locally and fill in:

   ```dotenv
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=your-api-key
   CLOUDINARY_API_SECRET=your-api-secret
   ```

4. Keep these settings on the backend only. Do not paste your API secret into chat, commit it, or put it in `EXPO_PUBLIC_`/`VITE_` variables. No Cloudinary configuration is required in the mobile app or dashboard.
5. Complete the other backend settings: MongoDB URI, Firebase project/Admin credentials, official UID, and Gemini key/available model. Enable Firebase Anonymous and Email/Password authentication and fill in the Firebase client settings in the mobile/dashboard `.env` files. A Firebase `storageBucket` value is optional and unused by the current mobile app.
6. Restart the backend and Expo after changing environment files:

   ```powershell
   npm run dev:api
   ```

   In another terminal:

   ```powershell
   npm run dev:mobile
   ```

7. Capture a photo. The mobile app sends base64 to the API with its Firebase ID token. The API assigns the citizen's upload path and sends a signed upload to Cloudinary; the API secret stays on the server. The returned HTTPS photo URL is saved on the report after confirmation. Unsaved retakes are deleted best-effort; photos referenced by saved reports are preserved.

The Free plan has usage limits. Review usage in the Cloudinary console; this app does not enable paid add-ons or upgrade your account. Photos use standard delivery URLs accessible to anyone who has the URL, so capture civic issues without unnecessary identifying details.

References: [Cloudinary free-plan details](https://cloudinary.com/documentation/billing_and_plans), [signed Upload API](https://cloudinary.com/documentation/image_upload_api_reference).
