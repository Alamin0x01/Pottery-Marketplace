# Firebase Setup Guide

How to create and connect your own Firebase project to this application. Follow it once for **development** and again (with a separate project) for **production**; never share one project between the two.

Related: [DATABASE_IMPLEMENTATION.md](DATABASE_IMPLEMENTATION.md) · [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) §6 (security) · [DATABASE_DESIGN.md](DATABASE_DESIGN.md)

> **You can develop and run all tests without a Firebase project** by using the local emulators (see [§8](#8-local-emulators-no-project-needed)). A real project is only needed to run the app against real data.

## 1. Prerequisites
* A Google account.
* Node.js 20.6+ and npm (already used by this repo).
* **Java 21 or newer** — required only by the local Firestore emulator, and **the single most common reason local sign-in fails** ("Network error" / "Cannot reach the Firebase Auth emulator"). Check with `java -version`. If it is missing, install it and open a **new** terminal:
  ```powershell
  winget install EclipseAdoptium.Temurin.21.JDK
  ```
  `npm run emulators` finds Java automatically in this order: your `PATH`, then `JAVA_HOME`, then a JDK unpacked in the project's git-ignored `.tools/jdk/` folder (no system install needed). If none is found it stops with exactly this instruction instead of a Java stack trace.
* The Firebase CLI is installed as a backend dev dependency: run it with `npx firebase …` from `backend/` (no global install needed).

## 2. Create the Firebase project
1. Open <https://console.firebase.google.com> → **Add project**.
2. Name it (e.g. `pottery-marketplace-dev`). Note the generated **Project ID** (e.g. `pottery-marketplace-dev-a1b2c`); you need it below. Google Analytics is optional (not used by this app).
3. **Upgrade to the Blaze (pay-as-you-go) plan** if the console requires it for Cloud Storage **[verify in the console — requirements change]**, and immediately create a **budget alert** (Google Cloud console → Billing → Budgets & alerts) so a bug or abuse cannot produce a surprise bill.

## 3. Create Cloud Firestore
1. **Build → Firestore Database → Create database**.
2. Edition **Standard**; location **`asia-south1` (Mumbai)** — *the location cannot be changed later* (decision recorded in PROJECT_ANALYSIS.md).
3. Start in **production mode**. (You will deploy this repo's deny-all rules in §7; the backend uses the Admin SDK, which bypasses rules.)

## 4. Enable Cloud Storage
1. **Build → Storage → Get started**, production mode, same location (`asia-south1`).
2. Copy the **bucket name** shown at the top of the Files tab (without `gs://`). New projects look like `<project-id>.firebasestorage.app`; older ones `<project-id>.appspot.com`. Use exactly what you see.

## 5. Enable Authentication
1. **Build → Authentication → Get started**.
2. **Sign-in method**: enable **Email/Password** (admins, Phase 3). Enable others (e.g. Google) later when customer accounts are built. Do **not** create admin users by hand: Phase 3 provides a script that sets the admin role claim.

## 6. Register the web app and get the frontend settings
1. **Project settings (gear) → General → Your apps → `</>` Web**; nickname `web`; skip Firebase Hosting.
2. Copy the `firebaseConfig` values into `web/.env.local` (copy from `web/.env.example`):

   | `firebaseConfig` key | Variable |
   |----|----|
   | `apiKey` | `VITE_FIREBASE_API_KEY` |
   | `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
   | `projectId` | `VITE_FIREBASE_PROJECT_ID` |
   | `appId` | `VITE_FIREBASE_APP_ID` |

   These identify your project; they are **not secrets**. Still restrict the API key: Google Cloud console → APIs & Services → Credentials → the "Browser key" → *Application restrictions → Websites* → add `http://localhost:5173`, your Vercel domain(s).
3. Restart `npm run dev` in `web/`. The home page shows **Firebase: configured**.

## 7. Create the backend credentials (service account) — SECRET
The backend authenticates to Firebase with a **service-account key**. Treat it like a password.

1. **Project settings → Service accounts → Generate new private key.** A JSON file downloads.
2. **Never** put it in the repository, in `web/`, in chat, or in an issue. `.gitignore` blocks common names (`*-firebase-adminsdk-*.json`, `serviceAccount*.json`, `*credentials*.json`, `*.pem`, `*.key`), but do not rely on that: store it outside the project folder.
3. Pick **one** way to give it to the backend:
   * **Local machine:** keep the file somewhere outside the repo and set `GOOGLE_APPLICATION_CREDENTIALS` to its absolute path in `backend/.env`.
   * **Railway/VPS:** base64-encode the file and set the result as the secret `FIREBASE_SERVICE_ACCOUNT_B64`:
     ```powershell
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\secure\key.json"))
     ```
     Base64 is *encoding, not encryption*; only trusted people may view the Railway variables. Delete the local JSON file afterwards if you no longer need it.
4. **Least privilege for production:** the default key can administer the whole Firebase project. For production create a dedicated service account (Google Cloud console → IAM → Service accounts) with only: *Cloud Datastore User*, *Storage Object Admin* (restricted to the app bucket), and *Firebase Authentication Admin*; generate its key instead. The backend verifies the key belongs to `FIREBASE_PROJECT_ID` and refuses to start otherwise.
5. If a key ever leaks: Service accounts → *Manage service account permissions → Keys → delete the key*, create a new one, redeploy.

## 8. Local emulators (no project needed)
Emulators run Firestore, Storage and Auth on your machine with fake data and **no credentials**.

```powershell
cd backend
npm run emulators          # terminal 1; ports 8080 / 9099 / 9199
```
* **Your data now persists.** On Ctrl+C the emulators export their data (users, roles, Firestore) to `backend/emulator-data/` (git-ignored) and re-import it on the next start ("Restoring emulator data…"), so you do not have to recreate admins each session. Delete that folder for a clean slate.
* The test suite (`npm run test:emulator`) always uses its own clean, throw-away emulators and never touches this saved data.
Add to `backend/.env` (all three, or none):
```
FIREBASE_PROJECT_ID=demo-pottery
FIREBASE_STORAGE_BUCKET=demo-pottery.appspot.com
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
```
(The `demo-` prefix guarantees the emulators never touch a real project.) The backend refuses emulator settings when `NODE_ENV=production`.

## 9. Configure the backend for a real project
`backend/.env` (copy from `backend/.env.example`):
```
FIREBASE_PROJECT_ID=<your project id>
FIREBASE_STORAGE_BUCKET=<your bucket name>
GOOGLE_APPLICATION_CREDENTIALS=C:\secure\key.json     # or FIREBASE_SERVICE_ACCOUNT_B64=...
```
Remove/comment the three emulator variables. The service-account key's `project_id` must equal `FIREBASE_PROJECT_ID`.

## 10. Deploy the security rules and indexes
```powershell
cd backend
npx firebase login
npx firebase deploy --config firebase/firebase.json --project <your project id> --only firestore:rules,firestore:indexes,storage
```
* `firestore.rules` = deny-all, `storage.rules` = only `public/products/**` is publicly readable (see DATABASE_IMPLEMENTATION.md §6).
* Index builds take a few minutes; watch **Firestore → Indexes** until all show *Enabled*. Queries that need an index fail with an error containing a link until it is ready.
* Regenerate the index file after changing query shapes: `npm run indexes:generate`.

## 11. Verify the connection
```powershell
cd backend
npm run check:firebase
```
Expected output (real project shown):
```
Project: your-project-id
Bucket:  your-project-id.firebasestorage.app
Mode:    REAL Firebase project
✔ firestore 120 ms
✔ storage   95 ms
✔ auth      210 ms
```
The check only **reads**; it writes nothing. Then start the API (`npm run dev`) and open `http://localhost:4000/health/ready` → `{"status":"ready",…}`.

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Firebase configuration error: FIREBASE_PROJECT_ID is required` | `.env` missing/empty | Copy `.env.example`, fill the values, restart |
| `Service account belongs to project "x" but FIREBASE_PROJECT_ID is "y"` | Key from a different project | Use the key generated for the configured project |
| `Emulator mode needs all three emulator hosts` | Only some `*_EMULATOR_HOST` set | Set all three or remove them all |
| `GOOGLE_APPLICATION_CREDENTIALS points to a file that cannot be read` | Wrong path / permissions | Use an absolute path |
| `firestore ✖ NOT_FOUND (is Firestore created…)` | Firestore database not created | §3 |
| `firestore ✖ PERMISSION_DENIED` | Service account lacks roles | §7 step 4 |
| `storage ✖ NOT_FOUND` | Wrong bucket name or Storage not enabled | §4 — copy the bucket name exactly |
| `auth ✖ auth/configuration-not-found` | Authentication not enabled | §5 |
| `firestore ✖ UNAVAILABLE` | No network, or emulator not running | Check connection / `npm run emulators` |
| Emulator fails to start: *Java not found* | JDK missing | Install JDK 21+, reopen the terminal |
| Query error mentioning "requires an index" | Indexes not deployed/enabled yet | §10; wait until *Enabled* |
| Web badge `Firebase: not configured` | Missing `VITE_FIREBASE_*` | §6, restart Vite |
| Web build refuses `VITE_…SERVICE_ACCOUNT…` | An Admin credential was put in a `VITE_` variable | Remove it — the browser must never see it |

## 13. Security checklist
- [ ] Separate Firebase projects for development and production
- [ ] Budget alert configured
- [ ] Service-account key stored outside the repo / only in Railway secrets; never in `web/`
- [ ] Production uses a least-privilege service account
- [ ] Firestore and Storage rules deployed (deny-all / public read of `public/products/**` only)
- [ ] Web API key restricted to your domains
- [ ] `git status` shows no `.env*` or `*.json` key files before every commit
