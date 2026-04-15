# Deployment

This repo now deploys as a single Next.js 16 app from `frontend/`.

## Environment Variables

Required:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Optional:

```env
NEXT_PUBLIC_API_BASE_URL=/api
BLOB_READ_WRITE_TOKEN=vercel_blob_read_write_token_here
SCHEDULES_BLOB_PATH=kb-schedule/schedules.json
```

Notes:

- The app serves its API through Next.js App Router handlers under `/api`.
- `BLOB_READ_WRITE_TOKEN` enables durable schedule storage on Vercel Blob.
- Without Blob, local development reads and writes `backend/data/schedules.json` when that file is present. On Vercel it falls back to temporary local storage.

## Local Commands

```bash
npm install --prefix frontend
npm run build --prefix frontend
npm run start --prefix frontend
```

## Vercel

Use the `frontend/` directory as the Next.js app entrypoint. The root `vercel.json` keeps that service mounted at `/`.

## Verification

Before deploying, run:

```bash
npm run typecheck --prefix frontend
npm run build --prefix frontend
```
