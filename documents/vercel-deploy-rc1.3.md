# Vercel Deployment (Git Integration) — RC1.3

This document describes how to deploy **RC1.3** to a **running Vercel instance** using **Git integration**, while ensuring **repo-root** folders like `documents/` and `backups/` are **not included** in the deployment artifact.

## Target

- **Branch (RC1.3)**: `feature-RC1.3-implement-sched-buffering`
- **App folder**: `web/` (Next.js)
- **Goal**: Build an optimized production deploy from `web/` with `next build`, excluding repo-root non-app folders.

## Why `documents/` and `backups/` won’t deploy

The recommended approach is to set the Vercel **Root Directory** to `web`. When Vercel builds from `web/`, it does **not** upload or include sibling folders at the repo root such as:

- `documents/`
- `backups/`
- `supabase/`
- `scripts/`, `tools/`, etc.

### Note about `.vercelignore`

There is a `web/.vercelignore`. With **Root Directory = `web`**, that file only applies to paths **inside `web/`**.

If you ever switch Vercel Root Directory back to the repo root, you should move/create `.vercelignore` at the repo root instead.

## Vercel settings (Git integration)

In Vercel:

### 1) Set Root Directory

- Go to **Project → Settings → General**
- Set **Root Directory** to: `web`

### 2) Set Production Branch to RC1.3

- Go to **Project → Settings → Git**
- Set **Production Branch** to: `feature-RC1.3-implement-sched-buffering`

### 3) Verify build commands

Vercel should auto-detect Next.js once Root Directory is `web`, but verify:

- **Install Command**: `npm ci` (recommended; Vercel default is usually fine)
- **Build Command**: `npm run build`
- **Output Directory**: default (Next.js `.next`)

## Environment variables (Production)

Do **not** deploy using `web/.env.local` directly. Instead:

- Go to **Project → Settings → Environment Variables**
- Add the same keys/values needed by the app for **Production** (and Preview if you use previews)

Common examples for Supabase/Next.js apps:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- (server-only keys) `SUPABASE_SERVICE_ROLE_KEY`, email keys, etc. (these must **not** be `NEXT_PUBLIC_*`)

## Supabase Auth configuration (required for login)

After you have a Vercel production domain:

In Supabase Dashboard:

- **Authentication → URL Configuration**
  - Set **Site URL** to your Vercel production URL
  - Add Redirect URLs for your login flow, including:
    - Your production URL (and any callback paths used by your app)
    - Any preview domains if you plan to test previews

If these aren’t configured, the most common symptom is “login works locally but fails on Vercel”.

## Deploy / Redeploy

Once the settings are in place, a production deploy occurs when:

- You push commits to the **Production Branch** (`feature-RC1.3-implement-sched-buffering`), or
- You manually trigger **Deployments → Redeploy** for the latest commit

## Quick validation checklist

- Vercel **Root Directory** is `web`
- Vercel **Production Branch** is `feature-RC1.3-implement-sched-buffering`
- Vercel **Environment Variables** are set for Production
- Supabase **Site URL** + **Redirect URLs** include the Vercel domain
- The deployment succeeds and the app loads without auth errors

