# Miller Hardware website

Live at https://miller-hardware.github.io — Harrison and Yellville, Arkansas.

Plain HTML, CSS and JavaScript served by GitHub Pages. Day-to-day content (used units, specials,
jobs, store hours, brand lists, the announcement banner and contact-form messages) is edited at
`/admin.html` and stored in the Firebase project `miller-hardware-site`.

- `admin.html`, `admin.js`: staff admin page (sign-in required; staff are listed in Firestore `admins`).
- `site.js`, `site-data.js`, `firebase-config.js`: public site script, built-in defaults, Firebase connection.
- `firestore.rules`: the database access rules, as published in the Firebase console.
- `README-ADMIN-SETUP.md`: how the Firebase side is set up.
- `fonts/`: Fraunces and Inter Tight, under the SIL Open Font License (see the OFL files).
