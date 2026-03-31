# Renovate PR Dashboard

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

## GitHub token scopes

The app requires a GitHub personal access token (PAT). The token field accepts:

**Classic PAT** — enable these scopes:
- `repo` — read repository and pull request data
- `workflow` — read GitHub Actions check runs

**Fine-grained PAT** — grant these repository permissions:
- `Contents: Read`
- `Pull requests: Write`
- `Checks: Read`
- `Metadata: Read`

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
