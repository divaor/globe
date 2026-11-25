# The stores' forms: what to answer (v0.48.0)

The answers for App Store Connect and the Google Play Console, checked against the app's code on 25 November 2026.
Only the developer account's owner can fill these in. If the app changes how it uses data, update this file and the
[privacy policy](../site/privacy/en.html) together.

## Addresses (both stores)

| Field | Value |
|---|---|
| Privacy policy | `https://divaor.github.io/globe/privacy.html` (App Store: per language, `privacy.es.html`, `privacy.pt.html`, `privacy.fr.html`, `privacy.de.html`) |
| Support | `https://divaor.github.io/globe/support.html?app=1` (`?app=1` hides the website's donation part from the apps' readers) |
| Marketing / website | `https://divaor.github.io/globe/` |
| Support email | Not chosen yet (decision P12): both stores need one before the first submission. |
| Category | Education; second category Reference (App Store), Education (Play) |
| Price | Free, no in-app purchases, no ads |

## App Store Connect: App Privacy

**Data Not Collected.** This matches the app's privacy manifest (`ios/App/App/PrivacyInfo.xcprivacy`, no collected
data types, no tracking).

- Nothing is sent to the developer, and the app has no analytics, advertising or crash-reporting code.
- Location: What lives here? and What grows here? send a point rounded to about 10 km to iNaturalist to answer the
  question at once. Neither Mundora nor any partner keeps it, which is outside Apple's definition of collection
  ("transmitting data off the device in a way that allows you and/or your third-party partners to access it for a
  period longer than what is necessary to service the transmitted request in real time"). The sky and Legacies of
  the past use the location on the device only.
- If App Review asks, the answer is the paragraph above.

## Google Play: Data safety

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes (approximate location only) |
| Is all of the user data collected by your app encrypted in transit? | Yes (every request is HTTPS) |
| Do you provide a way for users to request that their data is deleted? | Not needed: nothing is kept off the device. Choose the answer that says data is not stored, or "No" with the note that uninstalling deletes everything. |
| **Location → Approximate location** | Collected: Yes. Shared: No (sent to iNaturalist only when the user taps What lives here? or What grows here?, the "user-initiated" exemption). Processed ephemerally: No (the app cannot vouch for iNaturalist's server logs). Required or optional: Optional. Purpose: App functionality. |
| Every other data type | Not collected |

Play counts any data sent off the device as collected, even when the developer never receives it. That is why this
answer differs from Apple's.

## Content ratings

### App Store (age rating questionnaire)

| Question | Answer | Why |
|---|---|---|
| Parental controls / age assurance | No / No | |
| Unrestricted web access | No | Every outside link opens in the phone's browser (`src/native/links.ts`), never inside the app. |
| User-generated content, messaging and chat | No | Your own data (CSV) stays on the device and is never shown to anyone else. |
| Advertising | No | |
| Gambling, contests, loot boxes | No | |
| Violence (realistic) | Infrequent/Mild | Wars and conquests, described in words on a map, no pictures of violence. |
| Medical or treatment information | Infrequent/Mild | Plagues and cures stories. |
| Alcohol, tobacco or drug use or references | Infrequent/Mild | Food and trade stories (wine, coffee, tea, the opium trade). |
| Horror or fear themes | None | |
| Profanity or crude humour | None | |
| Mature or suggestive themes | None | |
| Sexual content or nudity | **Infrequent/Mild** (Diego's decision, 25 November 2026) | The art guide and the art stories show famous paintings and sculptures with nudes (The Birth of Venus, Olympia, Venus of Urbino, La maja desnuda). This likely makes the App Store rating 13+. |

### Google Play (IARC questionnaire)

Category: Reference, News, or Educational. Answer as above: no violence shown in pictures, references to drugs and
alcohol in a historical context, and nudity in classic works of art, answered as on the App Store (occasional, mild, non-sexual). No user interaction, no sharing of
location with other users, no purchases.

## Export compliance (App Store)

The app uses only the encryption built into iOS (HTTPS). `ITSAppUsesNonExemptEncryption` is `false` in
`ios/App/App/Info.plist`, so App Store Connect does not ask again for each build.

## Content rights (App Store)

Does your app contain, show or access third-party content? **Yes, and I have the rights to use it**. Every source is
listed with its licence in the app (About and credits) and on `credits.html`: public-domain and openly licensed data
and pictures (CC0, CC BY, CC BY-SA, ODbL), and articles read live from Wikipedia under CC BY-SA.

## Play: other declarations

| Declaration | Answer |
|---|---|
| Ads | No ads |
| App access | All of the app works without an account or login |
| Target audience | 13 and over (not designed for children, so the Families policy does not apply; children may still use it) |
| News app | No |
| Government app | No |
| Financial features | None |
| Health | None |
| Location permission | Foreground, approximate only (`ACCESS_COARSE_LOCATION`), no background location |
