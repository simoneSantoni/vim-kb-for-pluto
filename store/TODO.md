# Publication TODO

Steps to get the extension onto the Chrome Web Store. Rough order below — do #2 first so any bugs are fixed before the store snapshot goes out.

## 1. Test extension end-to-end against a live Pluto notebook
Load the unpacked extension in Chrome (`chrome://extensions` → Load unpacked), open a Pluto notebook on localhost, and verify:
- Mode badge appears in the bottom-left.
- Intra-cell motions and operators work.
- `Esc` from a clean Normal drops into Notebook mode.
- Cell navigation (`j/k/gg/G/Enter/i/yy/p/P/o/O/dd`) works.
- Popup toggle enables/disables correctly.

Note any Pluto-version-specific selector mismatches for add/delete cell.

## 2. Register Chrome Web Store developer account
Go to https://chrome.google.com/webstore/devconsole, sign in, pay the one-time $5 registration fee, and complete email/identity verification.

## 3. Capture screenshots from a live Pluto notebook
Capture at least one screenshot at 1280×800 or 640×400. Suggested shots:
1. Normal mode with the `-- NORMAL --` badge visible.
2. Insert mode mid-typing (green badge).
3. Notebook mode with an active cell outlined (orange badge).
4. The toolbar popup showing the on/off toggle.

Save under `store/screenshots/`.

## 4. Fill in support email in `store/LISTING.md`
The "Support email" line at the bottom of `store/LISTING.md` is blank. Add the email address that will be shown on the store listing.

## 5. Build and upload the extension ZIP
Run `./store/build-zip.sh` from the repo root to produce `vim-kb-for-pluto-1.0.0.zip` (~55 KB). Upload it as a new item in the Developer Dashboard.

## 6. Fill out store listing from `LISTING.md`
Paste into the dashboard:
- Name, summary, detailed description
- Category: Developer Tools
- Single-purpose statement
- Permission justifications

Upload `icons/icon128.png` (reused as store icon) and `store/promo-tile-440x280.png`.

## 7. Declare privacy practices and link policy
In the dashboard's Privacy tab, check:
- Does not collect user data
- Does not use remote code
- Does not sell/transfer data

Paste the raw GitHub URL to `store/PRIVACY.md` as the privacy policy URL.

## 8. Submit for review and monitor status
Click Submit for review. Initial review typically takes 1–7 days. If rejected, the dashboard email explains exactly what to change — common issues for localhost-only extensions are vague permission justifications. Re-upload after fixes.

## 9. Tag the published release in git
Once live on the store:
```
git tag v1.0.0
git push --tags
```
