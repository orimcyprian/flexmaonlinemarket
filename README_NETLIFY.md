# Flexma Online Market — Netlify deployment package

This version is adapted for Netlify hosting:
- Static responsive website in `public/`
- Serverless API in `netlify/functions/api.js`
- Persistent registration/course/lesson/schedule/enquiry records using Netlify Blobs
- Admin portal at `/admin.html` (admin page assets are included)
- Registration notification email through SMTP
- Logo supplied in the project PDF/image
- CEO portrait slot wired to `public/assets/ceo-portrait.jpg`

## Important note about your portrait
I inspected the uploaded 7-page `Flexma_Online_Market_Updated_Website_Development_Prompt.pdf`. It contains the Flexma logo, but no separate CEO portrait photograph. The only image attachment available in this chat is also the Flexma logo. I have therefore prepared the portrait slot and included a text note in `public/assets/`. Please upload the actual CEO photo separately so it can be added as `ceo-portrait.jpg`.

## Deploy to Netlify

Because this site uses serverless functions and persistent storage, deploy the whole project through a Git repository connected to Netlify or with the Netlify CLI. A simple drag-and-drop of only the `public` folder will publish the static pages but will NOT deploy the API functions or admin backend.

### Recommended: GitHub + Netlify
1. Extract this ZIP file on your computer.
2. Create a new private GitHub repository, for example `flexma-online-market`.
3. Upload the contents of this folder to the repository root (including `netlify.toml`, `package.json`, `public/` and `netlify/`).
4. In Netlify, choose **Add new project → Import an existing project**, connect GitHub and select the repository. Make sure the contents of this folder (not an extra enclosing folder) are at the repository root.
5. Netlify reads `netlify.toml`: publish directory `public`; functions directory `netlify/functions`.
6. Deploy the site. Do not upload the ZIP file itself as if it were a static HTML page; extract it and deploy the project through GitHub or Netlify CLI so the `netlify/functions` directory is built.

### Configure environment variables in Netlify
Open **Site configuration → Environment variables** and add:
- `ADMIN_EMAIL` = your chosen administrator email (e.g. `flexmaceo@gmail.com`)
- `ADMIN_PASSWORD` = a strong, unique password (or `ADMIN_PASSWORD_HASH` with a bcrypt hash)
- `SESSION_SECRET` = a long random secret, at least 32 characters
- `NOTIFICATION_EMAIL` = `flexmaceo@gmail.com`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` = values supplied by your email provider

Do not put real passwords or SMTP secrets in GitHub or in this ZIP. Add them only in Netlify's environment variable settings.

### Persistent data
The function uses Netlify Blobs for student registrations, courses, lessons, schedules and enquiries. Netlify provisions the persistent store when the function runs in a deployed site context. Test a registration and confirm it remains in the admin portal after a redeploy.

### Admin portal
After deployment, visit `/admin.html`. Sign in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` you configured in Netlify.

## Domain name
You do not need to buy a domain before deploying. Netlify gives the deployed site a free `*.netlify.app` address. Later, you can buy/connect a custom domain from Netlify or another registrar.

## Final launch checklist
- The supplied CEO portrait is already included as `public/assets/ceo-portrait.jpg`.
- Configure and test SMTP email delivery to `flexmaceo@gmail.com`.
- Set strong admin and session secrets.
- Test registration, student record persistence, status updates, CSV export and mobile layout.
- Confirm HTTPS and review privacy notice, data retention and deletion process.
- Configure backups/export of your student records.

## Scope and limitations
- This is a deployable Netlify starter package, not a live deployed site. No Netlify account or site was connected from this chat.
- The API uses Netlify Blobs as simple JSON-backed storage, suitable for a modest first launch. For high traffic or complex multi-staff operations, move to a managed database such as Supabase or PostgreSQL.
- Lesson records store HTTPS video links. Large video uploads and protected per-student playback require a dedicated video/file storage service and additional access-control work.
- Schedule and joining details are admin-managed; a student-specific notification workflow is not yet included.
- Business registration sections are guidance/application support only; no government affiliation or guaranteed approval is claimed.
