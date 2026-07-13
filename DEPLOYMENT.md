# Deployment Guide

This project is designed to run as a Node.js web service. GitHub Pages is not the best target because the project includes `server.js`, JSON endpoints and runtime catalog handling. Render is a simple option for the first public deployment.

## 1. Prepare the Repository

From the project folder:

```bash
git init
git add .
git commit -m "Initial public version"
```

Create a new GitHub repository and follow GitHub's instructions to push the local repository.

Before pushing, check that generated or local-only files are ignored:

```bash
git status --short
```

Files such as `data/user/`, `__pycache__/`, `.env`, `.agents/` and `.codex/` should not be committed.

## 2. Deploy on Render

1. Create or log in to a Render account.
2. Choose **New** -> **Web Service**.
3. Connect the GitHub repository.
4. Use these settings:

```text
Environment: Node
Build command: npm install
Start command: npm start
Health check path: /health
```

The included `render.yaml` contains equivalent settings if you prefer Render's Blueprint flow.

## 3. Render Free Plan Notes

On Render's free web service plan, the server may sleep after a period without traffic. The first visit after sleeping can take longer while the service starts again.

The app does not need server-side persistence for the default demo. However, the endpoint that saves user catalog edits writes to `data/user/catalog-edits.json`. On free hosting with ephemeral storage, that file should be treated as temporary. Use the app's export/import JSON feature to preserve custom catalogs reliably.

## 4. Production Checklist

- Confirm `npm start` works locally.
- Confirm `npm run check` passes.
- Push the latest code to GitHub.
- Deploy from GitHub to Render.
- Add the Render URL to the `Live Demo` section of `README.md`.
- Test both starting modes: `FIB 2026 Q2` and `Customize Timetable`.
- Test manual timetable selection and the optimizer with a small number of courses first.

## 5. Useful Commands

```bash
npm install
npm start
npm run check
npm run prepare-data
```
