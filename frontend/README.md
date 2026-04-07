## KB Schedule Frontend

This is the Next.js frontend for the KB schedule app.

## Local Development

Create a local env file first:

```bash
cp .env.example .env.local
```

Then run the app:

```bash
npm run dev
```

The frontend expects `NEXT_PUBLIC_API_BASE_URL` to point at the backend API.

## Production

Build and start:

```bash
npm run build
npm run start
```

The build script uses `next build --webpack`, which is the stable production build path for this project.

## Deployment Notes

- `next.config.ts` enables `output: "standalone"` for easier Node deployment.
- Set `NEXT_PUBLIC_API_BASE_URL` to your deployed backend URL.
- Full deployment steps for the whole repo are documented in [`../DEPLOYMENT.md`](../DEPLOYMENT.md).
