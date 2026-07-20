# Clario Cloudflare Pages Deployment Guide

This guide describes how to deploy the **Clario Web/Mobile SPA** to **Cloudflare Pages** (to get a subdomain like `clario.pages.dev` or use a custom domain) and the optimizations applied to support this environment.

---

## What We Configured For You

To make your application completely compatible with Cloudflare Pages and modern static single-page application (SPA) builds, we have done the following:

1. **Build Automation script**: Added `"build:web": "expo export --platform web"` to `clario-mobile/package.json` to compile your Expo app into optimized, static production-ready files under `clario-mobile/dist`.
2. **SPA Routing Fallback**: Created `clario-mobile/public/_redirects` which contains:
   ```text
   /*  /index.html  200
   ```
   When building, Expo automatically copies this file into your `dist` folder. Cloudflare Pages reads this file and performs server-side rewrites (status code 200) for all custom router paths (e.g., `/mood`, `/breathe`, `/relief`), ensuring that refreshing any route works perfectly without returning a 404.
3. **SSR Supabase Fix**: Installed `ws` package and added a native Node.js WebSocket polyfill in `clario-mobile/src/lib/supabase.ts` to prevent Supabase Realtime Client from failing during the static site generation (SSG) phase when run inside the Node.js build environment.
4. **Resolved Peer Dependencies**: Installed `@lottiefiles/dotlottie-react` (peer dependency of `lottie-react-native` for web builds) to guarantee error-free compilation of your interactive elements (such as `GardenScene` and daily check components).

---

## Deployment Option 1: Git Integration (Recommended)

Connecting Cloudflare Pages directly to your GitHub repository allows automated builds on every `git push`.

### Steps:
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com).
2. Navigate to **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
3. Authenticate with your git provider (GitHub/GitLab) and select your `clario-app` repository.
4. Configure the build settings as follows:
   - **Project name:** `clario` (this will deploy your app to `clario.pages.dev`)
   - **Production branch:** `main` (or your default branch)
   - **Framework preset:** `None`
   - **Root directory:** `clario-mobile` (⚠️ **Very Important**: this tells Cloudflare to look inside your frontend sub-folder)
   - **Build command:** `yarn build:web` or `npm run build:web`
   - **Build output directory:** `dist`
5. Click **Save and Deploy**. Cloudflare will compile your project and deploy it globally in under 2 minutes.

### Environment Variables
If your application depends on environment variables during build time, configure them in:
* **Settings** -> **Environment variables** (under the Pages project settings).
* Common variables include:
  ```env
  EXPO_PUBLIC_API_BASE=https://clario-backend.your-production-domain.com
  EXPO_PUBLIC_CLOUDINARY_API_KEY=your-cloudinary-key
  EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloudinary-name
  EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your-preset
  ```

---

## Deployment Option 2: Direct Terminal Upload (Wrangler CLI)

You can also deploy your built assets directly from your local terminal using the Cloudflare `wrangler` CLI.

### Steps:
1. Build the production site locally:
   ```bash
   cd clario-mobile
   yarn build:web
   ```
2. Deploy the generated `dist` folder directly:
   ```bash
   npx wrangler pages deploy dist --project-name clario
   ```
3. The CLI will ask you to authenticate and then deploy your files to `clario.pages.dev`.

---

## Custom Domain Configuration
Once deployed to `clario.pages.dev`, you can easily point your custom domain (e.g., `clario.app` or `app.clario.com`):
1. In the Cloudflare Pages dashboard, select your **clario** project.
2. Go to the **Custom domains** tab.
3. Click **Set up a custom domain** and enter your domain name.
4. Cloudflare will automatically set up the DNS records and issue a free SSL certificate.
