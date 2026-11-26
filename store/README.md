# The stores (v0.48.0, Store-ready)

Everything the App Store and Google Play ask for, kept with the code. The apps themselves are built by
`.github/workflows/apps.yml` (v0.43.0).

| What | Where |
|---|---|
| Listings in six languages (name, subtitle, short and full description, keywords, what's new) | `listings/<locale>.json`, checked by `scripts/store/check.mjs` (each field within both stores' limits) |
| Privacy policy, help and support, credits (five languages, on the website) | written in `site/<page>/<lang>.html`, built by `scripts/site/build.mjs` into `privacy.html`, `support.html`, `credits.html` and `<page>.<lang>.html` |
| The answers for the stores' forms (App Privacy, Data safety, age ratings, export, content rights) | `forms.md` |
| Screenshots (iPhone 6.9", iPad 13", Android phone) and Play's feature graphic, in every listing language | made by `scripts/store/screenshots.mjs` into `store/screenshots/` (not kept in git) |
| Google Play's listing sent from here (v0.54.2): texts, icon, feature graphic, phone screenshots, contact details | `scripts/store/play.mjs`, run by the **Store** workflow (`.github/workflows/store.yml`) |
| Links that open the apps | `app-links/` |

## Screenshots

```sh
npm run build && npx vite preview --port 4173 &
node scripts/store/screenshots.mjs                      # all six languages, three sizes, seven scenes, ~25 minutes
node scripts/store/screenshots.mjs --only en-US --devices iphone   # one language, one size
```

Each picture is a scene of the app as a phone shows it, under a two-line caption in the listing's language (the
captions are in the script; a long line makes its caption smaller so it stays on two lines). The scenes: the globe,
the maps, the planets round the Sun (following the Earth from the Sun, its year counting), deep time, Today, Master
the world and the travel guide. Sizes: iPhone 1320×2868 (Apple scales it for the smaller iPhones), iPad 2064×2752,
Android 1080×2160 (Play allows at most 2:1), feature graphic 1024×500.

## The first release, step by step

Only the developer accounts' owner can do the steps marked **(you)**.

1. **(you)** Open the developer accounts (decision P6): Apple Developer Program as an individual (still to open),
   Google Play Console with a personal account (open since November 2026).
2. **(you)** Add the support email (decision P12: divaor@gmail.com, also on the help page) to both stores' contact details.
3. **(you)** Create the apps:
   - App Store Connect: bundle id `io.github.divaor.globe`, name "Mundora: Globe & Geography", primary language
     English (U.K.) or English (U.S.).
   - Play Console: package `io.github.divaor.globe`, the same name, free.
4. **(you)** Add the repository secrets listed at the top of `.github/workflows/apps.yml` (the App Store Connect API
   key, the Android upload key, Play's service account).
5. Run **Apps** by hand with *upload* on:
   - iOS goes to TestFlight.
   - Android goes to Play's internal test; choose track *alpha* for the closed test.
   - Android's release is a draft to roll out in Play Console; choose release *rollout* to send it to that track's
     testers straight away (v0.50.2).
6. Google Play's listing: run **Store** by hand, first with *status* (what Play has, changes nothing), then with
   *listing*. It builds the app, makes the Android screenshots and the feature graphic in the six languages (kept as
   the run's artifact *play-pictures*), and sends each language's name, short and full description, the icon, the
   pictures, and the contact details (`forms.md`). Play shows them after its review. The service account needs
   **Manage store presence** (Play Console → Users and permissions) besides the release permissions it has.
   App Store Connect's listing is still filled in by hand **(you)** from `listings/*.json` and the iPhone and iPad
   screenshots.
7. **(you)** The forms in Play Console from `forms.md`: privacy policy, app access (everything works without an
   account), ads (none), content rating, target audience, data safety, government apps (no), financial features
   (none), health (none); and the category (Education) with the contact details.
8. **(you)** Play's closed test: 12 testers who keep the app for 14 days (a personal account needs this before the
   first public release). Make the closed test's list of testers (their Google accounts' emails) in Play Console,
   then run **Apps** with *upload*, track *alpha*, release *rollout*. The testers who speak Spanish, Portuguese, French
   or German also check those languages.
9. **(you)** After the 14 days, apply for production access in Play Console (Dashboard), answering its questions about
   the test.
10. Version 1.0.0: once Play gives production access, **Apps** with *upload*, track *production*, release *rollout*
    (or *draft*, to start a staged rollout by hand), and the App Store submission, with notes for the reviewers on
    what works offline, the reminders, share and haptics.

## Donations

The website has a Ko-fi button (the round button's list, About, and the help page) once `src/app/donate.json` holds
the Ko-fi page's name. The apps never show it: the App Store and Google Play want tips to a developer to go through
their own payments. The website's pages hide it too when the apps open them (`?app=1`).
