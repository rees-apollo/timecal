# timecal

An Electron application with Svelte and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For Windows
$ npm run build:win
```

## GitHub Auto Updates

This app is configured to publish updates and consume updates from GitHub Releases in rees-apollo/timecal.

### Release automation

Release lifecycle is fully automated by GitHub Actions:

1. The `Release Please` workflow watches `main` and opens/updates a release PR.
2. Merging that PR tags a version and creates a GitHub Release.
3. The `Build And Publish Release Assets` workflow runs automatically on release publish and uploads Windows installer artifacts.

Required repository settings/secrets:

1. Keep GitHub Actions enabled for the repository.
2. Ensure workflow `GITHUB_TOKEN` has `contents: write` and `pull-requests: write` permissions.
3. No manual local publishing step is required.

### Local builds (optional)

Use local build commands only for verification/testing; releases are published by workflows:

```bash
npm run build:win
```

### Client update behavior

1. In packaged builds, the app checks GitHub for updates on startup and then hourly.
2. Updates are downloaded automatically.
3. Downloaded updates install on next app quit.

### Notes

- For public repositories, clients do not need a runtime token.
