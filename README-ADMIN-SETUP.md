# Miller Hardware admin: one-time setup

The public site works on its own. These steps switch on the staff admin page (`admin.html`) so you can edit used units, store addresses and hours, brand lists and the announcement banner without asking anyone.

It uses Firebase's free plan. There is no file storage and no billing: photos are shrunk in your browser and saved with each unit.

**Recommended:** make a brand-new Firebase project for this site, so it stays separate from any other app (for example the Saw Shop app) and their rules cannot overwrite each other.

## 1. Create the project

1. Go to https://console.firebase.google.com and click **Create a project**. Name it something like `miller-hardware-site`.
2. Turn Google Analytics off. Click **Create project**.

## 2. Create the database

1. In the left menu choose **Build > Firestore Database > Create database**.
2. Pick a location near you (for example `us-central`). Start in **production mode**.

## 3. Turn on sign-in

1. **Build > Authentication > Get started**.
2. Under **Sign-in method**, enable **Email/Password** (the first switch only).

## 4. Add yourself and your managers

1. **Authentication > Users > Add user.** Enter an email and a password. Do this once for each person.
2. Copy each person's **User UID** from that list. You need it in the next step.

## 5. Mark them as staff

Signing in is not enough. Only people on this list can save changes.

1. **Firestore Database > Start collection.** Collection ID: `admins`.
2. For the Document ID, paste a person's **User UID** (not their email). Add one field: `name` (string), with their name.
3. Repeat **Add document** for each manager.

## 6. Publish the rules

1. **Firestore Database > Rules.**
2. Replace the contents with `firestore.rules` from this folder, then **Publish**.
   If this project already has other rules, add the blocks from that file instead of replacing yours.

## 7. Connect the website

1. **Project settings (gear icon) > General > Your apps > Web (`</>`).** Register an app (skip hosting).
2. Copy `apiKey`, `authDomain` and `projectId` into `firebase-config.js`, replacing the `REPLACE_ME` values.
3. Upload the changed `firebase-config.js` to GitHub next to `index.html`.

## 8. Allow your website address

1. **Authentication > Settings > Authorized domains > Add domain.**
2. Add the address your site lives on, for example `yourname.github.io` (or your own domain if you have one).

## 9. Sign in

Open `https://your-site-address/admin.html`. Sign in with the email and password from step 4.

## Things worth knowing

- **Photos:** up to 3 per unit, shrunk automatically. Keep the listed units to about a dozen so the saw shop page stays quick to load on phones.
- **Sold units:** ticking "Sold" takes a unit off the website right away. It stays in the admin list, so you can mark it available again or delete it.
- **Prices:** new equipment shows "Call for price". Used units show the price you type. Leave the price blank on a used unit and it will say "Call for price" too.
- **Phone numbers** are not editable in the admin. They are in the page files.
- **Passwords:** to reset one, use **Authentication > Users > the three dots > Reset password**. To remove someone, delete their `admins` document.
- `admin.html` asks search engines not to list it, but it is a public web address. The sign-in and the rules in step 6 are what keep strangers out.
- The `apiKey` in `firebase-config.js` is not a secret. It only identifies your project.
