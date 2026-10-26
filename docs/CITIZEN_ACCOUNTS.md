# Citizen login, guest sessions, and invalid photos

The citizen app offers **Log in**, **Sign up**, and **Continue as Guest** using Firebase Authentication. Enable both Email/Password and Anonymous providers in the existing Firebase project. There is no separate password database or paid authentication service added by this change.

Both registered citizens and guests can submit issues, open **My reports**, see LGU status/notes and office contacts, and edit/delete their own Pending issues until acknowledgment. Every API request uses the verified Firebase UID; an email/password account does not grant LGU or administrator access.

## Guest and account history

- A restored guest sees the login choices and can tap **Continue as Guest** to resume the same UID and history. The app creates an anonymous user only when none exists.
- **Guest · Sign in** opens the account choices without signing the guest out. **Sign up** links email/password credentials to that same anonymous Firebase user, preserving report and photo ownership. The app does not create a replacement identity if linking fails.
- **Log in** opens the existing account's history. Guest reports are not merged into an existing account. A confirmation explains this before switching away from a guest; choose **Create account** to retain that guest history instead.
- Registered sessions persist across app restarts. **Account → Sign out** returns to the login page; signing in again restores that account's reports on any device.
- Guest tracking depends on retaining the app's local Firebase session. Clearing app data, uninstalling, or switching to an existing account can end access to that guest identity. Create an account before changing devices.
- **Forgot password?** requests a Firebase password reset email. Passwords are not stored manually in app storage, MongoDB, logs, or backend configuration.

## Photo validity

The primary image must show a recognizable civic issue. Gemini is instructed to reject blank, blurry, obscured, or unrelated photos and ordinary scenes without a visible issue. Invalid images return HTTP 422 with `INVALID_ISSUE_IMAGE`. The app shows the retake message without a confirmation/submit screen or a manual-category bypass for that image. Service/model failures remain retryable service errors.

Only the nine supported issue categories can be chosen for a new report. The three-photo correction option remains available for a **valid issue** with an incorrect classification. A new `Unverified` submission is rejected by the API. Historical Unverified reports are preserved; their former default desk becomes an inactive **Archived reports** entry. Fresh installations create nine desks and no Unverified desk. Additional pictures are supporting attachments; the primary image drives issue validation and classification.

## Verification

Run `npm run check` from the repository root. Mobile tests use injected authentication operations to verify guest reuse, account linking, input validation, and failure preservation without creating live users or sending real reset emails. Backend tests cover registered/guest ownership, photo access, LGU isolation, invalid-analysis parsing, and archive migration. Native login/signup, session restoration, password reset email delivery, and photo behavior still need a physical-device test with configured Firebase/Gemini services.

Implementation references: [Firebase email/password authentication](https://firebase.google.com/docs/auth/web/password-auth), [upgrading an anonymous account](https://firebase.google.com/docs/auth/web/anonymous-auth), [Firebase password reset](https://firebase.google.com/docs/auth/web/manage-users#send_a_password_reset_email).
