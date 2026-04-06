# Deployment

## Frontend

The frontend is a Next.js app in `frontend/`.

Required environment variables:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-backend-domain.example.com
```

Commands:

```bash
cd frontend
npm install
npm run build
npm run start
```

Notes:

- `frontend/next.config.ts` uses `output: "standalone"` for easier Node deployment.
- `frontend/.env.example` shows the required public API URL.

## Backend

The backend is an Express app in `backend/`.

Required environment variables:

```env
GEMINI_API_KEY=your_gemini_api_key_here
FRONTEND_ORIGIN=https://your-frontend-domain.example.com
PORT=4000
HOST=0.0.0.0
```

`FRONTEND_ORIGIN` can contain multiple comma-separated origins if needed.

Commands:

```bash
cd backend
npm install
npm run build
npm run start
```

## Recommended Setup

Deploy the frontend and backend separately:

1. Deploy `frontend` on Vercel or any Node host.
2. Deploy `backend` on Render, Railway, Fly.io, or another Node host.
3. Set `NEXT_PUBLIC_API_BASE_URL` in the frontend to the public backend URL.
4. Set `FRONTEND_ORIGIN` in the backend to the public frontend URL.

## Verification

Before deploying, run:

```bash
cd frontend && npx tsc --noEmit
cd backend && npm run build
```

If `next build` ends with a local Windows `spawn EPERM`, that is an environment issue on the current machine; the frontend compile step itself can still complete successfully.
