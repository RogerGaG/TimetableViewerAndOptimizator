# Timetable Viewer and Optimizator

Timetable Viewer and Optimizator is a web application for building, visualizing and optimizing university timetables. It can start from a prepared FIB UPC 2026 Q2 catalog or from a fully custom catalog created by the user.

The project is designed as a complete browser-based timetable planning tool: users can select subjects, choose class groups, customize visible days and colors, import/export simplified catalogs, and generate optimized timetable proposals according to their own preferences.

## Live Demo

A deployment URL can be added here after publishing the project.

## Main Features

- **Timetable mode selector**: choose between the prepared `FIB 2026 Q2` catalog and a custom timetable catalog.
- **Manual timetable viewer**: select subjects and class groups and see the resulting weekly timetable immediately.
- **Custom subject editor**: create subjects, class groups, weekly sessions and extra notes manually.
- **Import/export support**: download or load simplified JSON files containing subjects, classes and extra information.
- **Configurable visible days**: choose which weekdays appear in the timetable, from Monday to Sunday.
- **Class color settings**: customize colors for theory, lab, problem and other session types.
- **Optimization mode**: search for timetable proposals using selected courses and user-defined preferences.
- **Multiple algorithms**: random search, hill climbing, simulated annealing, genetic algorithm, branch and bound, and constraint search.

## Optimization Criteria

The optimizer starts from the selected courses and tries to find combinations of theory and lab/problem groups that produce the best timetable. Scores are shown out of 100.

The base score rewards choosing the most important courses. If individual class importance is enabled for a course, the selected groups also affect that base score.

Soft scoring factors can include:

- class overlaps
- matching theory and lab/problem group families
- individual class preferences
- free days
- morning or afternoon preference
- importance by hourly time slot
- free time between classes, through the selected gap preference and importance

Some preferences can become hard restrictions. When a hard restriction is active, invalid timetables are discarded instead of being scored. Examples include:

- class overlaps when overlap importance is maximum
- exact course count
- exact free-day count when that mode is selected
- no gaps or required gaps when gap importance is maximum
- morning-only or afternoon-only timetables when time preference importance is maximum
- forbidden hourly slots with importance `0`
- class groups with individual importance `0`
- required matching group families

The option **Only different subjects best options** controls whether the best results must use different sets of subjects. When enabled, only the best timetable for each subject set is kept; when disabled, multiple group/time variations for the same subjects can appear.

## Project Structure

```text
timetable-viewer-and-optimizator/
  data/
    raw/                 # source catalog files
    processed/           # normalized catalog consumed by the app
  public/
    index.html           # application markup
    styles.css           # application styles
    app.js               # main frontend controller
    catalog.json         # static copy of the processed catalog
    optimizer/
      problem.js         # optimizer model, options, hard restrictions and scoring
      engine.js          # shared progressive optimization runner
      algorithms/        # optimization algorithms
  scripts/
    prepare_data.py      # converts raw data into the processed catalog
  server.js              # Node.js static server and JSON endpoints
  render.yaml            # optional Render deployment configuration
```

## Requirements

- Node.js 18 or newer
- Python 3, only needed when regenerating the catalog from `data/raw`

The app does not require a database or external API at runtime.

## Run Locally

```bash
npm install
npm start
```

Then open:

```text
http://localhost:3000
```

If the raw catalog files change, regenerate the processed catalog:

```bash
npm run prepare-data
```

## Validation

Run the JavaScript syntax checks:

```bash
npm run check
```

## Data and Persistence Notes

The default FIB catalog is stored in the repository as JSON. User edits are saved in the browser and, when the Node server is running, also written to `data/user/catalog-edits.json`.

`data/user/` is intentionally ignored by Git because it contains runtime-generated local user data. On free hosting platforms with ephemeral storage, server-side saved edits may be lost after a restart. Imported/exported JSON files are the recommended portable way to preserve custom catalogs.

## Deployment

The project can be deployed as a Node.js web service. Render is a good first option because it can connect directly to GitHub and run `npm start`.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the recommended deployment steps.

## Status

This is a portfolio-ready timetable planning project with a working frontend, local/custom catalog support, a Node.js server, data preprocessing, and several optimization strategies.
