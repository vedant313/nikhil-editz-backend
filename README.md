# Nikhil Editz CMS Backend (Render + MongoDB Atlas)

## Environment variables (Render > Environment)
- `MONGODB_URI` — MongoDB Atlas connection string
- `JWT_SECRET` — random secret, at least 32 characters
- `ADMIN_USERNAME` — your admin username
- `ADMIN_PASSWORD_HASH` — bcrypt hash of your admin password
- `FRONTEND_ORIGINS` — exact deployed website origin(s), comma-separated; e.g. `https://your-site.vercel.app`

Generate password hash locally:
```bash
node -e "const b=require('bcryptjs'); b.hash('YOUR_STRONG_PASSWORD',12).then(console.log)"
```
Paste the resulting hash into `ADMIN_PASSWORD_HASH`. Do not use the raw password as the hash.

## Deploy to Render
1. Push the `backend` folder contents to a GitHub repository (or use this folder as the repo root).
2. Render > New > Web Service > connect the repository.
3. Root Directory: `backend` (if the repository contains the whole project).
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Add the environment variables above.
7. Deploy. Check `https://YOUR-SERVICE.onrender.com/api/health`.

## MongoDB Atlas
1. Create a free cluster.
2. Create a database user and strong password.
3. In Network Access, allow Render outbound access. For a simple initial test you can temporarily use `0.0.0.0/0`, then tighten access if using a static outbound IP.
4. Copy the connection string and replace `<password>` with the database user's password. Add database name, e.g. `/nikhil_editz_cms`.

## Frontend connection
After Render deploys, open `api-config.js` and set:
```js
window.NIKHIL_API_BASE_URL = "https://YOUR-SERVICE.onrender.com";
```
Deploy/host the website on HTTPS. If using a different domain, add its exact origin to `FRONTEND_ORIGINS` and redeploy backend.

## API
- `GET /api/health` — health check
- `POST /api/auth/login` — returns 12-hour JWT
- `GET /api/auth/me` — validates admin token
- `GET /api/site-content` — public read
- `PUT /api/site-content` — authenticated save
- `PUT /api/site-content/edits` — authenticated visual text edits

Password is never sent back to the browser. MongoDB credentials stay only in Render environment variables.
