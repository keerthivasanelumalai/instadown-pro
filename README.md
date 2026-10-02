# InstaDown Pro

Instagram Reel downloader with **Google-only sign-in**, **Supabase PostgreSQL user/download history**, and **yt-dlp + FFmpeg audio/video merging**.

## What changed

- Removed InstaDown username/password registration and login.
- Removed Instagram session-ID collection and storage.
- Users must sign in with Google before the downloader is unlocked.
- User profiles and per-user download history are stored in Supabase PostgreSQL.
- Reel downloads use yt-dlp with best video + best audio selection.
- FFmpeg is installed in the backend image and merges streams into MP4.
- FFprobe verifies that the final file contains an audio stream before it is offered to the user.
- URL input now says **“Paste the link here…”**.
- Added frontend/backend deployment structure, Dockerfiles, Nginx proxy, Docker Compose, health endpoint, and Render blueprint.

## Supabase setup

1. Create/open your Supabase project.
2. Enable **Authentication → Providers → Google**.
3. Configure the Google OAuth client with the Supabase callback URL shown by Supabase:
   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
4. In Supabase SQL Editor, run `backend/schema.sql`.
5. Copy the Supabase project URL, anon key, and service-role key into `backend/.env` or Render environment variables.

Never commit the service-role key.

## Local Docker

```bash
cp .env.example backend/.env
# edit backend/.env

docker compose up --build
```

Open `http://localhost:8080`.

## Render

The included `render.yaml` creates one Docker web service. It builds from the repository root and the backend Dockerfile also copies the frontend into the image, so the same Render URL serves the website and `/api`.

After Render gives you the production URL, set:

```text
FRONTEND_ORIGIN=https://YOUR-APP.onrender.com
```

Then update the Google OAuth/Supabase redirect settings to use that production origin.

## Important limitation

The downloader is designed for **public Instagram media**. It intentionally does not collect Instagram passwords or session IDs. Private/authentication-required media may fail.
