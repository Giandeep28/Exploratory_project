# Medicine Inventory API

Backend-only FastAPI service using MySQL. The existing `app.py` is a Streamlit prototype and is left unchanged; it continues to use `shop.db` (SQLite). This API is the separate backend for the final system.

## Setup

1. Create an empty MySQL database and an application user with access only to it.
2. Copy `.env.example` to `.env`; set `DATABASE_URL`, `APP_USERNAME`, a password hash, and a random `TOKEN_SECRET` of at least 32 characters. Generate a password hash with `python -m app.auth` from this folder; use a password of at least 12 characters. Set `CORS_ORIGINS` only if calling the API cross-origin.
3. Install `pip install -r requirements.txt`.
4. From this directory, run `alembic upgrade head` then `uvicorn app.main:app --reload`.
5. The first startup seeds the administrator from `APP_USERNAME` and `APP_PASSWORD_HASH` if no admin exists. This only bootstraps an empty user table; later admin credential changes are stored in the database. Sign in at `/api/auth/login`; protected API requests use the returned bearer token. `/health` checks database connectivity. Interactive docs are at `/docs`.

Schema changes are tracked by Alembic. The initial migration expects an empty database; if you already created tables manually, back them up and reconcile the schema before running migrations. Store database credentials and the API key in the deployment's secret manager.

## CSV import

`GET /api/imports/template` downloads a header template. `POST /api/imports/preview` validates and previews a CSV. `POST /api/imports/commit` saves it transactionally. Uploads are capped at 2 MB and 5,000 rows. Required headers:

`medicine_name,company,price,threshold_qty,batch_no,manufacturing_date,expiry_date,quantity`

Dates use `YYYY-MM-DD`; manufacturing date may be blank. Import creates medicine and batch records, does not import customer data, and rejects duplicate medicine/batch combinations. Preview first, then commit only after review.

## Main endpoints

- `GET/POST /api/medicines`, `PATCH /api/medicines/{id}/threshold`
- `GET /api/stock`, `POST /api/batches`
- `GET/POST /api/suppliers`
- `GET /api/medicines/barcode/{barcode}` (barcode lookup; scanner input is supplied by the client)
- `POST /api/sales` (atomic stock deduction, earliest-expiry-first)
- `GET /api/dashboard/summary`, `GET /api/reports/top-medicines`
- `GET /api/forecast/{medicine_id}` (simple 14-day moving average)
- `POST /api/auth/login` (username/password, expiring bearer token)
- `GET /api/auth/me` (current account and role)
- `PATCH /api/auth/me/credentials` (admin only; verify current password, then change username and/or password)
- `GET/POST /api/auth/users` (admin only; list accounts and create regular users)
- `GET /api/calendar/events?month=YYYY-MM` (remaining batch expiry dates)
- `GET /api/imports/template`, `POST /api/imports/preview`, `POST /api/imports/commit`

Use synthetic records for the faculty demonstration and label them as simulated. Real shop records should be limited to inventory, batches, and aggregate item sales, collected with the shopkeeper's permission. Avoid customer identifiers and prescription details. Login uses a PBKDF2-SHA256 password hash and an expiring signed bearer token. The administrator can change the admin username/password and create regular user accounts. Regular users cannot change credentials or manage accounts; the API checks roles as well as the frontend. Passwords must be at least 12 characters. Dashboard endpoints return alert data; sending email or messaging notifications still requires a provider and credentials.
