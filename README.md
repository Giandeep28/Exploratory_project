# Shayam Medical Store Inventory

Inventory management demo built with a React frontend, FastAPI backend, and MySQL database. It tracks medicines, batch quantities and expiry dates, suppliers, sales, stock thresholds, and CSV imports. The reminder calendar is part of the Overview page.

## Run with Docker Compose

1. Install and start Docker Desktop.
2. Copy `.env.example` to `.env` in the project root.
3. Replace the demo database passwords and token secret. Generate the admin password hash from the `backend` folder with `python -m app.auth` (or `.venv\Scripts\python.exe -m app.auth` on Windows), then put the result in `APP_PASSWORD_HASH`. The admin password must be at least 12 characters.
4. From the project root run:

   ```sh
   docker compose up --build
   ```

5. Open [http://localhost:8080](http://localhost:8080) and sign in with `APP_USERNAME` and the password used to generate the hash.

The API is at [http://localhost:8000](http://localhost:8000), with interactive API documentation at [http://localhost:8000/docs](http://localhost:8000/docs). MySQL is exposed locally on port `3307`. Docker applies database migrations before starting the API and stores database records in the `mysql_data` volume.

## Local development

- Backend: follow [backend/README.md](backend/README.md). The Vite development server proxies `/api` and `/health` to `http://127.0.0.1:8001` by default. Set `VITE_DEV_API_TARGET` to use a different backend URL.
- Frontend: follow [frontend/README.md](frontend/README.md). Start it with `npm run dev` from `frontend` and open the Vite URL (usually `http://localhost:5173`).

## Accounts

The first API startup creates an administrator from `APP_USERNAME` and `APP_PASSWORD_HASH` if no admin account exists. The admin can change their username and/or password from Profile and create regular user accounts. Regular users can view their profile but cannot change credentials or manage accounts; these permissions are enforced by the backend. Passwords must be at least 12 characters.

## Data and privacy

The root `.env.example` contains demonstration values; replace them before deployment and keep `.env` private. Use clearly labeled synthetic records for presentations. Only collect shop inventory, batch, and aggregate sales data with the shopkeeper's permission. Do not store customer identifiers or prescription details. The old `app.py` and `shop.db` prototype are separate and are not automatically imported into this application. Use the CSV import screen to add reviewed inventory records.

To stop the Docker services while keeping database records, run `docker compose down`. `docker compose down -v` also deletes the database volume and its records.
