# Medicine Inventory frontend

React + Vite interface for the FastAPI backend in `../backend`. The existing Streamlit `app.py` and SQLite demo database are not used by this frontend.

## Start locally

1. Set up and run the backend using `../backend/README.md`.
2. In the backend `.env`, configure `APP_USERNAME`, `APP_PASSWORD_HASH`, and `TOKEN_SECRET`.
3. From this folder, run `npm install` and `npm run dev`.
4. Open the Vite URL and sign in with the configured account.

The login token is kept in browser `sessionStorage` for the current session. The backend stores only a PBKDF2-SHA256 password hash and expires signed tokens after the configured session lifetime.

The interface supports inventory review, medicine creation, per-medicine thresholds, batch receiving, billing, supplier records, validated CSV imports, demand estimates, and login. The calendar is part of Overview and highlights upcoming expiry reminders; Profile is opened from the top-right account button. Barcode scanning hardware or camera capture is not included; medicines can be found by their barcode through the backend endpoint.
