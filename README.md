# Absolute Value — Parallel Reader (POC)

This repository hosts a minimal static prototype of a parallel scripture reader for a quick partner demo.

- Site source lives in `root/`
- No build step; it’s plain HTML/CSS/JS
- GitHub Pages workflow auto-deploys from the `root/` folder on every push to `main`

## Local Preview
Open `root/index.html` directly in your browser. Demo data is embedded inline, so it works without a server.

## Hosted Preview (GitHub Pages)
Once this repo is pushed to GitHub, the included workflow deploys to Pages on each push to `main`. The site will appear at:

- User org site: `https://<user>.github.io/<repo>/`

No additional configuration is needed beyond pushing the repo; the workflow handles upload and deploy.

## Notes
- Demo sources are family-constrained (e.g., `bible.en`) and include: `KJV`, `KJV-AV.gpt-5`, `KJV-AV.gpt4o-mini`.
- Page artifacts are generated directly from `root/` (no bundler).

