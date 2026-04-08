# Deployment

This repo contains two deployable apps:

- `frontend/`: Next.js 16 app
- `backend/`: Express API

## Frontend

The frontend is a Next.js app in `frontend/`.

Required environment variables:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-backend-domain.example.com/api
```

If you deploy both apps together with Vercel Services, you can omit `NEXT_PUBLIC_API_BASE_URL` and the frontend will use the same origin under `/api` in production.

Commands:

```bash
npm install --prefix frontend
cp frontend/.env.example frontend/.env.local
npm run build --prefix frontend
npm run start --prefix frontend
```

Notes:

- `frontend/next.config.ts` uses `output: "standalone"` for easier Node deployment.
- The production build uses `next build --webpack` because that path completes reliably for this project.
- `frontend/.env.example` shows the required public API URL.

## Backend

The backend is an Express app in `backend/`.

Required environment variables:

```env
GEMINI_API_KEY=your_gemini_api_key_here
FRONTEND_ORIGIN=https://your-frontend-domain.example.com
PORT=4000
HOST=0.0.0.0
BLOB_READ_WRITE_TOKEN=vercel_blob_read_write_token_here
```

`FRONTEND_ORIGIN` can contain multiple comma-separated origins if needed.

Optional:

```env
SCHEDULES_BLOB_PATH=kb-schedule/schedules.json
```

`BLOB_READ_WRITE_TOKEN` enables durable schedule storage on Vercel Blob. When it is missing, the backend falls back to the local JSON file, which is fine for local development but not durable on Vercel.

Commands:

```bash
npm install --prefix backend
cp backend/.env.example backend/.env
npm run build --prefix backend
npm run start --prefix backend
```

## Recommended Setup

Deploy the frontend and backend separately:

1. Deploy `frontend` on Vercel or any Node host.
2. Deploy `backend` on Render, Railway, Fly.io, or another Node host.
3. Set `NEXT_PUBLIC_API_BASE_URL` in the frontend to the public backend URL.
4. Set `FRONTEND_ORIGIN` in the backend to the public frontend URL.

## Vercel Services

This repo now includes a root `vercel.json` for Vercel Services:

- `frontend` is mounted at `/`
- `backend` is mounted at `/api`

When importing the repo in Vercel, choose the `Services` preset and let it detect the root `vercel.json`.

For durable backend storage on Vercel:

1. Create a private Vercel Blob store in the project.
2. Add `BLOB_READ_WRITE_TOKEN` to the backend service environment variables.
3. Redeploy the project.

The backend will automatically seed Blob from `backend/data/schedules.json` the first time it runs if the blob file does not exist yet.

## Verification

Before deploying, run:

```bash
npm run typecheck --prefix backend
npm run build --prefix backend
npm run typecheck --prefix frontend
npm run build --prefix frontend
```
