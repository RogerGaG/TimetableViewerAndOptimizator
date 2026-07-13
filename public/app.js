import { ALGORITHM_LABELS, createOptimizationRun } from "./optimizer/engine.js";

const DAYS = [
  { id: 1, name: "Monday" },
  { id: 2, name: "Tuesday" },
  { id: 3, name: "Wednesday" },
  { id: 4, name: "Thursday" },
  { id: 5, name: "Friday" },
  { id: 6, name: "Saturday" },
  { id: 7, name: "Sunday" },
];

const DEFAULT_VISIBLE_DAY_IDS = [1, 2, 3, 4, 5];
const HOUR_SLOTS = buildHourSlots("08:00", "20:00");
const CUSTOM_CATALOG_STORAGE_KEY = "fib-timetable-custom-catalog";
const USER_CATALOG_STORAGE_KEY = "timetable-viewer-user-catalogs";
const VISIBLE_DAYS_STORAGE_KEY = "fib-timetable-visible-days";
const COLOR_STORAGE_KEY = "fib-timetable-color-settings";
const OPTIMIZATION_STORAGE_KEY = "fib-timetable-optimization-preferences";
const COLOR_PRESETS = {
  yellow: { label: "Yellow", value: "#eab308" },
  blue: { label: "Blue", value: "#2563eb" },
  green: { label: "Green", value: "#16a34a" },
  orange: { label: "Orange", value: "#d97706" },
  red: { label: "Red", value: "#dc2626" },
  purple: { label: "Purple", value: "#7c3aed" },
  pink: { label: "Pink", value: "#db2777" },
  gray: { label: "Gray", value: "#6b7280" },
};

const COLOR_CATEGORIES = [
  { key: "theory", label: "Theory", cssVar: "--theory", defaultColor: COLOR_PRESETS.yellow.value },
  { key: "lab", label: "Lab", cssVar: "--lab", defaultColor: COLOR_PRESETS.blue.value },
  { key: "problem", label: "Problem", cssVar: "--problem", defaultColor: COLOR_PRESETS.green.value },
  { key: "other", label: "Other", cssVar: "--other", defaultColor: COLOR_PRESETS.orange.value },
];

const SCORING_WEIGHT_FIELDS = [
  { key: "overlaps", id: "weightOverlaps", defaultValue: 10, maxValue: 10 },
  { key: "matchingGroups", id: "weightMatchingGroups", defaultValue: 0, maxValue: 10 },
  { key: "individualClasses", id: "weightIndividualClasses", defaultValue: 0, maxValue: 10 },
  { key: "freeDays", id: "weightFreeDays", defaultValue: 2, maxValue: 10 },
  { key: "timeOfDay", id: "weightTimeOfDay", defaultValue: 10, maxValue: 10 },
  { key: "hourlySlots", id: "weightHourlySlots", defaultValue: 10, maxValue: 10 },
];

const state = {
  baseFibCatalog: null,
  fibCatalog: null,
  customCatalog: loadCustomCatalog(),
  catalog: null,
  eligibleCourses: [],
  activeMode: null,
  activeView: getViewFromHash(),
  searchText: "",
  selectedCourseCodes: [],
  selectedGroupsByCourse: {},
  visibleDayIds: loadVisibleDayIds(),
  colorSettings: loadColorSettings(),
  optimizationSearchText: "",
  optimization: loadOptimizationPreferences("fib"),
  optimizer: {
    runId: 0,
    running: false,
    completed: false,
    bestSolutions: [],
    evaluated: 0,
    targetEvaluations: 0,
    requestedSolutions: 1,
    algorithmKey: "random",
    algorithmLabel: ALGORITHM_LABELS.random,
    provenOptimal: false,
    infeasible: false,
    stoppedByLimit: false,
    searchSpaceSize: 0,
    activeRun: null,
  },
};

async function init() {
  applyColorSettings();
  bindUi();
  renderAll();

  try {
    state.baseFibCatalog = await loadFibCatalog();
    state.fibCatalog = cloneCatalog(state.baseFibCatalog);
    const savedCatalogs = await loadSavedCatalogs();
    if (isValidCatalog(savedCatalogs?.customCatalog)) state.customCatalog = savedCatalogs.customCatalog;
    if (state.activeMode === "fib") activateMode("fib", { skipRender: true });
    renderAll();
  } catch (error) {
    console.error(error);
    showCatalogLoadError();
  }
}

async function loadFibCatalog() {
  const catalogPaths = [
    "/catalog.json",
    "catalog.json",
    "/data/processed/catalog.json",
    "../data/processed/catalog.json",
  ];

  let lastError = null;
  for (const catalogPath of catalogPaths) {
    try {
      const response = await fetch(catalogPath, { cache: "no-store" });
      if (!response.ok) throw new Error(`${catalogPath} returned ${response.status}`);
      const catalog = await response.json();
      if (isValidCatalog(catalog)) return catalog;
      throw new Error(`${catalogPath} is not a valid timetable catalog`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Could not load the FIB catalog");
}

function isValidCatalog(catalog) {
  return Array.isArray(catalog?.courses)
    && Array.isArray(catalog?.courseGroups)
    && Array.isArray(catalog?.sessions);
}

function showCatalogLoadError() {
  const container = document.getElementById("availableCoursesList");
  if (container) container.innerHTML = '<div class="empty-state">Could not load the FIB catalog.</div>';
}

function bindUi() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => activateMode(button.dataset.mode));
  });
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => setActiveView(button.dataset.view));
  });
  window.addEventListener("hashchange", () => {
    state.activeView = getViewFromHash();
    renderNavigation();
  });

  document.getElementById("returnModeSelectorBtn").addEventListener("click", returnToModeSelector);

  document.getElementById("clearSelectionBtn").addEventListener("click", () => {
    state.selectedCourseCodes = [];
    state.selectedGroupsByCourse = {};
    renderManualView();
  });

  document.getElementById("goToManualFromCustomizeBtn").addEventListener("click", () => setActiveView("manual"));
  document.getElementById("exportCatalogBtn").addEventListener("click", exportActiveCatalog);
  document.getElementById("manualImportCatalogInput").addEventListener("change", (event) => handleCatalogImport(event, "manual"));
  document.getElementById("customImportCatalogInput").addEventListener("change", (event) => handleCatalogImport(event, "custom"));
  document.getElementById("customCourseForm").addEventListener("submit", (event) => handleCustomCourseSubmit(event, "custom"));
  document.getElementById("customClassForm").addEventListener("submit", (event) => handleCustomClassSubmit(event, "custom"));
  document.getElementById("manualCustomCourseForm").addEventListener("submit", (event) => handleCustomCourseSubmit(event, "manual"));
  document.getElementById("manualCustomClassForm").addEventListener("submit", (event) => handleCustomClassSubmit(event, "manual"));
  document.getElementById("customExtraInfoForm").addEventListener("submit", (event) => handleExtraInfoSubmit(event, "custom"));
  document.getElementById("manualExtraInfoForm").addEventListener("submit", (event) => handleExtraInfoSubmit(event, "manual"));
  document.getElementById("customDeleteCourseForm").addEventListener("submit", (event) => handleDeleteCourseSubmit(event, "custom"));
  document.getElementById("manualDeleteCourseForm").addEventListener("submit", (event) => handleDeleteCourseSubmit(event, "manual"));
  document.getElementById("customDeleteClassForm").addEventListener("submit", (event) => handleDeleteClassSubmit(event, "custom"));
  document.getElementById("manualDeleteClassForm").addEventListener("submit", (event) => handleDeleteClassSubmit(event, "manual"));
  ["custom", "manual"].forEach((scope) => {
    const config = getCustomBuilderConfig(scope);
    document.getElementById(config.classCourseSelect).addEventListener("change", () => updateNextGroupValue(scope));
    document.getElementById(config.classStartInput).addEventListener("change", (event) => normalizeHourInput(event.target));
    document.getElementById(config.classEndInput).addEventListener("change", (event) => normalizeHourInput(event.target));
  });

  document.getElementById("optimizationCourseSearchInput").addEventListener("input", (event) => {
    state.optimizationSearchText = event.target.value.trim().toLowerCase();
    renderOptimizationAvailableCourses();
  });

  document.getElementById("saveOptimizationBtn").addEventListener("click", () => {
    saveOptimizationPreferences(true);
  });

  document.getElementById("optimizeTimetableBtn").addEventListener("click", startOptimizationSearch);

  [
    "desiredCourseCount",
    "recommendedSolutionCount",
    "onlyDifferentSubjectsBestOptions",
    "gapPreference",
    "gapImportance",
    "freeDaysMode",
    "exactFreeDays",
    "timeOfDayPreference",
    "timeOfDayImportance",
    "optimizationAlgorithm",
    "maxSearchCombinations",
    ...SCORING_WEIGHT_FIELDS.map((field) => field.id),
  ].forEach((id) => {
    document.getElementById(id).addEventListener("change", updateGlobalOptimizationPreferences);
  });
  document.getElementById("recommendedSolutionCount").addEventListener("input", (event) => {
    if (event.target.value === "") return;
    event.target.value = clampNumber(event.target.value, 1, 10, 1);
  });
  document.getElementById("hourlyImportanceGrid").addEventListener("change", (event) => {
    if (!event.target.matches(".hourly-importance-input")) return;
    const slotKey = event.target.dataset.slotKey;
    state.optimization.general.hourlyImportance[slotKey] = clampNumber(event.target.value, 0, 10, 10);
    event.target.value = state.optimization.general.hourlyImportance[slotKey];
    saveOptimizationPreferences();
    clearOptimizationResults();
  });
}

function renderAll() {
  renderNavigation();
  renderColorControls();
  renderDayControls();
  renderCustomBuilders();
  if (state.catalog) {
    renderManualView();
    renderOptimizationView();
  }
}

function setActiveView(view) {
  if (!["manual", "optimization", "customize"].includes(view)) return;
  state.activeView = view;
  const hashByView = { manual: "#manual", optimization: "#optimization", customize: "#customize" };
  const nextHash = hashByView[view];
  if (window.location.hash !== nextHash) window.location.hash = nextHash;
  renderAll();
}

function getViewFromHash() {
  if (window.location.hash === "#optimization") return "optimization";
  if (window.location.hash === "#customize") return "customize";
  return "manual";
}

function returnToModeSelector() {
  if (state.activeMode) saveOptimizationPreferences();
  state.activeMode = null;
  state.catalog = null;
  state.eligibleCourses = [];
  state.selectedCourseCodes = [];
  state.selectedGroupsByCourse = {};
  state.optimizationSearchText = "";
  clearOptimizationResults({ silent: true });
  if (window.location.hash) window.location.hash = "";
  state.activeView = "manual";
  renderAll();
}

function renderNavigation() {
  const hasMode = Boolean(state.activeMode);
  const showAppChrome = hasMode && state.activeView !== "customize";
  document.querySelector(".main-navigation").hidden = !showAppChrome;
  document.querySelector(".topbar-actions").hidden = !hasMode;
  document.getElementById("modeView").hidden = hasMode;
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });
  document.getElementById("manualView").hidden = !hasMode || state.activeView !== "manual";
  document.getElementById("customizeView").hidden = !hasMode || state.activeView !== "customize";
  document.getElementById("optimizationView").hidden = !hasMode || state.activeView !== "optimization";
  document.getElementById("clearSelectionBtn").hidden = !hasMode || state.activeView !== "manual";
  document.getElementById("sideSettingsPanel").hidden = !showAppChrome;
  document.body.classList.toggle("with-side-settings", showAppChrome);

}

function renderManualView() {
  if (!state.catalog) return;
  renderAvailableCourses();
  renderSelectedCourses();
  renderTimetable();
  renderExtraInfo();
  renderCustomBuilders();
}

function renderColorControls() {
  const container = document.getElementById("colorControls");
  if (!container) return;
  container.innerHTML = COLOR_CATEGORIES.map((category) => {
    const currentColor = state.colorSettings[category.key];
    return `
      <div class="color-control-card">
        <span class="color-control-label">${escapeHtml(category.label)}</span>
        <details class="color-dropdown">
          <summary class="color-dropdown-summary">
            <span class="color-swatch" style="background:${escapeHtml(currentColor)};"></span>
            <span>${escapeHtml(getColorName(currentColor))}</span>
          </summary>
          <div class="color-dropdown-menu">
            ${Object.values(COLOR_PRESETS).map((preset) => `
              <button type="button" class="color-option-button" data-color-category="${category.key}" data-color-value="${preset.value}">
                <span class="color-swatch" style="background:${preset.value};"></span>
                <span>${preset.label}</span>
              </button>
            `).join("")}
          </div>
        </details>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".color-option-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.colorSettings[button.dataset.colorCategory] = button.dataset.colorValue;
      saveColorSettings();
      applyColorSettings();
      renderColorControls();
      renderTimetable();
      if (state.optimizer.bestSolutions.length) renderOptimizationResults();
    });
  });
}

function renderAvailableCourses() {
  const container = document.getElementById("availableCoursesList");
  const courses = state.eligibleCourses
    .filter((course) => !state.selectedCourseCodes.includes(course.code))
    .sort((a, b) => a.code.localeCompare(b.code));

  if (!courses.length) {
    container.innerHTML = '<div class="empty-state">No courses available.</div>';
    return;
  }

  container.innerHTML = courses.map((course) => `
    <div class="available-course-row">
      <button class="arrow-button add-course-button" data-course-code="${escapeHtml(course.code)}" title="Add course">&rarr;</button>
      <span class="course-code-only">${escapeHtml(course.code)}</span>
    </div>
  `).join("");

  container.querySelectorAll(".add-course-button").forEach((button) => {
    button.addEventListener("click", () => addCourse(button.dataset.courseCode));
  });
}

function renderSelectedCourses() {
  const container = document.getElementById("selectedCoursesList");
  if (!state.selectedCourseCodes.length) {
    container.innerHTML = '<div class="empty-state">No courses selected yet.</div>';
    return;
  }

  const groupsByCourse = groupBy(state.catalog.courseGroups, (group) => group.courseCode);
  container.innerHTML = state.selectedCourseCodes.map((courseCode, index) => {
    const course = getCourse(courseCode);
    const groups = [...(groupsByCourse.get(courseCode) || [])].sort(compareGroups);
    const selected = new Set(state.selectedGroupsByCourse[courseCode] || []);
    const theory = groups.filter((group) => group.isTheoryGroup);
    const labsAndProblems = groups.filter((group) => !group.isTheoryGroup);

    return `
      <article class="selected-course-card">
        <div class="selected-course-header">
          <div class="selected-course-left">
            <button class="arrow-button remove-course-button" data-course-code="${escapeHtml(courseCode)}" title="Remove course">&larr;</button>
            <div class="course-code-only large">${escapeHtml(course.code)}</div>
          </div>
          <div class="course-order-buttons">
            <button class="tiny-button move-up-button" data-course-code="${escapeHtml(courseCode)}" ${index === 0 ? "disabled" : ""}>&uarr;</button>
            <button class="tiny-button move-down-button" data-course-code="${escapeHtml(courseCode)}" ${index === state.selectedCourseCodes.length - 1 ? "disabled" : ""}>&darr;</button>
          </div>
        </div>
        <div class="group-sections">
          ${renderGroupSection(courseCode, "Theory", theory, selected, "theory")}
          ${renderGroupSection(courseCode, "Labs and Problems", labsAndProblems, selected, "labsProblems")}
        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll(".remove-course-button").forEach((button) => {
    button.addEventListener("click", () => removeCourse(button.dataset.courseCode));
  });
  container.querySelectorAll(".move-up-button").forEach((button) => {
    button.addEventListener("click", () => moveCourse(button.dataset.courseCode, -1));
  });
  container.querySelectorAll(".move-down-button").forEach((button) => {
    button.addEventListener("click", () => moveCourse(button.dataset.courseCode, 1));
  });
  container.querySelectorAll(".group-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      toggleGroup(event.target.dataset.courseCode, event.target.dataset.group, event.target.checked);
    });
  });
  container.querySelectorAll(".group-bulk-button").forEach((button) => {
    button.addEventListener("click", () => {
      toggleGroupCollection(button.dataset.courseCode, button.dataset.sectionKind, button.dataset.action);
    });
  });
}

function renderGroupSection(courseCode, title, groups, selected, sectionKind) {
  if (!groups.length) {
    return `<section class="group-section"><div class="group-section-header"><h4>${escapeHtml(title)}</h4></div><div class="empty-inline">No groups</div></section>`;
  }

  return `
    <section class="group-section">
      <div class="group-section-header">
        <h4>${escapeHtml(title)}</h4>
        <div class="bulk-actions">
          <button type="button" class="group-bulk-button" data-course-code="${escapeHtml(courseCode)}" data-section-kind="${sectionKind}" data-action="select">All</button>
          <button type="button" class="group-bulk-button" data-course-code="${escapeHtml(courseCode)}" data-section-kind="${sectionKind}" data-action="clear">None</button>
        </div>
      </div>
      <div class="group-checkbox-list">
        ${groups.map((group) => `
          <label class="group-checkbox-row">
            <input class="group-checkbox" type="checkbox" data-course-code="${escapeHtml(courseCode)}" data-group="${escapeHtml(group.group)}" ${selected.has(group.group) ? "checked" : ""} />
            <span>G${escapeHtml(group.group)}</span>
          </label>
        `).join("")}
      </div>
    </section>
  `;
}

function renderTimetable() {
  const wrapper = document.getElementById("timetableWrapper");
  const hint = document.getElementById("timetableHint");
  if (hint) {
    const visibleNames = getVisibleDays().map((day) => day.name).join(", ");
    hint.textContent = `${visibleNames || "No days selected"}, 08:00-20:00, shown in 1-hour slots.`;
  }
  if (!state.selectedCourseCodes.length) {
    wrapper.innerHTML = '<div class="empty-state">Select some courses and groups to display a timetable.</div>';
    return;
  }
  if (!getVisibleDays().length) {
    wrapper.innerHTML = '<div class="empty-state">Select at least one visible day.</div>';
    return;
  }
  wrapper.innerHTML = buildTimetableHtml(state.selectedGroupsByCourse);
}

function buildTimetableHtml(selectedGroupsByCourse, compact = false, slots = HOUR_SLOTS) {
  const eventsByCell = buildEventsByHourCell(selectedGroupsByCourse, slots);
  const visibleDays = getVisibleDays();
  let html = `<div class="timetable-grid ${compact ? "compact-timetable" : ""}" style="--day-count:${visibleDays.length};">`;
  html += '<div class="time-header">Time</div>';
  html += visibleDays.map((day) => `<div class="day-header">${day.name}</div>`).join("");

  for (const slot of slots) {
    html += `<div class="time-label">${slot.label}</div>`;
    for (const day of visibleDays) {
      const events = eventsByCell.get(`${day.id}-${slot.startMinutes}`) || [];
      html += `<div class="slot-cell ${events.length ? "has-events" : ""}">`;
      html += events.map((event) => `
        <div class="event-card ${getSessionVariantClass(event.classTypeCode)}">
          ${escapeHtml(event.courseCode)} G${escapeHtml(event.group)}
        </div>
      `).join("");
      html += "</div>";
    }
  }
  return `${html}</div>`;
}

function buildCompactTimetableHtml(selectedGroupsByCourse) {
  const chosenSessions = state.catalog.sessions.filter((session) => {
    return session.scheduled
      && state.visibleDayIds.includes(Number(session.dayOfWeek))
      && (selectedGroupsByCourse[session.courseCode] || []).includes(session.group);
  });
  if (!chosenSessions.length) {
    return '<div class="empty-state">No scheduled classes in this solution.</div>';
  }

  const earliest = Math.floor(Math.min(...chosenSessions.map((session) => toMinutes(session.startTime))) / 60) * 60;
  const latest = Math.ceil(Math.max(...chosenSessions.map((session) => toMinutes(session.endTime))) / 60) * 60;
  const slots = buildHourSlots(formatMinutes(earliest), formatMinutes(latest));
  return buildTimetableHtml(selectedGroupsByCourse, true, slots);
}

function renderExtraInfo() {
  const box = document.getElementById("extraInfoBox");
  const commentsByCourse = groupBy(state.catalog.courseComments, (comment) => comment.courseCode);
  const blocks = state.selectedCourseCodes.map((courseCode) => {
    const comments = commentsByCourse.get(courseCode) || [];
    if (!comments.length) return "";
    return `
      <div class="extra-course-block">
        <h3>${escapeHtml(courseCode)}</h3>
        <ul>${comments.map((comment) => `<li>${escapeHtml(comment.textEnglish)}</li>`).join("")}</ul>
      </div>
    `;
  }).filter(Boolean);
  box.innerHTML = blocks.length ? blocks.join("") : '<div class="empty-state">No extra information for the current selected courses.</div>';
}

function renderDayControls() {
  const container = document.getElementById("dayControls");
  if (!container) return;
  const selected = new Set(state.visibleDayIds);
  container.innerHTML = DAYS.map((day) => `
    <label class="day-toggle">
      <input class="day-toggle-input" type="checkbox" value="${day.id}" ${selected.has(day.id) ? "checked" : ""} />
      <span>${escapeHtml(day.name)}</span>
    </label>
  `).join("");

  container.querySelectorAll(".day-toggle-input").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      state.visibleDayIds = [...container.querySelectorAll(".day-toggle-input:checked")]
        .map((input) => Number(input.value))
        .sort((a, b) => a - b);
      saveVisibleDayIds();
      if (state.optimization?.general) state.optimization.general.activeDayIds = [...state.visibleDayIds];
      renderTimetable();
      if (state.optimizer.bestSolutions.length) renderOptimizationResults();
    });
  });
}

function activateMode(mode, options = {}) {
  if (!["fib", "custom"].includes(mode)) return;
  if (mode === "fib") {
    if (!state.baseFibCatalog) {
      state.activeMode = "fib";
      state.catalog = null;
      renderNavigation();
      showCatalogLoadError();
      return;
    }
    state.fibCatalog = cloneCatalog(state.baseFibCatalog);
  }
  if (state.activeMode && state.activeMode !== mode) saveOptimizationPreferences();
  state.activeMode = mode;
  state.catalog = mode === "fib" ? state.fibCatalog : state.customCatalog;
  state.eligibleCourses = getEligibleCourses();
  state.selectedCourseCodes = [];
  state.selectedGroupsByCourse = {};
  state.optimizationSearchText = "";
  state.optimization = loadOptimizationPreferences(mode);
  sanitizeOptimizationPreferences();
  clearOptimizationResults({ silent: true });
  const nextView = mode === "custom" ? "customize" : "manual";
  const nextHash = nextView === "customize" ? "#customize" : "#manual";
  if (window.location.hash !== nextHash) window.location.hash = nextHash;
  state.activeView = nextView;
  if (!options.skipRender) renderAll();
}

function exportActiveCatalog() {
  if (!state.catalog) return;
  const simplified = simplifyCatalog(state.catalog);
  const blob = new Blob([JSON.stringify(simplified, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `subjects-and-classes-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function simplifyCatalog(catalog) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    subjects: [...(catalog.courses || [])]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((course) => ({
        code: course.code,
        name: course.nameEnglish || course.nameOriginal || course.code,
      })),
    classes: [...(catalog.sessions || [])]
      .filter((session) => session.scheduled !== false)
      .map((session) => ({
        subjectCode: session.courseCode,
        group: String(session.group),
        type: session.classTypeCode || "O",
        day: Number(session.dayOfWeek),
        start: normalizeHourText(session.startTime),
        end: normalizeHourText(session.endTime),
      })),
    extraInformation: [...(catalog.courseComments || [])].map((comment) => ({
      subjectCode: comment.courseCode,
      text: comment.textEnglish || comment.textOriginal || "",
    })).filter((item) => item.subjectCode && item.text),
  };
}

async function handleCatalogImport(event, scope) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = parseSimpleCatalog(JSON.parse(await file.text()));
    const mode = getImportMode(scope);
    const targetCatalog = scope === "custom" ? state.customCatalog : state.catalog;
    if (!targetCatalog) return;
    const nextCatalog = mode === "replace" ? imported : combineCatalogs(targetCatalog, imported);
    if (scope === "custom" || state.activeMode === "custom") {
      state.customCatalog = nextCatalog;
      state.catalog = state.customCatalog;
    } else {
      state.fibCatalog = nextCatalog;
      state.catalog = state.fibCatalog;
    }
    state.eligibleCourses = getEligibleCourses();
    sanitizeSelectedCourses();
    sanitizeOptimizationPreferences();
    saveCatalogChanges();
    renderAll();
  } catch (error) {
    console.error(error);
  } finally {
    event.target.value = "";
  }
}

function getImportMode(scope) {
  const name = scope === "custom" ? "customImportMode" : "manualImportMode";
  return document.querySelector(`input[name="${name}"]:checked`)?.value || "combine";
}

function parseSimpleCatalog(data) {
  const catalog = createEmptyCustomCatalog();
  const subjects = Array.isArray(data?.subjects) ? data.subjects : [];
  const classes = Array.isArray(data?.classes) ? data.classes : [];
  const extraInformation = Array.isArray(data?.extraInformation) ? data.extraInformation : [];

  subjects.forEach((subject) => {
    const code = String(subject.code || subject.subjectCode || "").trim().toUpperCase();
    if (!code || catalog.courses.some((course) => course.code === code)) return;
    catalog.courses.push(createCustomCourse(code, String(subject.name || code).trim() || code));
  });

  classes.forEach((item) => {
    const courseCode = String(item.subjectCode || item.courseCode || item.code || "").trim().toUpperCase();
    if (!courseCode) return;
    if (!catalog.courses.some((course) => course.code === courseCode)) catalog.courses.push(createCustomCourse(courseCode, courseCode));
    const startTime = normalizeHourText(item.start || item.startTime || "08:00");
    const endTime = normalizeHourText(item.end || item.endTime || "09:00");
    if (toMinutes(endTime) <= toMinutes(startTime)) return;
    addCustomSession(
      catalog,
      courseCode,
      String(item.group || getNextGroupNumber(catalog, courseCode)),
      String(item.type || item.classTypeCode || "O"),
      clampNumber(item.day || item.dayOfWeek, 1, 7, 1),
      startTime,
      endTime,
    );
  });

  extraInformation.forEach((item) => {
    const courseCode = String(item.subjectCode || item.courseCode || "").trim().toUpperCase();
    const text = String(item.text || item.textEnglish || item.textOriginal || "").trim();
    if (!courseCode || !text) return;
    if (!catalog.courses.some((course) => course.code === courseCode)) catalog.courses.push(createCustomCourse(courseCode, courseCode));
    catalog.courseComments.push({ courseCode, textOriginal: text, textEnglish: text });
  });

  catalog.courses.sort((a, b) => a.code.localeCompare(b.code));
  return catalog;
}

function combineCatalogs(baseCatalog, importedCatalog) {
  const combined = cloneCatalog(baseCatalog);
  importedCatalog.courses.forEach((course) => {
    const existing = combined.courses.find((item) => item.code === course.code);
    if (existing) {
      existing.nameOriginal = course.nameOriginal || existing.nameOriginal;
      existing.nameEnglish = course.nameEnglish || existing.nameEnglish;
    } else {
      combined.courses.push(course);
    }
  });
  importedCatalog.sessions.forEach((session) => {
    if (!combined.sessions.some((item) => isSameSession(item, session))) {
      addCustomSession(combined, session.courseCode, session.group, session.classTypeCode, Number(session.dayOfWeek), session.startTime, session.endTime);
    }
  });
  importedCatalog.courseComments.forEach((comment) => {
    const exists = combined.courseComments.some((item) => item.courseCode === comment.courseCode && (item.textEnglish || item.textOriginal) === (comment.textEnglish || comment.textOriginal));
    if (!exists) combined.courseComments.push(comment);
  });
  combined.courses.sort((a, b) => a.code.localeCompare(b.code));
  return combined;
}

function cloneCatalog(catalog) {
  return JSON.parse(JSON.stringify(catalog));
}

function normalizeHourText(value) {
  const [hourText] = String(value || "00:00").split(":");
  const hour = clampNumber(hourText, 0, 23, 0);
  return `${String(Math.floor(hour)).padStart(2, "0")}:00`;
}
function renderCustomBuilders() {
  ["custom", "manual"].forEach((scope) => {
    renderCustomClassCourseOptions(scope);
    renderCustomClassDayOptions(scope);
    renderExtraInfoCourseOptions(scope);
    renderDeleteCourseOptions(scope);
    renderDeleteClassOptions(scope);
    updateNextGroupValue(scope);
  });
}

function getCustomBuilderConfig(scope) {
  return {
    custom: {
      catalog: state.customCatalog,
      courseCodeInput: "customCourseCode",
      courseNameInput: "customCourseName",
      classCourseSelect: "customClassCourse",
      classGroupInput: "customClassGroup",
      classTypeSelect: "customClassType",
      classDaySelect: "customClassDay",
      classStartInput: "customClassStart",
      classEndInput: "customClassEnd",
      extraInfoCourseSelect: "customExtraInfoCourse",
      extraInfoTextInput: "customExtraInfoText",
      deleteCourseSelect: "customDeleteCourse",
      deleteClassSelect: "customDeleteClass",
    },
    manual: {
      catalog: state.catalog || state.customCatalog,
      courseCodeInput: "manualCustomCourseCode",
      courseNameInput: "manualCustomCourseName",
      classCourseSelect: "manualCustomClassCourse",
      classGroupInput: "manualCustomClassGroup",
      classTypeSelect: "manualCustomClassType",
      classDaySelect: "manualCustomClassDay",
      classStartInput: "manualCustomClassStart",
      classEndInput: "manualCustomClassEnd",
      extraInfoCourseSelect: "manualExtraInfoCourse",
      extraInfoTextInput: "manualExtraInfoText",
      deleteCourseSelect: "manualDeleteCourse",
      deleteClassSelect: "manualDeleteClass",
    },
  }[scope];
}

function renderCustomClassCourseOptions(scope = "custom") {
  const config = getCustomBuilderConfig(scope);
  const select = document.getElementById(config.classCourseSelect);
  if (!select) return;
  const currentValue = select.value;
  const courses = [...(config.catalog?.courses || [])].sort((a, b) => a.code.localeCompare(b.code));
  select.innerHTML = courses.length
    ? courses.map((course) => `<option value="${escapeHtml(course.code)}">${escapeHtml(course.code)} - ${escapeHtml(course.nameEnglish || course.nameOriginal || "")}</option>`).join("")
    : '<option value="">Add a subject first</option>';
  if (currentValue && courses.some((course) => course.code === currentValue)) select.value = currentValue;
  select.disabled = !courses.length;
}

function renderCustomClassDayOptions(scope = "custom") {
  const config = getCustomBuilderConfig(scope);
  const select = document.getElementById(config.classDaySelect);
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = DAYS.map((day) => `<option value="${day.id}">${escapeHtml(day.name)}</option>`).join("");
  if (currentValue) select.value = currentValue;
}

function renderExtraInfoCourseOptions(scope = "custom") {
  const config = getCustomBuilderConfig(scope);
  const select = document.getElementById(config.extraInfoCourseSelect);
  if (!select) return;
  fillCourseSelect(select, config.catalog);
}

function renderDeleteCourseOptions(scope = "custom") {
  const config = getCustomBuilderConfig(scope);
  const select = document.getElementById(config.deleteCourseSelect);
  if (!select) return;
  fillCourseSelect(select, config.catalog);
}

function renderDeleteClassOptions(scope = "custom") {
  const config = getCustomBuilderConfig(scope);
  const select = document.getElementById(config.deleteClassSelect);
  if (!select) return;
  const catalog = config.catalog;
  const currentValue = select.value;
  const sessions = catalog?.sessions || [];
  select.innerHTML = sessions.length
    ? sessions.map((session, index) => `<option value="${index}">${escapeHtml(formatSessionOption(session))}</option>`).join("")
    : '<option value="">No classes available</option>';
  if (currentValue && Number(currentValue) < sessions.length) select.value = currentValue;
  select.disabled = !sessions.length;
}

function fillCourseSelect(select, catalog) {
  const currentValue = select.value;
  const courses = [...(catalog?.courses || [])].sort((a, b) => a.code.localeCompare(b.code));
  select.innerHTML = courses.length
    ? courses.map((course) => `<option value="${escapeHtml(course.code)}">${escapeHtml(course.code)} - ${escapeHtml(course.nameEnglish || course.nameOriginal || "")}</option>`).join("")
    : '<option value="">No subjects available</option>';
  if (currentValue && courses.some((course) => course.code === currentValue)) select.value = currentValue;
  select.disabled = !courses.length;
}

function formatSessionOption(session) {
  return `${session.courseCode} G${session.group} ${session.dayName || ""} ${session.startTime}-${session.endTime} ${session.classTypeCode || ""}`;
}

function updateNextGroupValue(scope = "custom") {
  const config = getCustomBuilderConfig(scope);
  const select = document.getElementById(config.classCourseSelect);
  const groupInput = document.getElementById(config.classGroupInput);
  if (!select || !groupInput || groupInput.matches(":focus")) return;
  groupInput.value = getNextGroupNumber(config.catalog, select.value);
}

function getNextGroupNumber(catalog, courseCode) {
  const groups = (catalog?.courseGroups || [])
    .filter((group) => group.courseCode === courseCode)
    .map((group) => Number(group.group))
    .filter((group) => Number.isFinite(group));
  return String(groups.length ? Math.max(...groups) + 1 : 1);
}

function normalizeHourInput(input) {
  if (!input?.value) return;
  const [hour] = input.value.split(":");
  input.value = `${String(hour).padStart(2, "0")}:00`;
}

function handleCustomCourseSubmit(event, scope = "custom") {
  event.preventDefault();
  const config = getCustomBuilderConfig(scope);
  const catalog = config.catalog;
  const codeInput = document.getElementById(config.courseCodeInput);
  const nameInput = document.getElementById(config.courseNameInput);
  const code = codeInput.value.trim().toUpperCase();
  const name = nameInput.value.trim() || code;
  if (!code || !catalog) return;
  if (!catalog.courses.some((course) => course.code === code)) {
    catalog.courses.push(createCustomCourse(code, name));
  }
  finishCatalogEdit(scope);
  const classSelect = document.getElementById(config.classCourseSelect);
  if (classSelect) {
    classSelect.value = code;
    updateNextGroupValue(scope);
  }
  codeInput.value = "";
  nameInput.value = "";
}

function handleCustomClassSubmit(event, scope = "custom") {
  event.preventDefault();
  const config = getCustomBuilderConfig(scope);
  const catalog = config.catalog;
  const courseCode = document.getElementById(config.classCourseSelect).value;
  const group = document.getElementById(config.classGroupInput).value.trim();
  const typeCode = document.getElementById(config.classTypeSelect).value;
  const dayOfWeek = Number(document.getElementById(config.classDaySelect).value);
  const startInput = document.getElementById(config.classStartInput);
  const endInput = document.getElementById(config.classEndInput);
  normalizeHourInput(startInput);
  normalizeHourInput(endInput);
  const startTime = startInput.value;
  const endTime = endInput.value;
  if (!catalog || !courseCode || !group || !startTime || !endTime || toMinutes(endTime) <= toMinutes(startTime)) return;

  addCustomSession(catalog, courseCode, group, typeCode, dayOfWeek, startTime, endTime);
  finishCatalogEdit(scope);
  document.getElementById(config.classGroupInput).value = getNextGroupNumber(catalog, courseCode);
}

function handleExtraInfoSubmit(event, scope = "custom") {
  event.preventDefault();
  const config = getCustomBuilderConfig(scope);
  const catalog = config.catalog;
  const courseCode = document.getElementById(config.extraInfoCourseSelect).value;
  const textInput = document.getElementById(config.extraInfoTextInput);
  const text = textInput.value.trim();
  if (!catalog || !courseCode || !text) return;
  catalog.courseComments.push({ courseCode, textOriginal: text, textEnglish: text });
  textInput.value = "";
  finishCatalogEdit(scope);
}

function handleDeleteCourseSubmit(event, scope = "custom") {
  event.preventDefault();
  const config = getCustomBuilderConfig(scope);
  const catalog = config.catalog;
  const courseCode = document.getElementById(config.deleteCourseSelect).value;
  if (!catalog || !courseCode) return;
  deleteCourse(catalog, courseCode);
  finishCatalogEdit(scope);
}

function handleDeleteClassSubmit(event, scope = "custom") {
  event.preventDefault();
  const config = getCustomBuilderConfig(scope);
  const catalog = config.catalog;
  const index = Number(document.getElementById(config.deleteClassSelect).value);
  if (!catalog || !Number.isInteger(index) || !catalog.sessions[index]) return;
  deleteSession(catalog, catalog.sessions[index]);
  finishCatalogEdit(scope);
}

function deleteCourse(catalog, courseCode) {
  catalog.courses = catalog.courses.filter((course) => course.code !== courseCode);
  catalog.courseGroups = catalog.courseGroups.filter((group) => group.courseCode !== courseCode);
  catalog.sessions = catalog.sessions.filter((session) => session.courseCode !== courseCode);
  catalog.courseComments = (catalog.courseComments || []).filter((comment) => comment.courseCode !== courseCode);
  catalog.requirements = (catalog.requirements || []).filter((requirement) => requirement.fromCourseCode !== courseCode && requirement.toCourseCode !== courseCode);
  state.selectedCourseCodes = state.selectedCourseCodes.filter((code) => code !== courseCode);
  delete state.selectedGroupsByCourse[courseCode];
  if (state.optimization?.selectedCourseCodes) {
    state.optimization.selectedCourseCodes = state.optimization.selectedCourseCodes.filter((code) => code !== courseCode);
    delete state.optimization.coursePreferences[courseCode];
  }
}

function deleteSession(catalog, targetSession) {
  catalog.sessions = catalog.sessions.filter((session) => session !== targetSession);
  const courseGroup = catalog.courseGroups.find((group) => group.courseCode === targetSession.courseCode && group.group === targetSession.group);
  if (courseGroup) {
    courseGroup.sessions = (courseGroup.sessions || []).filter((session) => !isSameSession(session, targetSession));
    courseGroup.classTypes = [...new Set(courseGroup.sessions.map((session) => session.classTypeCode))].sort();
    courseGroup.scheduledSessionCount = courseGroup.sessions.filter((session) => session.scheduled).length;
    courseGroup.isTheoryGroup = courseGroup.sessions.length ? courseGroup.sessions.every((session) => session.classTypeCode === "T") : courseGroup.isTheoryGroup;
  }
  catalog.courseGroups = catalog.courseGroups.filter((group) => (group.sessions || []).length);
}

function isSameSession(a, b) {
  return a.courseCode === b.courseCode
    && a.group === b.group
    && Number(a.dayOfWeek) === Number(b.dayOfWeek)
    && a.startTime === b.startTime
    && a.endTime === b.endTime
    && a.classTypeCode === b.classTypeCode;
}

function finishCatalogEdit(scope) {
  if (state.activeMode === "custom") state.catalog = state.customCatalog;
  state.eligibleCourses = getEligibleCourses();
  sanitizeSelectedCourses();
  sanitizeOptimizationPreferences();
  saveCatalogChanges();
  renderCustomBuilders();
  renderManualView();
  renderOptimizationView();
}
function createCustomCourse(code, name) {
  return {
    id: code,
    code,
    upcCode: null,
    nameOriginal: name,
    nameEnglish: name,
    credits: null,
    semester: "",
    quarters: [],
    languagesByQuarter: {},
    active: true,
    department: "",
    publicGuideUrl: "",
    externalGuideUrl: "",
    plans: ["CUSTOM"],
    obligations: [],
  };
}

function addCustomSession(catalog, courseCode, group, typeCode, dayOfWeek, startTime, endTime) {
  const classType = { T: "Theory", L: "Lab", P: "Problem", O: "Other" }[typeCode] || "Other";
  const durationHours = (toMinutes(endTime) - toMinutes(startTime)) / 60;
  const session = {
    courseCode,
    group,
    dayOfWeek,
    dayName: DAYS.find((day) => day.id === dayOfWeek)?.name || "Unscheduled",
    startTime,
    durationHours,
    endTime,
    classTypeCode: typeCode,
    classType,
    rooms: [],
    language: "Unknown",
    scheduled: true,
  };
  catalog.sessions.push(session);

  let courseGroup = catalog.courseGroups.find((item) => item.courseCode === courseCode && item.group === group);
  if (!courseGroup) {
    courseGroup = {
      courseCode,
      group,
      languages: ["Unknown"],
      classTypes: [],
      scheduledSessionCount: 0,
      hasUnscheduledParts: false,
      isTheoryGroup: typeCode === "T",
      sessions: [],
    };
    catalog.courseGroups.push(courseGroup);
  }
  courseGroup.sessions.push(session);
  courseGroup.classTypes = [...new Set([...courseGroup.classTypes, typeCode])].sort();
  courseGroup.scheduledSessionCount = courseGroup.sessions.filter((item) => item.scheduled).length;
  courseGroup.isTheoryGroup = courseGroup.sessions.every((item) => item.classTypeCode === "T");
}

function createEmptyCustomCatalog() {
  return {
    meta: { source: "Custom local catalog" },
    requirementTypeLegend: {},
    courses: [],
    courseComments: [],
    requirements: [],
    sessions: [],
    courseGroups: [],
  };
}

function renderOptimizationView() {
  if (!state.catalog) return;
  renderOptimizationAvailableCourses();
  renderOptimizationSelectedCourses();
  renderGlobalOptimizationPreferences();
}

function renderOptimizationAvailableCourses() {
  const container = document.getElementById("optimizationAvailableCourses");
  const selectedCodes = new Set(state.optimization.selectedCourseCodes);
  const courses = state.eligibleCourses
    .filter((course) => !selectedCodes.has(course.code))
    .filter((course) => !state.optimizationSearchText || course.code.toLowerCase().includes(state.optimizationSearchText))
    .sort((a, b) => a.code.localeCompare(b.code));

  container.innerHTML = courses.length ? courses.map((course) => `
    <button type="button" class="optimization-course-option" data-course-code="${escapeHtml(course.code)}">
      <span>${escapeHtml(course.code)}</span>
      <span aria-hidden="true">&rarr;</span>
    </button>
  `).join("") : '<div class="empty-state">No courses match the current filter.</div>';

  container.querySelectorAll(".optimization-course-option").forEach((button) => {
    button.addEventListener("click", () => addOptimizationCourse(button.dataset.courseCode));
  });
}

function renderOptimizationSelectedCourses() {
  const container = document.getElementById("optimizationSelectedCourses");
  if (!state.optimization.selectedCourseCodes.length) {
    container.innerHTML = '<div class="empty-state">Add courses from the list to configure their optimization preferences.</div>';
    return;
  }

  const groupsByCourse = groupBy(state.catalog.courseGroups, (group) => group.courseCode);
  container.innerHTML = state.optimization.selectedCourseCodes.map((courseCode) => {
    const preference = ensureCourseOptimizationPreference(courseCode);
    const groups = [...(groupsByCourse.get(courseCode) || [])].sort(compareGroups);
    return `
      <article class="optimization-course-card" data-course-code="${escapeHtml(courseCode)}">
        <div class="optimization-course-heading">
          <div>
            <h3>${escapeHtml(courseCode)}</h3>
            <p class="hint small">${escapeHtml(getCourse(courseCode).nameEnglish || "")}</p>
          </div>
          <button type="button" class="remove-optimization-course ghost-button" data-course-code="${escapeHtml(courseCode)}">Remove</button>
        </div>

        <div class="course-constraint-grid">
          <label>
            <span>Course importance (0-10)</span>
            <input class="course-importance" data-course-code="${escapeHtml(courseCode)}" type="number" min="0" max="10" step="1" value="${escapeHtml(preference.importance)}" />
          </label>

          <label>
            <span>Classes to attend</span>
            <select class="attendance-mode" data-course-code="${escapeHtml(courseCode)}">
              <option value="both" ${preference.attendanceMode === "both" ? "selected" : ""}>Theory and Lab/Problems</option>
              <option value="theory" ${preference.attendanceMode === "theory" ? "selected" : ""}>Theory only</option>
              <option value="labsProblems" ${preference.attendanceMode === "labsProblems" ? "selected" : ""}>Lab/Problems only</option>
            </select>
          </label>

          <label class="checkbox-field">
            <input class="matching-groups" data-course-code="${escapeHtml(courseCode)}" type="checkbox" ${preference.matchingGroups ? "checked" : ""} />
            <span>Match theory and Lab/Problems group family</span>
          </label>

          <label class="checkbox-field">
            <input class="individual-class-toggle" data-course-code="${escapeHtml(courseCode)}" type="checkbox" ${preference.useIndividualClassImportance ? "checked" : ""} />
            <span>Set importance for each class separately</span>
          </label>
        </div>

        ${preference.useIndividualClassImportance ? `
          <div class="individual-class-grid">
            ${groups.map((group) => `
              <label class="individual-class-field">
                <span>G${escapeHtml(group.group)} ${group.isTheoryGroup ? "(Theory)" : "(Lab/Problem)"}</span>
                <input class="individual-class-importance" data-course-code="${escapeHtml(courseCode)}" data-group="${escapeHtml(group.group)}" type="number" min="0" max="10" step="1" value="${escapeHtml(preference.classImportance[group.group] ?? 10)}" />
              </label>
            `).join("")}
          </div>
        ` : ""}
      </article>
    `;
  }).join("");

  bindOptimizationCourseControls(container);
}

function bindOptimizationCourseControls(container) {
  container.querySelectorAll(".remove-optimization-course").forEach((button) => {
    button.addEventListener("click", () => removeOptimizationCourse(button.dataset.courseCode));
  });
  container.querySelectorAll(".course-importance").forEach((input) => {
    input.addEventListener("change", () => {
      ensureCourseOptimizationPreference(input.dataset.courseCode).importance = clampNumber(input.value, 0, 10, 10);
      saveOptimizationPreferences();
    });
  });
  container.querySelectorAll(".attendance-mode").forEach((select) => {
    select.addEventListener("change", () => {
      ensureCourseOptimizationPreference(select.dataset.courseCode).attendanceMode = select.value;
      saveOptimizationPreferences();
    });
  });
  container.querySelectorAll(".matching-groups").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      ensureCourseOptimizationPreference(checkbox.dataset.courseCode).matchingGroups = checkbox.checked;
      saveOptimizationPreferences();
    });
  });
  container.querySelectorAll(".individual-class-toggle").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const preference = ensureCourseOptimizationPreference(checkbox.dataset.courseCode);
      preference.useIndividualClassImportance = checkbox.checked;
      if (checkbox.checked) initializeClassImportance(checkbox.dataset.courseCode);
      saveOptimizationPreferences();
      renderOptimizationSelectedCourses();
    });
  });
  container.querySelectorAll(".individual-class-importance").forEach((input) => {
    input.addEventListener("change", () => {
      const preference = ensureCourseOptimizationPreference(input.dataset.courseCode);
      preference.classImportance[input.dataset.group] = clampNumber(input.value, 0, 10, 10);
      saveOptimizationPreferences();
      clearOptimizationResults();
    });
  });
}

function renderGlobalOptimizationPreferences() {
  const general = state.optimization.general;
  const maxFreeDays = Math.max(0, state.visibleDayIds.length);
  document.getElementById("desiredCourseCount").value = general.desiredCourseCount;
  document.getElementById("desiredCourseCount").max = Math.max(1, state.eligibleCourses.length);
  document.getElementById("recommendedSolutionCount").max = 10;
  document.getElementById("recommendedSolutionCount").value = general.recommendedSolutionCount;
  document.getElementById("onlyDifferentSubjectsBestOptions").checked = general.onlyDifferentSubjectsBestOptions !== false;
  document.getElementById("gapPreference").value = general.gapPreference;
  document.getElementById("gapImportance").value = general.gapImportance;
  document.getElementById("freeDaysMode").value = general.freeDaysMode;
  document.getElementById("exactFreeDays").max = maxFreeDays;
  document.getElementById("exactFreeDays").value = general.exactFreeDays;
  document.getElementById("timeOfDayPreference").value = general.timeOfDayPreference;
  document.getElementById("timeOfDayImportance").value = general.timeOfDayImportance;
  document.getElementById("optimizationAlgorithm").value = general.optimizationAlgorithm;
  document.getElementById("maxSearchCombinations").value = general.maxSearchCombinations;
  SCORING_WEIGHT_FIELDS.forEach((field) => {
    document.getElementById(field.id).value = general.scoringWeights[field.key];
  });
  document.getElementById("exactFreeDaysField").classList.toggle("disabled-field", general.freeDaysMode !== "exact");
  document.getElementById("exactFreeDays").disabled = general.freeDaysMode !== "exact";
  document.getElementById("gapImportance").disabled = general.gapPreference === "neutral";
  document.getElementById("gapImportance").closest(".field-card").classList.toggle(
    "disabled-field",
    general.gapPreference === "neutral",
  );
  renderHourlyImportanceControls();
}

function renderHourlyImportanceControls() {
  const container = document.getElementById("hourlyImportanceGrid");
  container.innerHTML = HOUR_SLOTS.map((slot) => {
    const slotKey = getHourSlotKey(slot.startMinutes);
    return `
      <label class="hourly-importance-field">
        <span>${escapeHtml(slot.label)}</span>
        <input
          class="hourly-importance-input"
          data-slot-key="${slotKey}"
          type="number"
          min="0"
          max="10"
          step="1"
          value="${escapeHtml(state.optimization.general.hourlyImportance[slotKey])}"
        />
      </label>
    `;
  }).join("");
}

function updateGlobalOptimizationPreferences() {
  const general = state.optimization.general;
  const maxFreeDays = Math.max(0, state.visibleDayIds.length);
  general.desiredCourseCount = clampNumber(
    document.getElementById("desiredCourseCount").value,
    1,
    state.eligibleCourses.length,
    5,
  );
  general.recommendedSolutionCount = clampNumber(
    document.getElementById("recommendedSolutionCount").value,
    1,
    10,
    1,
  );
  general.onlyDifferentSubjectsBestOptions = document.getElementById("onlyDifferentSubjectsBestOptions").checked;
  general.gapPreference = document.getElementById("gapPreference").value;
  general.gapImportance = clampNumber(document.getElementById("gapImportance").value, 0, 10, 5);
  general.freeDaysMode = document.getElementById("freeDaysMode").value;
  general.exactFreeDays = clampNumber(document.getElementById("exactFreeDays").value, 0, maxFreeDays, 0);
  general.timeOfDayPreference = document.getElementById("timeOfDayPreference").value;
  general.timeOfDayImportance = clampNumber(document.getElementById("timeOfDayImportance").value, 0, 10, 10);
  general.optimizationAlgorithm = document.getElementById("optimizationAlgorithm").value;
  general.maxSearchCombinations = clampNumber(
    document.getElementById("maxSearchCombinations").value,
    1,
    Number.MAX_SAFE_INTEGER,
    16000,
  );
  SCORING_WEIGHT_FIELDS.forEach((field) => {
    general.scoringWeights[field.key] = clampNumber(
      document.getElementById(field.id).value,
      0,
      field.maxValue || 10,
      field.defaultValue,
    );
  });
  general.activeDayIds = [...state.visibleDayIds];
  saveOptimizationPreferences();
  renderGlobalOptimizationPreferences();
  clearOptimizationResults();
}

function addOptimizationCourse(courseCode) {
  if (state.optimization.selectedCourseCodes.includes(courseCode)) return;
  state.optimization.selectedCourseCodes.push(courseCode);
  ensureCourseOptimizationPreference(courseCode);
  saveOptimizationPreferences();
  renderOptimizationView();
  clearOptimizationResults();
}

function removeOptimizationCourse(courseCode) {
  state.optimization.selectedCourseCodes = state.optimization.selectedCourseCodes.filter((code) => code !== courseCode);
  delete state.optimization.coursePreferences[courseCode];
  saveOptimizationPreferences();
  renderOptimizationView();
  clearOptimizationResults();
}

function startOptimizationSearch() {
  updateGlobalOptimizationPreferences();
  const container = document.getElementById("optimizationResults");
  if (!state.optimization.selectedCourseCodes.length) {
    container.innerHTML = '<section class="panel"><div class="empty-state">Select at least one course before generating proposals.</div></section>';
    return;
  }
  const validSelectedCourseCount = state.optimization.selectedCourseCodes.filter((courseCode) => {
    return state.eligibleCourses.some((course) => course.code === courseCode);
  }).length;
  if (validSelectedCourseCount < state.optimization.general.desiredCourseCount) {
    container.innerHTML = `<section class="panel"><div class="empty-state">The optimizer needs exactly ${escapeHtml(state.optimization.general.desiredCourseCount)} valid courses, but only ${escapeHtml(validSelectedCourseCount)} selected courses have fixed scheduled classes.</div></section>`;
    return;
  }

  const runId = state.optimizer.runId + 1;
  const activeRun = createOptimizationRun({
    catalog: state.catalog,
    preferences: {
      ...state.optimization,
      general: { ...state.optimization.general, activeDayIds: [...state.visibleDayIds] },
    },
    hourSlots: HOUR_SLOTS,
    algorithmKey: state.optimization.general.optimizationAlgorithm,
    requestedSolutions: state.optimization.general.recommendedSolutionCount,
    onlyDifferentSubjectsBestOptions: state.optimization.general.onlyDifferentSubjectsBestOptions !== false,
    maxEvaluations: state.optimization.general.maxSearchCombinations,
  });
  const initialSnapshot = activeRun.snapshot();
  state.optimizer = {
    runId,
    running: true,
    completed: false,
    bestSolutions: [],
    evaluated: 0,
    targetEvaluations: state.optimization.general.maxSearchCombinations,
    requestedSolutions: state.optimization.general.recommendedSolutionCount,
    onlyDifferentSubjectsBestOptions: state.optimization.general.onlyDifferentSubjectsBestOptions !== false,
    algorithmKey: initialSnapshot.algorithmKey,
    algorithmLabel: initialSnapshot.algorithmLabel,
    provenOptimal: false,
    infeasible: false,
    stoppedByLimit: false,
    searchSpaceSize: initialSnapshot.searchSpaceSize,
    activeRun,
  };
  document.getElementById("optimizeTimetableBtn").disabled = true;
  renderOptimizationResults();

  const searchChunk = () => {
    if (state.optimizer.runId !== runId) return;
    const snapshot = activeRun.step(90);
    state.optimizer.evaluated = snapshot.evaluated;
    state.optimizer.bestSolutions = snapshot.bestSolutions;
    state.optimizer.completed = snapshot.completed;
    state.optimizer.provenOptimal = snapshot.provenOptimal;
    state.optimizer.infeasible = snapshot.infeasible;
    state.optimizer.stoppedByLimit = snapshot.stoppedByLimit;
    renderOptimizationResults();
    if (!snapshot.completed) {
      window.setTimeout(searchChunk, 0);
      return;
    }

    state.optimizer.running = false;
    document.getElementById("optimizeTimetableBtn").disabled = false;
    renderOptimizationResults();
  };

  window.setTimeout(searchChunk, 0);
}

function renderOptimizationResults() {
  const container = document.getElementById("optimizationResults");
  const status = document.getElementById("optimizationRunStatus");
  const optimizer = state.optimizer;

  if (!optimizer.running && !optimizer.completed && !optimizer.bestSolutions.length) {
    status.textContent = "Ready to search for the best timetable solutions.";
    return;
  }

  const progress = optimizer.targetEvaluations
    ? Math.round((optimizer.evaluated / optimizer.targetEvaluations) * 100)
    : 0;
  const evaluatedLabel = `${optimizer.evaluated.toLocaleString()} combination${optimizer.evaluated === 1 ? "" : "s"}`;
  status.textContent = optimizer.running
    ? `${optimizer.algorithmLabel}: searching... ${evaluatedLabel} evaluated (${progress}%). Results are temporary.`
    : optimizer.infeasible
      ? `${optimizer.algorithmLabel}: the complete search proved that no solution satisfies all hard constraints.`
      : optimizer.provenOptimal
      ? `${optimizer.algorithmLabel}: search completed after ${evaluatedLabel}. The optimum is proven for this search space.`
      : optimizer.stoppedByLimit
        ? `${optimizer.algorithmLabel}: stopped at the configured limit after ${evaluatedLabel}. These are the best solutions found, without an optimality guarantee.`
        : `${optimizer.algorithmLabel}: search completed after ${evaluatedLabel}. These are the best solutions found.`;

  if (!optimizer.bestSolutions.length) {
    container.innerHTML = optimizer.completed
      ? '<section class="panel"><div class="empty-state">No timetable satisfies all active hard constraints. Relax one or more restrictions and try again.</div></section>'
      : '<section class="panel"><div class="empty-state">Searching for the first valid timetable combinations...</div></section>';
    return;
  }

  container.innerHTML = optimizer.bestSolutions.map((solution, index) => `
    <article class="panel optimization-result-card">
      <div class="result-heading">
        <div>
          <span class="result-rank">Option ${index + 1}</span>
          <h2>${optimizer.provenOptimal ? "Proven optimal solution" : optimizer.completed ? "Best solution found" : "Temporary best solution"}</h2>
        </div>
        <span class="solution-status-badge ${optimizer.completed ? "definitive" : "temporary"}">
          ${optimizer.provenOptimal ? "Optimum proven" : optimizer.completed ? "Search completed" : "Search in progress"}
        </span>
      </div>
      <div class="solution-layout">
        <aside class="solution-summary">
          <div class="solution-score">
            <strong>${formatScore(solution.score)}</strong>
            <span>/ 100</span>
          </div>
          <h3>Selected classes</h3>
          ${renderSolutionClassSelection(solution)}
          <h3>Unmet restrictions</h3>
          ${solution.violations.length
            ? `<ul class="violation-list">${solution.violations.map((violation) => `<li>${escapeHtml(violation)}</li>`).join("")}</ul>`
            : '<div class="all-restrictions-met">All configured restrictions are satisfied.</div>'}
        </aside>
        <div class="result-timetable-wrapper">
          ${buildCompactTimetableHtml(solution.selectedGroupsByCourse)}
        </div>
      </div>
    </article>
  `).join("");
}

function renderSolutionClassSelection(solution) {
  return `
    <div class="solution-course-list">
      ${solution.chosenCodes.map((courseCode) => `
        <div class="solution-course-row">
          <strong>${escapeHtml(courseCode)}</strong>
          <span>${(solution.selectedGroupsByCourse[courseCode] || []).map((group) => `G${escapeHtml(group)}`).join(", ") || "No class"}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function addCourse(courseCode) {
  if (state.selectedCourseCodes.includes(courseCode)) return;
  state.selectedCourseCodes.push(courseCode);
  state.selectedGroupsByCourse[courseCode] = [];
  renderManualView();
}

function removeCourse(courseCode) {
  state.selectedCourseCodes = state.selectedCourseCodes.filter((code) => code !== courseCode);
  delete state.selectedGroupsByCourse[courseCode];
  renderManualView();
}

function moveCourse(courseCode, direction) {
  const currentIndex = state.selectedCourseCodes.indexOf(courseCode);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= state.selectedCourseCodes.length) return;
  const reordered = [...state.selectedCourseCodes];
  const [item] = reordered.splice(currentIndex, 1);
  reordered.splice(nextIndex, 0, item);
  state.selectedCourseCodes = reordered;
  renderManualView();
}

function toggleGroup(courseCode, group, isChecked) {
  const current = new Set(state.selectedGroupsByCourse[courseCode] || []);
  if (isChecked) current.add(group);
  else current.delete(group);
  state.selectedGroupsByCourse[courseCode] = [...current].sort(compareGroupValues);
  renderTimetable();
}

function toggleGroupCollection(courseCode, sectionKind, action) {
  const targetGroups = state.catalog.courseGroups
    .filter((group) => group.courseCode === courseCode)
    .filter((group) => sectionKind === "theory" ? group.isTheoryGroup : !group.isTheoryGroup)
    .map((group) => group.group);
  const current = new Set(state.selectedGroupsByCourse[courseCode] || []);
  targetGroups.forEach((group) => action === "select" ? current.add(group) : current.delete(group));
  state.selectedGroupsByCourse[courseCode] = [...current].sort(compareGroupValues);
  renderSelectedCourses();
  renderTimetable();
}

function buildEventsByHourCell(selectedGroupsByCourse, hourSlots = HOUR_SLOTS) {
  const map = new Map();
  const visibleDays = new Set(state.visibleDayIds);
  for (const session of state.catalog.sessions) {
    if (!session.scheduled || !visibleDays.has(Number(session.dayOfWeek))) continue;
    if (!(selectedGroupsByCourse[session.courseCode] || []).includes(session.group)) continue;
    const start = toMinutes(session.startTime);
    const end = toMinutes(session.endTime);

    for (const hourSlot of hourSlots) {
      if (!(hourSlot.startMinutes < end && hourSlot.endMinutes > start)) continue;
      const key = `${session.dayOfWeek}-${hourSlot.startMinutes}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(session);
    }
  }

  for (const [key, events] of map.entries()) {
    const seen = new Set();
    const deduped = events.filter((event) => {
      const eventKey = `${event.courseCode}-${event.group}-${event.classTypeCode}-${event.startTime}-${event.endTime}`;
      if (seen.has(eventKey)) return false;
      seen.add(eventKey);
      return true;
    });
    deduped.sort((a, b) => a.courseCode.localeCompare(b.courseCode) || compareGroupValues(a.group, b.group));
    map.set(key, deduped);
  }
  return map;
}

function getEligibleCourses() {
  if (!state.catalog) return [];
  const fixedScheduleCodes = new Set(
    state.catalog.courseGroups
      .filter((group) => groupHasScheduledSessions(group))
      .map((group) => group.courseCode),
  );
  return state.catalog.courses.filter((course) => fixedScheduleCodes.has(course.code) && !courseHasNoFixedScheduleComment(course.code));
}

function groupHasScheduledSessions(group) {
  return (group.sessions || []).some((session) => session.scheduled && session.startTime && session.endTime);
}

function courseHasNoFixedScheduleComment(courseCode) {
  return (state.catalog.courseComments || []).some((comment) => {
    if (comment.courseCode !== courseCode) return false;
    const text = `${comment.textOriginal || ""} ${comment.textEnglish || ""}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return text.includes("no te un horari fixat") || text.includes("no te horari fixat") || text.includes("no fixed schedule");
  });
}

function sanitizeSelectedCourses() {
  const eligibleCodes = new Set(state.eligibleCourses.map((course) => course.code));
  state.selectedCourseCodes = state.selectedCourseCodes.filter((code) => eligibleCodes.has(code));
  Object.keys(state.selectedGroupsByCourse).forEach((code) => {
    if (!eligibleCodes.has(code)) delete state.selectedGroupsByCourse[code];
  });
}

function ensureCourseOptimizationPreference(courseCode) {
  if (!state.optimization.coursePreferences[courseCode]) {
    state.optimization.coursePreferences[courseCode] = {
      importance: 10,
      attendanceMode: "both",
      matchingGroups: false,
      useIndividualClassImportance: false,
      classImportance: {},
    };
  }
  return state.optimization.coursePreferences[courseCode];
}

function initializeClassImportance(courseCode) {
  const preference = ensureCourseOptimizationPreference(courseCode);
  state.catalog.courseGroups
    .filter((group) => group.courseCode === courseCode)
    .forEach((group) => {
      if (preference.classImportance[group.group] === undefined) {
        preference.classImportance[group.group] = 10;
      }
    });
}

function sanitizeOptimizationPreferences() {
  if (!state.catalog) return;
  const eligibleCodes = new Set(state.eligibleCourses.map((course) => course.code));
  state.optimization.selectedCourseCodes = state.optimization.selectedCourseCodes.filter((code) => eligibleCodes.has(code));
  Object.keys(state.optimization.coursePreferences).forEach((code) => {
    if (!eligibleCodes.has(code)) delete state.optimization.coursePreferences[code];
  });
  state.optimization.selectedCourseCodes.forEach((courseCode) => {
    const preference = ensureCourseOptimizationPreference(courseCode);
    if (preference.useIndividualClassImportance) initializeClassImportance(courseCode);
  });
  state.optimization.general.desiredCourseCount = clampNumber(
    state.optimization.general.desiredCourseCount,
    1,
    Math.max(1, state.eligibleCourses.length),
    Math.min(5, Math.max(1, state.eligibleCourses.length)),
  );
  state.optimization.general.recommendedSolutionCount = clampNumber(
    state.optimization.general.recommendedSolutionCount,
    1,
    10,
    1,
  );
  state.optimization.general.gapImportance = clampNumber(
    state.optimization.general.gapImportance,
    0,
    10,
    5,
  );
  state.optimization.general.timeOfDayImportance = clampNumber(
    state.optimization.general.timeOfDayImportance,
    0,
    10,
    10,
  );
  state.optimization.general.hourlyImportance = {
    ...createDefaultHourlyImportance(),
    ...(state.optimization.general.hourlyImportance || {}),
  };
  Object.keys(state.optimization.general.hourlyImportance).forEach((slotKey) => {
    state.optimization.general.hourlyImportance[slotKey] = clampNumber(
      state.optimization.general.hourlyImportance[slotKey],
      0,
      10,
      10,
    );
  });
  state.optimization.general.maxSearchCombinations = Math.floor(clampNumber(
    state.optimization.general.maxSearchCombinations,
    1,
    Number.MAX_SAFE_INTEGER,
    16000,
  ));
  if (!ALGORITHM_LABELS[state.optimization.general.optimizationAlgorithm]) {
    state.optimization.general.optimizationAlgorithm = "random";
  }
  state.optimization.general.scoringWeights = {
    ...createDefaultScoringWeights(),
    ...(state.optimization.general.scoringWeights || {}),
  };
  SCORING_WEIGHT_FIELDS.forEach((field) => {
    state.optimization.general.scoringWeights[field.key] = clampNumber(
      state.optimization.general.scoringWeights[field.key],
      0,
      field.maxValue || 10,
      field.defaultValue,
    );
  });
  state.optimization.general.activeDayIds = [...state.visibleDayIds];
  saveOptimizationPreferences();
}

function loadOptimizationPreferences(mode = "fib") {
  const defaults = {
    schemaVersion: 6,
    selectedCourseCodes: [],
    coursePreferences: {},
    general: {
      desiredCourseCount: 5,
      recommendedSolutionCount: 1,
      onlyDifferentSubjectsBestOptions: true,
      gapPreference: "avoid",
      gapImportance: 5,
      freeDaysMode: "exact",
      exactFreeDays: 0,
      timeOfDayPreference: "neutral",
      timeOfDayImportance: 10,
      hourlyImportance: createDefaultHourlyImportance(),
      optimizationAlgorithm: "random",
      maxSearchCombinations: 16000,
      activeDayIds: [...DEFAULT_VISIBLE_DAY_IDS],
      scoringWeights: createDefaultScoringWeights(),
    },
  };
  try {
    const parsed = JSON.parse(localStorage.getItem(getOptimizationStorageKey(mode)));
    const useNewScoringDefaults = parsed?.schemaVersion !== defaults.schemaVersion;
    return {
      ...defaults,
      ...parsed,
      schemaVersion: defaults.schemaVersion,
      selectedCourseCodes: Array.isArray(parsed?.selectedCourseCodes) ? parsed.selectedCourseCodes : [],
      coursePreferences: parsed?.coursePreferences || {},
      general: {
        ...defaults.general,
        ...(parsed?.general || {}),
        hourlyImportance: useNewScoringDefaults
          ? defaults.general.hourlyImportance
          : {
            ...defaults.general.hourlyImportance,
            ...(parsed?.general?.hourlyImportance || {}),
          },
        gapImportance: useNewScoringDefaults
          ? defaults.general.gapImportance
          : (parsed?.general?.gapImportance ?? defaults.general.gapImportance),
        timeOfDayImportance: useNewScoringDefaults
          ? defaults.general.timeOfDayImportance
          : (parsed?.general?.timeOfDayImportance ?? defaults.general.timeOfDayImportance),
        scoringWeights: useNewScoringDefaults
          ? defaults.general.scoringWeights
          : {
            ...defaults.general.scoringWeights,
            ...(parsed?.general?.scoringWeights || {}),
          },
        activeDayIds: Array.isArray(parsed?.general?.activeDayIds)
          ? parsed.general.activeDayIds
          : defaults.general.activeDayIds,
      },
    };
  } catch {
    return defaults;
  }
}

function getOptimizationStorageKey(mode) {
  return mode === "fib" ? OPTIMIZATION_STORAGE_KEY : `${OPTIMIZATION_STORAGE_KEY}-${mode}`;
}

function loadVisibleDayIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VISIBLE_DAYS_STORAGE_KEY));
    const validIds = new Set(DAYS.map((day) => day.id));
    const values = Array.isArray(parsed)
      ? parsed.map(Number).filter((id) => validIds.has(id))
      : [];
    return values.length ? [...new Set(values)].sort((a, b) => a - b) : [...DEFAULT_VISIBLE_DAY_IDS];
  } catch {
    return [...DEFAULT_VISIBLE_DAY_IDS];
  }
}

function saveVisibleDayIds() {
  localStorage.setItem(VISIBLE_DAYS_STORAGE_KEY, JSON.stringify(state.visibleDayIds));
}

async function loadSavedCatalogs() {
  try {
    const response = await fetch("/user-catalog.json", { cache: "no-store" });
    if (response.ok) return response.json();
  } catch {
    // Static-file usage falls back to localStorage.
  }
  try {
    return JSON.parse(localStorage.getItem(USER_CATALOG_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveCatalogChanges() {
  const payload = {
    workingFibCatalog: state.fibCatalog,
    customCatalog: state.customCatalog,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(USER_CATALOG_STORAGE_KEY, JSON.stringify(payload));
  saveCustomCatalog();
  fetch("/user-catalog.json", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
function loadCustomCatalog() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_CATALOG_STORAGE_KEY));
    return {
      ...createEmptyCustomCatalog(),
      ...parsed,
      courses: Array.isArray(parsed?.courses) ? parsed.courses : [],
      courseComments: Array.isArray(parsed?.courseComments) ? parsed.courseComments : [],
      requirements: Array.isArray(parsed?.requirements) ? parsed.requirements : [],
      sessions: Array.isArray(parsed?.sessions) ? parsed.sessions : [],
      courseGroups: Array.isArray(parsed?.courseGroups) ? parsed.courseGroups : [],
    };
  } catch {
    return createEmptyCustomCatalog();
  }
}

function saveCustomCatalog() {
  localStorage.setItem(CUSTOM_CATALOG_STORAGE_KEY, JSON.stringify(state.customCatalog));
}

function saveOptimizationPreferences(showConfirmation = false) {
  localStorage.setItem(getOptimizationStorageKey(state.activeMode || "fib"), JSON.stringify(state.optimization));
  const status = document.getElementById("optimizationSaveStatus");
  if (!status) return;
  status.textContent = showConfirmation ? "Preferences saved." : "All changes saved automatically.";
  if (showConfirmation) {
    window.setTimeout(() => {
      status.textContent = "Preferences are saved automatically.";
    }, 1800);
  }
}

function clearOptimizationResults(options = {}) {
  state.optimizer.runId += 1;
  state.optimizer.running = false;
  state.optimizer.completed = false;
  state.optimizer.bestSolutions = [];
  state.optimizer.evaluated = 0;
  state.optimizer.targetEvaluations = 0;
  state.optimizer.provenOptimal = false;
  state.optimizer.infeasible = false;
  state.optimizer.stoppedByLimit = false;
  state.optimizer.activeRun = null;
  if (options.silent) return;
  document.getElementById("optimizationResults").innerHTML = "";
  document.getElementById("optimizeTimetableBtn").disabled = false;
  document.getElementById("optimizationRunStatus").textContent = "Ready to search for the best timetable solutions.";
}

function buildHourSlots(startTime, endTime) {
  const slots = [];
  let current = toMinutes(startTime);
  const end = toMinutes(endTime);
  while (current < end) {
    const next = current + 60;
    slots.push({ startMinutes: current, endMinutes: next, label: `${formatMinutes(current)}-${formatMinutes(next)}` });
    current = next;
  }
  return slots;
}

function createDefaultHourlyImportance() {
  return Object.fromEntries(HOUR_SLOTS.map((slot) => [getHourSlotKey(slot.startMinutes), 10]));
}

function createDefaultScoringWeights() {
  return Object.fromEntries(SCORING_WEIGHT_FIELDS.map((field) => [field.key, field.defaultValue]));
}

function getHourSlotKey(startMinutes) {
  return formatMinutes(startMinutes);
}

function getCourse(courseCode) {
  return state.catalog.courses.find((course) => course.code === courseCode) || { code: courseCode };
}

function compareGroups(a, b) {
  return compareGroupValues(a.group, b.group);
}

function compareGroupValues(a, b) {
  const aNum = Number(a);
  const bNum = Number(b);
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum;
  return String(a).localeCompare(String(b));
}

function toMinutes(timeText) {
  const [hours, minutes] = String(timeText).split(":").map(Number);
  return hours * 60 + minutes;
}

function formatScore(value) {
  return Number(value).toFixed(2);
}
function formatMinutes(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getSessionVariantClass(typeCode) {
  if (typeCode === "T") return "theory";
  if (typeCode === "P") return "problem";
  if (typeCode === "L") return "lab";
  return "other";
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function average(values, fallback = 1) {
  if (!values.length) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function loadColorSettings() {
  const defaults = Object.fromEntries(COLOR_CATEGORIES.map((category) => [category.key, category.defaultColor]));
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(COLOR_STORAGE_KEY)) };
  } catch {
    return defaults;
  }
}

function saveColorSettings() {
  localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(state.colorSettings));
}

function applyColorSettings() {
  COLOR_CATEGORIES.forEach((category) => {
    document.documentElement.style.setProperty(category.cssVar, state.colorSettings[category.key]);
  });
}

function getColorName(value) {
  const match = Object.values(COLOR_PRESETS).find((preset) => preset.value.toLowerCase() === String(value).toLowerCase());
  return match ? match.label : value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function getVisibleDays() {
  return DAYS.filter((day) => state.visibleDayIds.includes(day.id));
}

init().catch((error) => {
  console.error(error);
  showCatalogLoadError();
});








