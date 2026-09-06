# Grid Command

## GitHub Pages

In Settings → Pages, select **GitHub Actions** as the publishing source. The
Deploy game to GitHub Pages workflow builds and deploys every push to main;
it can also be started manually from Actions.

Published URL: https://rhs059.github.io/grid_command/

The Pages build exports static files with the /grid_command base path.
Next.js server headers are retained for normal hosting and omitted from the
static export because GitHub Pages controls response headers.

## Local development

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000.

To build the Pages export locally, set GITHUB_PAGES=true and run pnpm build.
The generated site is in out/ and must be served under /grid_command/.
