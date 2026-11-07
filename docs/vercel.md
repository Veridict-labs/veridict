# Deploy the frontend to Vercel

Use these settings for the Next.js frontend:

| Setting | Value |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | `apps/web` |
| Include source files outside of the Root Directory in the Build Step | Enabled |
| Install Command | `cd ../.. && npm install` |
| Build Command | `npm run build` |
| Output Directory | Next.js default (leave the override disabled; `.next`) |
| Node.js Version | 22.x (at least 22.12.0) |

The install command runs at the repository root so npm uses the root
`package-lock.json` and links all workspaces. The build command runs in
`apps/web`. npm automatically runs the frontend's `prebuild` script, compiling
`@veridict/contracts` before `next build`. Do not replace it with a direct
`next build` command, which skips the npm lifecycle hook.

The contracts package exposes compiled `dist/index.js` and `dist/index.d.ts`.
Those files are git-ignored and are not created by `npm install`; building only
Next.js on a clean checkout therefore cannot resolve the package entry point.
No TypeScript alias or `transpilePackages` setting is needed for this compiled
package. Keep the shared package and root lockfile available to the build.

Set `NEXT_PUBLIC_API_URL` to the publicly reachable HTTPS NestJS API URL before
building, then redeploy when that value changes. This Vercel project deploys
the frontend; deploy the NestJS API and PostgreSQL separately. API secrets belong
on the backend, never in `NEXT_PUBLIC_*` variables.

Verify from the repository root:

```bash
npm install
npm run build -w @veridict/contracts
npm run build -w @veridict/web
```

The final command also rebuilds contracts through `prebuild`, making standalone
frontend builds safe on a clean checkout. Keep development dependencies available
during the build because the contracts compiler is a dev dependency.
