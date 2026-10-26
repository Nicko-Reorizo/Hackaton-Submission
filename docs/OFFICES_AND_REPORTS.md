# Offices, staff accounts, and submitted issues

## Administrator setup

The existing Firebase email/password user(s) in `LGU_ALLOWED_UIDS` are administrators. They can review all reports and manage offices and staff. Other accounts must have an active MongoDB `LguAccount` assignment; a Firebase `lgu: true` claim alone no longer grants global report access.

On backend startup, nine category-based desks are created if missing. The former Unverified desk, if present, becomes an inactive **Archived reports** entry for historical submissions. Unclear/unrelated photos cannot create new reports. Existing reports without an office are assigned to the matching category desk/archive. This is an additive migration: no reports, photos, descriptions, notes, or statuses are deleted. Existing non-Pending reports receive an acknowledgment lock using their stored update timestamp. Default desk names are internal routing labels, not verified government department names. Phone, email, and address stay blank until the administrator enters verified details.

## Configure offices and contacts

1. Sign into the LGU dashboard with the existing administrator login.
2. Open **LGU offices → Edit office**.
3. Set the office name, service area, handled classifications, and public phone/email/address.
4. Save. Citizens see these current details on their submitted reports, with call/email links when available.
5. Use **Add office** for another jurisdiction/department. Multiple offices can handle the same classification; citizens then select the receiving office.

Pausing an office stops it receiving new issues. Its existing reports remain available to assigned staff. Disabling a staff account separately removes its API access.

## Create separate LGU logins

Open **Office accounts → Add account**. Create a Firebase email/password account with a staff name, email, and initial password, or link an existing Firebase password user's UID. Select an office and one or more of its classifications. Passwords are stored by Firebase only, never in MongoDB. Share initial credentials directly with the authorized person.

The API reads the assignment on every LGU request. Staff can list, search, count, and update reports only for their office and allowed classifications. Supplying another office ID or guessing a report ID does not bypass the scope. Administrators can change assignments or disable access through **Manage**. Only administrator UIDs in the server environment can create/link accounts or edit offices; clients cannot grant themselves administrator access.

## Citizen workflow

- Registered citizens and guests can both submit and track their own issues. Guest signup preserves their UID and existing history; see [account/session rules](CITIZEN_ACCOUNTS.md).
- Take a photo or choose an existing picture. GPS uses the citizen's **current location**, not the selected photo's historical EXIF location.
- Photos without a clear civic issue show an invalid-photo message and cannot be submitted or manually reclassified. Take a new photo with the actual issue visible.
- After AI analysis, review the suggested classification and receiving office. The category picker stays hidden initially. Rejecting the first two photos with **No, Retake** returns to the camera. Rejecting the third (or later) photo offers **Choose classification** or **Retake photo**, preserving the current picture if the citizen chooses manual correction. Fresh camera/library pictures count as attempts; retrying an upload/analysis for the same picture and adding attachments do not. The count and unlocked picker reset after a successful submission/new issue. The original AI suggestion is retained separately.
- **Yes, Submit** first asks whether to add a comment. **Yes, add a comment** opens an optional description field (up to 3,000 characters) and **Submit report**. **No, submit now** sends the report immediately without a comment. Returning to review never submits, and skipping discards any previously entered comment for that submission.
- Attach up to **five pictures total**, including the original. Library pictures are resized when needed and converted to JPEG before upload.
- In **My reports**, edit description, receiving office, or additional attachments while the issue is Pending and has never been acknowledged. Classification is displayed without editing controls. The original photo and GPS cannot be silently replaced by editing.
- Delete a Pending issue after the confirmation dialog. Photo cleanup is best-effort and never removes a photo referenced by another saved report.
- Once an LGU sets Acknowledged, In Progress, or Resolved, citizen edits/deletion are permanently locked. Returning the status to Pending does not unlock it. Conditional database updates/deletes enforce this even when acknowledgment races a citizen action.

Unsubmitted retakes are cleaned up best-effort. After any submission/save attempt with an uncertain response, photos are preserved to avoid breaking a report that may already have committed.

## Request table

The LGU workspace uses one request table and a review drawer. Status tabs, classification/office filters, escaped keyword search, newest-first sorting, and 25/50/100 rows per page replace the side-by-side Kanban board. Pagination and counts run on the server within the account's authorized scope. Report thumbnails load lazily; the drawer shows all pictures, coordinates, description, office, status, and citizen-visible notes.

## API additions

All endpoints require a Firebase bearer ID token.

| Method | Path | Access / behavior |
| --- | --- | --- |
| GET | `/api/lgu/offices` | Authenticated office/contact directory |
| GET | `/api/lgu/me` | LGU role, office and classifications |
| GET/POST | `/api/lgu/admin/offices` | Administrator directory/create |
| PATCH | `/api/lgu/admin/offices/:id` | Administrator office/contact update |
| GET/POST | `/api/lgu/admin/accounts` | Administrator staff list/create/link |
| PATCH | `/api/lgu/admin/accounts/:uid` | Administrator assignment/availability update |
| PATCH | `/api/reports/:id` | Owner only; Pending and never acknowledged |
| DELETE | `/api/reports/:id` | Owner only; Pending and never acknowledged |

Create/edit reports accept `description`, final `ai_category`, `lgu_id`, and `image_urls` (1–5 unique owned URLs, original `image_url` first). Create also accepts `ai_suggested_category`. Report responses include `lgu` contact details, `image_urls`, and server-calculated `can_edit`. Locked/racing modifications return 409.

`GET /api/reports/lgu` accepts `page`, `page_size` (maximum 100), `status`, `category`, `office_id` (administrator filter), and `q` (maximum 120 characters). It returns `{ reports, counts, pagination: { page, page_size, total, total_pages } }`. Counts reflect the authorized queue and current non-status filters.
