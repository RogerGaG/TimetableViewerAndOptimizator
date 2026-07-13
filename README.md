# Timetable Viewer and Optimizator

**Timetable Viewer and Optimizator** is a web application for viewing, customizing and optimizing university timetables.


The app can start from a prepared **FIB 2026 Q2** course catalog or from a fully custom timetable created by the user. It is designed to help students compare class combinations, detect scheduling conflicts, and generate optimized timetable proposals based on personal preferences.

## What You Can Do

- View available FIB subjects and class groups.
- Select subjects and groups manually and see the weekly timetable update immediately.
- Create a custom subject catalog with your own subjects, groups and class times.
- Add, delete, import and export subjects and classes through simplified JSON files.
- Choose which weekdays appear in the timetable.
- Customize colors for theory, lab, problem and other class types.
- Run timetable optimization algorithms and compare the best proposed schedules.

## How to Use the App

### 1. Choose a Starting Mode

When entering the app, choose one of the two starting modes:

- **FIB 2026 Q2**: starts from the prepared FIB course catalog.
- **Customize Timetable**: starts from an empty/custom catalog where you can add subjects and classes manually.

You can return to the mode selector from the top navigation.

### 2. Manual Timetable

In **Manual Timetable**, you can:

- Move subjects from the available list into your selected subjects.
- Choose theory, lab and problem groups for each subject.
- See the weekly timetable generated from the selected classes.
- Change visible days and class colors from the right-side settings panel.
- Add or delete extra subjects and classes.
- Import or export the current subject/class catalog as JSON.

This mode is useful when you already know which subjects you want and want to inspect possible class combinations manually.

### 3. Customize Subjects

If you choose **Customize Timetable**, you can build a catalog manually:

- Add a subject code and name.
- Add class groups with type, day, start time and end time.
- Add extra information notes.
- Import a previously exported JSON catalog.

After creating the subjects/classes, use **Go to Manual Timetable** to select them and view the timetable.

### 4. Timetable Optimizator

In **Timetable Optimizator**, select the subjects that the optimizer can use, then configure restrictions and preferences.

For each selected subject, you can configure:

- Course importance from `0` to `10`.
- Whether to attend theory, lab/problems, or both.
- Whether theory and lab/problem group families should match.
- Optional individual importance for each class group.

General optimization settings include:

- Number of courses to take.
- Number of recommended solutions to show.
- Gap preference: avoid gaps, prefer gaps or no preference.
- Free days preference.
- Preferred time of day.
- Hour-by-hour importance.
- Scoring weights for overlaps, group matching, free days, time of day and hourly slots.
- Whether best options must use different subject sets.
- Maximum number of combinations/evaluations.
- Optimization algorithm.

## Optimization Criteria

The optimizer scores each timetable out of `100`.

The base score rewards selecting the most important subjects. If individual class importance is enabled, the chosen class groups also affect this base score.

The final score can then be reduced by soft penalties such as:

- Class overlaps.
- Non-matching theory/lab group families.
- Lower-priority individual classes.
- Too many or too few free days.
- Classes outside the preferred time of day.
- Classes in lower-priority hourly slots.
- Free time between classes, depending on the selected gap preference.

Some preferences become hard restrictions when set to their maximum importance. Invalid timetables are discarded instead of scored. Examples include:

- Class overlaps when overlap importance is `10`.
- Forbidden hourly slots with importance `0`.
- Individual class groups with importance `0`.
- Morning-only or afternoon-only preference with importance `10`.
- No gaps or required gaps with gap importance `10`.
- Exact free-day requirements.
- Required matching group families.

## Optimization Algorithms

The app includes several search strategies:

- Random search.
- Hill climbing.
- Simulated annealing.
- Genetic algorithm.
- Branch and bound.
- Constraint search.

All algorithms use the same scoring model. Hard restrictions are used to discard invalid timetable candidates early when possible.

## Data and Persistence

The default FIB catalog is bundled with the project as JSON data. The app does not need an external API at runtime.

User changes are saved in the browser. When running with the Node.js server, the app can also write user catalog edits to `data/user/catalog-edits.json`.

On free hosting platforms such as Render, server-side files created at runtime can be temporary. For long-term backup of custom data, use the app's JSON export/import feature.

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
      problem.js         # optimizer model, valid options, scoring and hard restrictions
      engine.js          # shared progressive optimization runner
      algorithms/        # optimization algorithms
  scripts/
    prepare_data.py      # converts raw data into the processed catalog
  server.js              # Node.js static server and JSON endpoints
  render.yaml            # Render deployment configuration
```

## For Developers

Requirements:

- Node.js 18 or newer.
- Python 3 only if regenerating the catalog from `data/raw`.

Run locally:

```bash
npm install
npm start
```

Then open:

```text
http://localhost:3000
```

Regenerate the processed catalog after changing raw data:

```bash
npm run prepare-data
```

Run syntax checks:

```bash
npm run check
```

## Deployment

The project is deployed on Render as a Node.js web service.

Useful deployment settings:

```text
Build command: npm install
Start command: npm start
Health check path: /health
```

More details are available in [DEPLOYMENT.md](DEPLOYMENT.md).
