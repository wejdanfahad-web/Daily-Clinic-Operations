# ENDO Clinic Operations

Staff assignments, rotations, surgery bookings, daily-checklist compliance and annual appraisals for the KSUMC Endodontic clinics.

- **Database:** Oracle Autonomous Database (Always Free); scripts in `db/`
- **API:** Netlify Functions in `netlify/functions/`, which talk to the database over HTTPS through ORDS REST-Enabled SQL
- **Website:** `public/`: the dashboard (`index.html`, `app.js`, `styles.css`), a phone app shell (`manifest.webmanifest`, `sw.js`) and the first-time `setup.html`
- **Notifications:** free web push to staff phones (no SMS or WhatsApp fees)

## How it fits together

```
Phone / PC browser ──► Netlify (website + /api/* functions) ──HTTPS──► ORDS ──► Oracle DB (schema ENDO)
                                   │
                                   └── daily 07:00 Riyadh: PPM check → push alerts (also keeps the DB awake)
```

All permission checks run in the Netlify functions:
- **Public:** board, reference lists, booking a surgery
- **Signed-in staff:** compliance, own appraisal, rotation queues
- **CIC:** everything
- **"In charge" staff:** today's assignments, during their session only

The database never has to accept a connection from a browser.

## One-time setup

### 1. Database
Run `db/00` → `db/04` (see `db/README.md`), then `db/99_smoke_test.sql`. Every line should say PASS.

### 2. Find your ORDS address
1. In the Oracle console, open your database, then **Database actions → SQL**. Sign in as **ENDO**.
2. Look at the browser address bar. It looks like `https://ABC123-ENDODB.adb.uk-london-1.oraclecloudapps.com/ords/endo/_sdw/...`
3. Your **ORDS_BASE_URL** is everything up to and including `/ords/endo`, for example `https://ABC123-ENDODB.adb.uk-london-1.oraclecloudapps.com/ords/endo`

### 3. Netlify
1. Netlify → **Add new site → Import an existing project → GitHub**, and pick this repository.
2. Leave the build settings empty, because `netlify.toml` already has them. Deploy.
3. Go to **Site configuration → Environment variables** and add:

| Key | Value |
|---|---|
| `ORDS_BASE_URL` | from step 2 |
| `DB_USER` | `ENDO` |
| `DB_PASSWORD` | the ENDO password you set in `00_create_schema_user.sql` |
| `SESSION_SECRET` | a long random string of 40+ characters (e.g. from passwordsgenerator.net) |
| `BOOTSTRAP_TOKEN` | any one-time phrase; used once to create the CIC login, then deleted |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | push keys; Claude generates these for you |
| `VAPID_SUBJECT` | `mailto:your-email` |

4. **Deploys → Trigger deploy → Deploy site** so the functions pick up the variables.

### 4. Check and create the CIC login
1. Open the site. **Database connection** should show green "Connected" with the staff, doctor and clinic counts.
2. Fill in **First-time CIC login** with the `BOOTSTRAP_TOKEN`, your staff ID and a password.
3. Delete `BOOTSTRAP_TOKEN` from Netlify and redeploy.
4. Sign in. Under **Staff logins**, create each staff member's login. Each one gets a temporary password that they change at first sign-in.

## API summary

| Method | Path | Who | What |
|---|---|---|---|
| GET | `/api/health` | anyone | DB connection check |
| GET | `/api/reference` | anyone | clinics, doctors + level colours, staff names, types |
| GET | `/api/board?date=` | anyone | that day's current assignments (`&live=1` signed-in, uncached) |
| GET/POST | `/api/bookings` | anyone | day occupancy · book a surgery (2/session, 3/day) |
| GET | `/api/bookings?list=upcoming` | CIC | upcoming bookings |
| POST | `/api/booking-action` | CIC | seen / cancel / assign assistant |
| POST | `/api/assign` | CIC, in-charge (today) | record ASSIGN / AMEND / CANCEL rows |
| GET | `/api/queues` | staff | rotation queues + next in line |
| GET | `/api/history` | CIC | full audit trail |
| GET/POST | `/api/planner` | CIC | day draft (saved across devices), publish differences to the board, planned leave |
| GET/POST | `/api/timetable` | CIC | semesters, import/paste, add/remove entries, confirm |
| GET | `/api/workload` | CIC | quarterly workload, rest; `?view=surgeries` full surgery history |
| GET/POST | `/api/inventory` | staff (own clinic) · CIC | machines (Serial # required) and instruments (quantity), PPM dates |
| GET/POST | `/api/compliance` | staff read · CIC tick | monthly checklist boxes |
| GET/POST | `/api/appraisals` | own row · CIC all | appraisal steps |
| POST | `/api/login` `/api/logout` `/api/change-password` | | sign-in (5 tries → 15-minute lock) |
| GET | `/api/me` | | current user + in-charge status |
| GET/POST | `/api/staff-admin` | CIC | staff logins, temporary passwords |
| GET/POST | `/api/push-key` `/api/push-subscribe` | | phone notifications |
| — | `ppm-check` (scheduled) | | daily PPM alerts |

## Tests
- `npm install && npm test` runs the functions against a fake database: auth, lockout, permissions, booking limits, audit-row building and notification logging.
- `node tests/mock-server.js` previews the dashboard at http://localhost:8888 with a fake in-memory API. CIC login: `9001` / `Test1234`.

## Free-tier limits to know
- The database stops after 7 days without use. The daily PPM check keeps it active.
- ORDS on the free tier handles only a few simultaneous requests. Public pages are cached at Netlify for 15–300 seconds, and the API retries automatically on "busy".
