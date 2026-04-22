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
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## GitHub Auto Updates

This app is configured to publish updates and consume updates from GitHub Releases in rees-apollo/timecal.

### One-time setup

1. Create a classic GitHub personal access token with repo scope.
2. Set the token in your shell before publishing releases:

```powershell
$env:GH_TOKEN = "your_github_token"
```

3. Build and publish a release artifact:

```bash
npm run make
```

The generated latest.yml and installer artifacts in dist are uploaded to the GitHub release by electron-builder when GH_TOKEN is set.

### Client update behavior

1. In packaged builds, the app checks GitHub for updates on startup and then hourly.
2. Updates are downloaded automatically.
3. Downloaded updates install on next app quit.

### Notes

- For private repositories, clients also need GH_TOKEN available at runtime to download release assets.
- For public repositories, clients do not need a runtime token.
