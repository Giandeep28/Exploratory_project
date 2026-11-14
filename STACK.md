# Run the complete inventory system

The stack connects the React interface, FastAPI backend, and MySQL database with Docker Compose. MySQL persists its records in the `mysql_data` volume. The API applies Alembic migrations before it starts. React uses `/api` and Nginx forwards those calls to FastAPI, so browser CORS setup is not needed for this deployment.

## Start on a development computer

1. Start Docker Desktop and wait for its engine to become ready.
2. Copy `.env.example` to `.env`. Replace the database passwords and token secret. Generate a password hash from `backend` with `.venv\Scripts\python.exe -m app.auth` and set `APP_PASSWORD_HASH`. Use URL-safe characters in the MySQL password.
3. From the project root, run `docker compose up --build`.
4. Open `http://localhost:8080` and sign in with `APP_USERNAME` and the password used to create its hash.

The API is also available at `http://localhost:8000`; its interactive docs are at `http://localhost:8000/docs`. MySQL is available locally on port `3307`.

## Stop and preserve data

Run `docker compose down` to stop the services. The MySQL volume remains. Run `docker compose down -v` only when you intend to delete the database contents.

The SQLite `shop.db` used by the old Streamlit prototype is not automatically copied into MySQL. To load records, use the React CSV import screen after the stack is running. Mark synthetic records clearly and only import shop data with permission.
