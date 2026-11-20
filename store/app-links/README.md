# Links that open the apps (v0.43.0)

A link to the website (for example a shared story, trip or Border hop challenge) opens the app at the same place
when the app is installed, and the website otherwise. Each phone checks a file on the website's domain before it
trusts the app with its links. These two files go in the **root** of `divaor.github.io`, which is a different
repository from this one (`divaor/divaor.github.io`), in a folder called `.well-known`:

| File | Where | What to fill in |
|---|---|---|
| `apple-app-site-association` | `https://divaor.github.io/.well-known/apple-app-site-association` | `TEAMID`: the Apple Team ID (App Store Connect → Membership). No file extension; GitHub Pages serves it as is. |
| `assetlinks.json` | `https://divaor.github.io/.well-known/assetlinks.json` | `PLAY_APP_SIGNING_SHA256`: Play Console → the app → Setup → App signing → "App signing key certificate", SHA-256. |

GitHub Pages skips folders that start with a dot unless the repository has a `.nojekyll` file at its root (or a
`_config.yml` with `include: [".well-known"]`).

The apps are already set up for them: `android/app/src/main/AndroidManifest.xml` (an `autoVerify` intent filter
for `divaor.github.io/globe`) and `ios/App/App/App.entitlements` (`applinks:divaor.github.io`). The app reads the
link's `#…` part (`src/native/chrome.ts`), the same part the website reads.
