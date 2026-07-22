# Renovate PR Dashboard

A browser-only dashboard for open [Renovate](https://docs.renovatebot.com/) pull requests, grouped by update across all of your organizations. Supports **github.com**, **GitHub Enterprise Server**, **gitlab.com**, and **self-hosted GitLab** — configure any mix of connections from the organization switcher in the sidebar.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.1.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Configuration

The dashboard reads the repository link displayed in the header from the `NG_APP_SOURCE_REPOSITORY_URL` environment variable. If the variable is undefined or empty, it falls back to `https://github.com/dependency-dashboard/renovate-dashboard`.

To point the link at a different repository during local development, prefix your CLI commands with the variable:

```bash
NG_APP_SOURCE_REPOSITORY_URL=https://github.com/your-org/your-repo ng serve
```

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

Unit tests run with [Vitest](https://vitest.dev) via Angular 21's native `@angular/build:unit-test` builder:

```bash
npm test                  # Run tests once
npm run test:watch        # Run tests in watch mode
npm run test:coverage     # Run tests with coverage report
```

To run a single test file:

```bash
npx ng test --include src/app/path/to/file.spec.ts
```

## Connections and access tokens

Each connection needs an organization (GitHub) or group (GitLab) and a personal access token. Tokens are kept in `sessionStorage` only — they are cleared when the tab closes and are never sent anywhere except the configured instance.

### GitHub (github.com and GitHub Enterprise Server)

**Classic PAT** — enable these scopes:
- `repo` — read repository and pull request data
- `workflow` — read GitHub Actions check runs

**Fine-grained PAT** — grant these repository permissions:
- `Contents: Read`
- `Pull requests: Write`
- `Checks: Read`
- `Metadata: Read`

For **GitHub Enterprise Server**, set the instance URL in the add-organization form under *Advanced → Server URL* (the API is reached at `<server>/api/v3`). If Renovate runs self-hosted (on GHES it always does), also set *Advanced → Renovate bot author* to the bot's login — the default `app/renovate` only matches the hosted GitHub App.

### GitLab (gitlab.com and self-hosted)

Use a personal access token with the `api` scope, created by a user with at least **Developer** access to the group (merging requires it). The group field accepts nested paths (e.g. `parent/child`), and merge requests from subgroups are included automatically.

The default Renovate author is `renovate-bot` (the hosted app on gitlab.com); for self-hosted Renovate set *Advanced → Renovate bot author* to your bot's username. Note that approving MRs from the dashboard requires a GitLab Premium tier — on Free, "Approve & Merge" skips the approval step and merges directly.

### Private instances

The dashboard runs entirely in your browser, so your browser must be able to reach the instance (a VPN is fine). One caveat: a page served over HTTPS (like the GitHub Pages deployment) cannot call an `http://`-only instance — browsers block mixed content. In that case run the dashboard locally, or serve your instance over TLS.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
