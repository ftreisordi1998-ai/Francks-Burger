<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Deploy

This project is connected to Vercel through the GitHub repo
`ftreisordi1998-ai/Francks-Burger`. Pushing to `main` deploys to production
on its own.

Do not also run `vercel --prod`. Doing both creates two competing production
deployments seconds apart; one builds and the other lands in Vercel's
`Blocked` state, which looks like a failure but is just the duplicate being
rejected. Push, then watch the deployment Vercel started.
