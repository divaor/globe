# The stores (v0.48.0, Store-ready)

Everything the App Store and Google Play ask for, kept with the code. The apps themselves are built by
`.github/workflows/apps.yml` (v0.43.0).

| What | Where |
|---|---|
| Listings in six languages (name, subtitle, short and full description, keywords, what's new) | `listings/<locale>.json`, checked by `scripts/store/check.mjs` (each field within both stores' limits) |
| Privacy policy, help and support, credits (five languages, on the website) | written in `site/<page>/<lang>.html`, built by `scripts/site/build.mjs` into `privacy.html`, `support.html`, `credits.html` and `<page>.<lang>.html` |
| The answers for the stores' forms (App Privacy, Data safety, age ratings, export, content rights) | `forms.md` |
| Screenshots (iPhone 6.9", iPad 13", Android phone) and Play's feature graphic, in every listing language | made by `scripts/store/screenshots.mjs` into `store/screenshots/` (not kept in git) |
| Links that open the apps | `app-links/` |

## Screenshots

```sh
npm run build && npx vite preview --port 4173 &
node scripts/store/screenshots.mjs                      # all six languages, three sizes, six scenes, ~20 minutes
node scripts/store/screenshots.mjs --only en-US --devices iphone   # one language, one size
```

Each picture is a scene of the app as a phone shows it, under a two-line caption in the listing's language (the
captions are in the script). Sizes: iPhone 1320×2868 (Apple scales it for the smaller iPhones), iPad 2064×2752,
Android 1080×2160 (Play allows at most 2:1), feature graphic 1024×500.

## The first release, step by step

Only the developer accounts' owner can do the steps marked **(you)**.

1. **(you)** Open the developer accounts (decision P6): Apple Developer Program as an individual, Google Play Console
   with a personal account.
2. **(you)** Choose the support email (decision P12) and add it to both stores' contact details.
3. **(you)** Create the apps:
   - App Store Connect: bundle id `io.github.divaor.globe`, name "Mundora: Globe & Geography", primary language
     English (U.K.) or English (U.S.).
   - Play Console: package `io.github.divaor.globe`, the same name, free.
4. **(you)** Add the repository secrets listed at the top of `.github/workflows/apps.yml` (the App Store Connect API
   key, the Android upload key, Play's service account).
5. Run **Apps** by hand with *upload* on:
   - iOS goes to TestFlight.
   - Android goes to Play's internal test; choose track *alpha* for the closed test.
6. **(you)** Fill in the listings from `listings/*.json`, the screenshots, and the forms from `forms.md`.
7. **(you)** Play's closed test: 12 testers who keep the app for 14 days (a personal account needs this before the
   first public release). The testers who speak Spanish, Portuguese, French or German also check those languages.
8. Version 1.0.0: submission to both stores, with notes for the reviewers on what works offline, the reminders, share
   and haptics.

## Donations

The website has a Ko-fi button (the round button's list, About, and the help page) once `src/app/donate.json` holds
the Ko-fi page's name. The apps never show it: the App Store and Google Play want tips to a developer to go through
their own payments. The website's pages hide it too when the apps open them (`?app=1`).
