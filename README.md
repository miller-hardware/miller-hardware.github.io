# Miller Hardware Website

A single-file, self-contained website (`index.html`) for Miller Hardware —
Harrison & Yellville, AR. No build tools needed; it's plain HTML/CSS/JS and
can be hosted anywhere, including free on GitHub Pages.

## Before you go live — please double-check

A few things were assumed or left as placeholders and should be confirmed
before this goes public:

- **Zip codes** were left off both addresses on purpose — add them once
  confirmed (search "Harrison, AR" address in the HTML for `2 Necessity Ave,
  Harrison, AR` and `1609 Highway 62 W, Yellville, AR`).
- **Saw Shop hours** are not shown separately — the page assumes the same
  hours as the Yellville Main Store since it's the same building. Let me
  know if the Saw Shop keeps different hours.
- **Social media links** (Facebook/Instagram icons in the footer) are
  placeholders (`href="#"`). Swap in your real page URLs when ready.
- **Brand names** in the Saw Shop section (Echo, Ferris, Scag, Exmark,
  Senix) — please confirm spelling/accuracy.
- **Photos**: the site currently uses simple illustrated placeholder
  graphics instead of real photos. Swapping in real store/team/product
  photos later will make a big difference — happy to help with that
  whenever you have them.

## Hosting on GitHub Pages (free)

See the step-by-step walkthrough provided in chat. Short version:

1. Create a new **public** GitHub repository.
2. Upload `index.html` (and this README, optional) to the repo.
3. In the repo, go to **Settings → Pages**, set the source to the `main`
   branch, root folder, and save.
4. GitHub will give you a live URL like
   `https://yourusername.github.io/repo-name/` within a minute or two.
5. Optional: point a custom domain (e.g. millerhardware.com) at it later
   via a CNAME file and DNS settings — ask if/when you get a domain.
