const DEFAULT_ACTIVE_DAY_IDS = [1, 2, 3, 4, 5];

export function createOptimizationProblem(catalog, preferences, hourSlots) {
  const selectedCodes = [...preferences.selectedCourseCodes];
  const general = preferences.general;
  const targetCourseCount = general.desiredCourseCount;
  const groupsByCourse = groupBy(catalog.courseGroups, (group) => group.courseCode);
  const optionsByCourse = new Map();

  selectedCodes.forEach((courseCode) => {
    optionsByCourse.set(
      courseCode,
      buildCourseOptions(
        courseCode,
        [...(groupsByCourse.get(courseCode) || [])].sort(compareGroups),
        preferences.coursePreferences[courseCode],
        general,
        hourSlots,
      ),
    );
  });

  const selectableCodes = selectedCodes
    .filter((code) => (optionsByCourse.get(code) || []).length)
    .sort((a, b) => getCourseImportance(preferences, b) - getCourseImportance(preferences, a) || a.localeCompare(b));
  const chosenCourseCount = targetCourseCount;
  const evaluationContext = {
    selectedCodes,
    targetCourseCount,
    chosenCourseCount,
    preferences,
    hourSlots,
    optionsByCourse,
    activeDayIds: getActiveDayIds(general),
  };
  const hardConstraints = createHardConstraints(general, hourSlots, targetCourseCount);
  const makeRandomCandidate = () => randomCandidate(selectableCodes, chosenCourseCount, optionsByCourse, preferences);

  return {
    selectedCodes,
    selectableCodes,
    targetCourseCount,
    chosenCourseCount,
    optionsByCourse,
    preferences,
    hourSlots,
    randomCandidate: () => findHardValidCandidate(makeRandomCandidate, hardConstraints, 80),
    deterministicCandidate: () => findHardValidCandidate(
      () => deterministicCandidate(selectableCodes, chosenCourseCount, optionsByCourse, preferences),
      hardConstraints,
      1,
    ),
    mutateCandidate: (candidate, intensity = 1) => findHardValidCandidate(
      () => mutateCandidate(
        candidate,
        selectableCodes,
        chosenCourseCount,
        optionsByCourse,
        intensity,
      ),
      hardConstraints,
      50,
    ),
    crossoverCandidates: (first, second) => findHardValidCandidate(
      () => crossoverCandidates(first, second, selectableCodes, chosenCourseCount, optionsByCourse),
      hardConstraints,
      40,
    ),
    evaluate: (candidate) => evaluateCandidate(candidate, evaluationContext),
    isCandidateHardValid: (candidate) => completeCandidateSatisfies(candidate, hardConstraints),
    exhaustiveCandidates: (options = {}) => exhaustiveCandidates(
      selectableCodes,
      chosenCourseCount,
      optionsByCourse,
      evaluationContext,
      options,
    ),
    searchSpaceSize: estimateSearchSpace(selectableCodes, chosenCourseCount, optionsByCourse),
    maximumScoreWithOverlap: calculateMaximumScoreWithOverlap(general),
    hardConstraints,
  };
}

function buildCourseOptions(courseCode, groups, preference, general, hourSlots) {
  const normalizedPreference = preference || {
    attendanceMode: "both",
    matchingGroups: false,
    useIndividualClassImportance: false,
    classImportance: {},
  };
  const enforceMatchingGroups = normalizedPreference.matchingGroups
    || Number(general.scoringWeights?.matchingGroups ?? 0) >= 10;
  const allowedGroups = groups.filter((group) => {
    if (!normalizedPreference.useIndividualClassImportance) return true;
    return Number(normalizedPreference.classImportance[group.group] ?? 10) > 0;
  });
  const theoryGroups = allowedGroups.filter((group) => group.isTheoryGroup);
  const practicalGroups = allowedGroups.filter((group) => !group.isTheoryGroup);
  let combinations = [];

  if (normalizedPreference.attendanceMode === "theory") {
    combinations = theoryGroups.map((group) => [group]);
  } else if (normalizedPreference.attendanceMode === "labsProblems") {
    combinations = practicalGroups.map((group) => [group]);
  } else if (theoryGroups.length && practicalGroups.length) {
    combinations = theoryGroups.flatMap((theory) => practicalGroups.map((practical) => [theory, practical]));
  } else {
    combinations = allowedGroups.map((group) => [group]);
  }

  if (enforceMatchingGroups) {
    combinations = combinations.filter(groupsHaveMatchingFamily);
  }

  return combinations.map((combination) => {
    const selectedGroups = combination.map((group) => group.group);
    const activeDayIds = Array.isArray(general.activeDayIds) && general.activeDayIds.length ? general.activeDayIds.map(Number) : null;
    const sessions = combination
      .flatMap((group) => group.sessions || [])
      .filter((session) => session.scheduled)
      .filter((session) => !activeDayIds || activeDayIds.includes(Number(session.dayOfWeek)));
    const individualSatisfaction = getIndividualClassSatisfaction(
      selectedGroups,
      groups,
      normalizedPreference,
    );
    return {
      courseCode,
      groups: selectedGroups,
      sessions,
      groupsMatch: groupsHaveMatchingFamily(combination),
      individualSatisfaction,
      localPreference: calculateOptionPreference(
        sessions,
        individualSatisfaction,
        general,
        hourSlots,
      ),
    };
  })
    .filter((option) => option.sessions.length)
    .filter((option) => !optionUsesForbiddenHourlySlot(option, general, hourSlots))
    .filter((option) => optionSatisfiesStrictTimeOfDay(option, general))
    .sort((first, second) => second.localPreference - first.localPreference);
}

function groupsHaveMatchingFamily(combination) {
  const theory = combination.find((group) => group.isTheoryGroup);
  const practical = combination.find((group) => !group.isTheoryGroup);
  return !theory || !practical || getGroupFamily(theory.group) === getGroupFamily(practical.group);
}

function optionUsesForbiddenHourlySlot(option, general, hourSlots) {
  return option.sessions.some((session) => sessionOverlapsHourlyImportance(session, general.hourlyImportance, hourSlots, 0));
}

function sessionOverlapsHourlyImportance(session, hourlyImportance, hourSlots, forbiddenValue) {
  const start = toMinutes(session.startTime);
  const end = toMinutes(session.endTime);
  return hourSlots.some((slot) => {
    if (slot.startMinutes >= end || slot.endMinutes <= start) return false;
    return Number(hourlyImportance[formatMinutes(slot.startMinutes)] ?? 10) === forbiddenValue;
  });
}

function optionSatisfiesStrictTimeOfDay(option, general) {
  if (general.timeOfDayPreference === "neutral" || general.timeOfDayImportance < 10) return true;
  return option.sessions.every((session) => {
    const start = toMinutes(session.startTime);
    const end = toMinutes(session.endTime);
    if (general.timeOfDayPreference === "morning") return end <= 14 * 60;
    if (general.timeOfDayPreference === "afternoon") return start >= 14 * 60;
    return true;
  });
}

function calculateMatchingGroupSatisfaction(candidate) {
  const values = candidate.chosenCodes.map((code) => candidate.courseOptions[code]?.groupsMatch ?? 1);
  return average(values.map((value) => value ? 1 : 0), 1);
}
function getIndividualClassSatisfaction(selectedGroups, allGroups, preference) {
  if (!preference.useIndividualClassImportance) return 1;
  const allowedValues = allGroups
    .map((group) => Number(preference.classImportance[group.group] ?? 10))
    .filter((value) => value > 0);
  const maximum = Math.max(0, ...allowedValues);
  if (!maximum) return 0;
  return average(selectedGroups.map((group) => Number(preference.classImportance[group] ?? 10) / maximum), 0);
}

function findHardValidCandidate(factory, hardConstraints, attempts) {
  let fallback = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = factory();
    if (!fallback) fallback = candidate;
    if (!hardConstraints || completeCandidateSatisfies(candidate, hardConstraints)) return candidate;
  }
  return fallback || factory();
}
function deterministicCandidate(codes, count, optionsByCourse, preferences) {
  const chosenCodes = [...codes]
    .sort((a, b) => getCourseImportance(preferences, b) - getCourseImportance(preferences, a) || a.localeCompare(b))
    .slice(0, count);
  return buildCandidate(chosenCodes, Object.fromEntries(chosenCodes.map((code) => [code, 0])), optionsByCourse);
}

function randomCandidate(codes, count, optionsByCourse, preferences) {
  const chosenCodes = weightedCourseSample(codes, count, preferences);
  const optionIndexes = {};
  chosenCodes.forEach((code) => {
    optionIndexes[code] = randomIndex((optionsByCourse.get(code) || []).length);
  });
  return buildCandidate(chosenCodes, optionIndexes, optionsByCourse);
}

function mutateCandidate(candidate, codes, count, optionsByCourse, intensity) {
  const chosenCodes = [...candidate.chosenCodes];
  const optionIndexes = { ...candidate.optionIndexes };
  const mutationCount = Math.max(1, Math.min(4, Math.floor(intensity)));
  for (let mutation = 0; mutation < mutationCount; mutation += 1) {
    if (Math.random() < 0.35 && codes.length > count) {
      const replaceIndex = randomIndex(chosenCodes.length);
      const available = codes.filter((code) => !chosenCodes.includes(code));
      const replacement = available[randomIndex(available.length)];
      delete optionIndexes[chosenCodes[replaceIndex]];
      chosenCodes[replaceIndex] = replacement;
      optionIndexes[replacement] = randomIndex((optionsByCourse.get(replacement) || []).length);
    } else {
      const courseCode = chosenCodes[randomIndex(chosenCodes.length)];
      const optionCount = (optionsByCourse.get(courseCode) || []).length;
      if (optionCount > 1) {
        let nextIndex = randomIndex(optionCount);
        if (nextIndex === optionIndexes[courseCode]) nextIndex = (nextIndex + 1) % optionCount;
        optionIndexes[courseCode] = nextIndex;
      }
    }
  }
  return buildCandidate(chosenCodes, optionIndexes, optionsByCourse);
}

function crossoverCandidates(first, second, codes, count, optionsByCourse) {
  const combined = [...new Set([...first.chosenCodes, ...second.chosenCodes])];
  shuffle(combined);
  const chosenCodes = combined.slice(0, count);
  for (const code of codes) {
    if (chosenCodes.length >= count) break;
    if (!chosenCodes.includes(code)) chosenCodes.push(code);
  }
  const optionIndexes = {};
  chosenCodes.forEach((code) => {
    const inherited = Math.random() < 0.5 ? first.optionIndexes[code] : second.optionIndexes[code];
    optionIndexes[code] = Number.isInteger(inherited)
      ? inherited
      : randomIndex((optionsByCourse.get(code) || []).length);
  });
  return buildCandidate(chosenCodes, optionIndexes, optionsByCourse);
}

function buildCandidate(chosenCodes, optionIndexes, optionsByCourse) {
  const selectedGroupsByCourse = {};
  const courseOptions = {};
  chosenCodes.forEach((courseCode) => {
    const options = optionsByCourse.get(courseCode) || [];
    if (!options.length) return;
    const index = Math.max(0, Math.min(optionIndexes[courseCode] || 0, options.length - 1));
    const option = options[index];
    optionIndexes[courseCode] = index;
    selectedGroupsByCourse[courseCode] = option.groups;
    courseOptions[courseCode] = option;
  });
  const normalizedCodes = Object.keys(courseOptions).sort();
  const key = normalizedCodes.map((code) => `${code}:${selectedGroupsByCourse[code].join("+")}`).join("|");
  return {
    key,
    chosenCodes: normalizedCodes,
    optionIndexes: { ...optionIndexes },
    selectedGroupsByCourse,
    courseOptions,
  };
}

function* exhaustiveCandidates(
  codes,
  count,
  optionsByCourse,
  evaluationContext,
  {
    orderMostPromisingFirst = false,
    hardConstraints = null,
    shouldPruneOverlap = () => false,
    shouldPruneCourseSet = () => false,
  } = {},
) {
  if (hardConstraints?.requireExactCourseCount && count < hardConstraints.targetCourseCount) return;

  for (const courseSet of combinations(codes, count)) {
    const upperBound = calculateCourseSetUpperBound(courseSet, evaluationContext);
    if (shouldPruneCourseSet(upperBound)) continue;
    yield* enumerateOptions(
      courseSet,
      0,
      {},
      [],
      optionsByCourse,
      hardConstraints,
      shouldPruneOverlap,
      orderMostPromisingFirst,
    );
  }
}

function* enumerateOptions(
  courseSet,
  index,
  optionIndexes,
  sessions,
  optionsByCourse,
  hardConstraints,
  shouldPruneOverlap,
  orderMostPromisingFirst,
) {
  if (index >= courseSet.length) {
    const candidate = buildCandidate(courseSet, optionIndexes, optionsByCourse);
    if (!hardConstraints || completeCandidateSatisfies(candidate, hardConstraints)) {
      yield candidate;
    }
    return;
  }
  const courseCode = courseSet[index];
  const rawOptions = optionsByCourse.get(courseCode) || [];
  const options = rawOptions.map((option, optionIndex) => ({ option, optionIndex }));
  if (orderMostPromisingFirst) {
    options.sort((first, second) => {
      const firstOverlap = hasOverlapBetween(sessions, first.option.sessions) ? 1 : 0;
      const secondOverlap = hasOverlapBetween(sessions, second.option.sessions) ? 1 : 0;
      return firstOverlap - secondOverlap || second.option.localPreference - first.option.localPreference;
    });
  }
  for (const { option, optionIndex } of options) {
    const createsOverlap = hasOverlapBetween(sessions, option.sessions);
    if (createsOverlap && (hardConstraints?.noOverlaps || shouldPruneOverlap())) continue;
    if (hardConstraints && !partialOptionSatisfies(option, hardConstraints)) continue;
    optionIndexes[courseCode] = optionIndex;
    yield* enumerateOptions(
      courseSet,
      index + 1,
      optionIndexes,
      [...sessions, ...option.sessions],
      optionsByCourse,
      hardConstraints,
      shouldPruneOverlap,
      orderMostPromisingFirst,
    );
  }
  delete optionIndexes[courseCode];
}

function createHardConstraints(general, hourSlots, targetCourseCount) {
  return {
    noOverlaps: Number(general.scoringWeights?.overlaps ?? 0) >= 10,
    requireExactCourseCount: true,
    targetCourseCount,
    exactFreeDays: general.freeDaysMode === "exact" ? general.exactFreeDays : null,
    requireNoGaps: general.gapPreference === "avoid" && general.gapImportance >= 10,
    requireSomeGap: general.gapPreference === "prefer" && general.gapImportance >= 10,
    strictTimeOfDay: general.timeOfDayPreference !== "neutral" && general.timeOfDayImportance >= 10
      ? general.timeOfDayPreference
      : null,
    forbiddenSlots: new Set(
      hourSlots
        .filter((slot) => Number(general.hourlyImportance[formatMinutes(slot.startMinutes)] ?? 10) === 0)
        .map((slot) => slot.startMinutes),
    ),
    hourSlots,
    activeDayIds: getActiveDayIds(general),
  };
}
function partialOptionSatisfies(option, constraints) {
  return option.sessions.every((session) => {
    const start = toMinutes(session.startTime);
    const end = toMinutes(session.endTime);
    if (constraints.strictTimeOfDay === "morning" && end > 14 * 60) return false;
    if (constraints.strictTimeOfDay === "afternoon" && start < 14 * 60) return false;
    return !constraints.hourSlots.some((slot) => {
      if (!constraints.forbiddenSlots.has(slot.startMinutes)) return false;
      return slot.startMinutes < end && slot.endMinutes > start;
    });
  });
}

function completeCandidateSatisfies(candidate, constraints) {
  if (constraints.requireExactCourseCount && candidate.chosenCodes.length !== constraints.targetCourseCount) return false;
  const sessions = candidate.chosenCodes.flatMap((code) => candidate.courseOptions[code]?.sessions || []);
  if (constraints.noOverlaps && countSessionOverlaps(sessions) > 0) return false;
  const freeDays = countFreeDays(sessions, constraints.activeDayIds);
  if (constraints.exactFreeDays !== null && freeDays !== constraints.exactFreeDays) return false;
  const gapHours = calculateGapHours(sessions);
  if (constraints.requireNoGaps && gapHours > 0) return false;
  if (constraints.requireSomeGap && gapHours < 1) return false;
  return true;
}

function calculateCourseSetUpperBound(courseSet, context) {
  return calculateImportanceBaseScore(courseSet, context);
}

function calculateImportanceBaseScore(courseCodes, context, candidate = null) {
  const bestPossibleImportance = [...context.selectedCodes]
    .map((code) => getBestCourseOptionImportance(code, context))
    .sort((a, b) => b - a)
    .slice(0, context.chosenCourseCount)
    .reduce((sum, value) => sum + value, 0);
  const chosenImportance = courseCodes.reduce((sum, code) => {
    const option = candidate?.courseOptions?.[code] || null;
    return sum + (option
      ? getCourseOptionImportance(code, option, context)
      : getBestCourseOptionImportance(code, context));
  }, 0);
  return bestPossibleImportance ? Math.min(100, chosenImportance * 100 / bestPossibleImportance) : 100;
}

function getBestCourseOptionImportance(courseCode, context) {
  const options = context.optionsByCourse?.get(courseCode) || [];
  if (!options.length) return 0;
  return Math.max(...options.map((option) => getCourseOptionImportance(courseCode, option, context)));
}

function getCourseOptionImportance(courseCode, option, context) {
  const courseImportance = getCourseImportance(context.preferences, courseCode);
  const preference = context.preferences.coursePreferences[courseCode] || {};
  if (!preference.useIndividualClassImportance) return courseImportance;
  return courseImportance * Math.max(0, Math.min(1, option.individualSatisfaction ?? 0));
}
function calculateOptionPreference(sessions, individual, general, hourSlots) {
  const hourly = calculateHourlyImportanceSatisfaction(sessions, general.hourlyImportance, hourSlots);
  const time = calculateTimePreferenceMatch(sessions, general.timeOfDayPreference);
  return individual * 0.55 + hourly * 0.3 + time * 0.15;
}

function calculateMaximumScoreWithOverlap(general) {
  const overlapWeight = normalizeWeight(general.scoringWeights.overlaps);
  return Math.max(0, 100 * (1 - overlapWeight));
}
function evaluateCandidate(candidate, context) {
  const general = context.preferences.general;
  const weights = general.scoringWeights;
  const allSessions = candidate.chosenCodes.flatMap((code) => candidate.courseOptions[code]?.sessions || []);
  const overlapCount = countSessionOverlaps(allSessions);
  const gapHours = calculateGapHours(allSessions);
  const freeDays = countFreeDays(allSessions, context.activeDayIds);
  const timeMatchRatio = calculateTimePreferenceMatch(allSessions, general.timeOfDayPreference);
  const hourlyImportanceSatisfaction = calculateHourlyImportanceSatisfaction(
    allSessions,
    general.hourlyImportance,
    context.hourSlots,
  );
  const matchingGroupSatisfaction = calculateMatchingGroupSatisfaction(candidate);
  const importanceBaseScore = calculateImportanceBaseScore(candidate.chosenCodes, context, candidate);
  const importanceSatisfaction = importanceBaseScore / 100;
  const individualSatisfaction = average(
    candidate.chosenCodes.map((code) => candidate.courseOptions[code]?.individualSatisfaction ?? 0),
    0,
  );
  const gapSatisfaction = calculateGapSatisfaction(gapHours, general.gapPreference);
  const freeDaySatisfaction = getFreeDaySatisfaction(freeDays, general);
  const timeSatisfaction = general.timeOfDayPreference === "neutral"
    ? 1
    : 1 - (general.timeOfDayImportance / 10) * (1 - timeMatchRatio);
  const gapWeight = general.gapPreference === "neutral" ? 0 : general.gapImportance;
  const finalHardFailure = candidate.chosenCodes.length !== context.targetCourseCount
    || (weights.overlaps >= 10 && overlapCount > 0)
    || (weights.matchingGroups >= 10 && matchingGroupSatisfaction < 1)
    || (general.freeDaysMode === "exact" && freeDays !== general.exactFreeDays)
    || (general.gapPreference === "avoid" && general.gapImportance >= 10 && gapHours > 0)
    || (general.gapPreference === "prefer" && general.gapImportance >= 10 && gapHours < 1)
    || (general.timeOfDayPreference !== "neutral" && general.timeOfDayImportance >= 10 && timeMatchRatio < 1)
    || hourlyImportanceSatisfaction <= 0;
  const penaltyComponents = [
    [weights.overlaps, overlapCount === 0 ? 1 : 0],
    [weights.matchingGroups, matchingGroupSatisfaction],
    [weights.individualClasses, individualSatisfaction],
    [gapWeight, gapSatisfaction],
    [weights.freeDays, freeDaySatisfaction],
    [weights.timeOfDay, timeSatisfaction],
    [weights.hourlySlots, hourlyImportanceSatisfaction],
  ].filter(([weight]) => weight > 0);
  const penaltyMultiplier = penaltyComponents.reduce((multiplier, [weight, satisfaction]) => {
    const normalizedWeight = normalizeWeight(weight);
    const normalizedSatisfaction = clamp01(satisfaction);
    return multiplier * (1 - normalizedWeight * (1 - normalizedSatisfaction));
  }, 1);
  const penaltyRatio = 1 - penaltyMultiplier;
  const score = finalHardFailure ? 0 : importanceBaseScore * penaltyMultiplier;
  return {
    ...candidate,
    score: Math.max(0, Math.min(100, score)),
    violations: buildViolations(candidate, {
      context,
      overlapCount,
      gapHours,
      freeDays,
      timeMatchRatio,
      hourlyImportanceSatisfaction,
      matchingGroupSatisfaction,
      importanceSatisfaction,
    }),
    metrics: {
      overlapCount,
      gapHours,
      freeDays,
      timeMatchRatio,
      hourlyImportanceSatisfaction,
      matchingGroupSatisfaction,
      importanceBaseScore,
      penaltyRatio,
    },
  };
}
function buildViolations(candidate, details) {
  const general = details.context.preferences.general;
  const activeDayCount = details.context.activeDayIds?.size || DEFAULT_ACTIVE_DAY_IDS.length;
  const violations = [];
  if (candidate.chosenCodes.length < details.context.targetCourseCount) {
    violations.push(`Only ${candidate.chosenCodes.length} of the requested ${details.context.targetCourseCount} courses have valid class options.`);
  }
  if (details.importanceSatisfaction < 0.999) violations.push("The solution leaves out one or more higher-priority courses.");
  if (details.overlapCount) violations.push(`${details.overlapCount} class overlap${details.overlapCount === 1 ? "" : "s"} remain in the timetable.`);
  if (general.gapImportance > 0 && general.gapPreference === "avoid" && details.gapHours > 0) {
    violations.push(`${formatMetric(details.gapHours)} hours of free time remain between classes.`);
  }
  if (general.gapImportance > 0 && general.gapPreference === "prefer" && details.gapHours < 1) {
    violations.push("The timetable does not create meaningful free time between classes.");
  }
  if (general.freeDaysMode === "exact" && details.freeDays !== general.exactFreeDays) {
    violations.push(`The timetable has ${details.freeDays} free days instead of ${general.exactFreeDays}.`);
  }
  if (general.freeDaysMode === "maximize" && details.freeDays < activeDayCount) {
    violations.push(`The timetable has ${details.freeDays} free days; more may be possible.`);
  }
  if (general.freeDaysMode === "minimize" && details.freeDays > 0) {
    violations.push(`The timetable still has ${details.freeDays} free day${details.freeDays === 1 ? "" : "s"}.`);
  }
  if (general.timeOfDayPreference !== "neutral" && general.timeOfDayImportance > 0 && details.timeMatchRatio < 0.999) {
    violations.push(`${Math.round((1 - details.timeMatchRatio) * 100)}% of class time falls outside the preferred ${general.timeOfDayPreference} period.`);
  }
  if (details.hourlyImportanceSatisfaction < 0.999) {
    violations.push(`Classes use lower-priority time slots: ${getUsedLowPrioritySlots(candidate, general.hourlyImportance, details.context.hourSlots).join(", ")}.`);
  }
  return violations;
}

function getUsedLowPrioritySlots(candidate, hourlyImportance, hourSlots) {
  const usedSlots = new Set();
  const sessions = candidate.chosenCodes.flatMap((code) => candidate.courseOptions[code]?.sessions || []);
  sessions.forEach((session) => {
    const start = toMinutes(session.startTime);
    const end = toMinutes(session.endTime);
    hourSlots.forEach((slot) => {
      if (slot.startMinutes >= end || slot.endMinutes <= start) return;
      const importance = Number(hourlyImportance[formatMinutes(slot.startMinutes)] ?? 10);
      if (importance < 10) usedSlots.add(`${slot.label} (${formatMetric(importance)})`);
    });
  });
  return [...usedSlots];
}

function countSessionOverlaps(sessions) {
  let overlaps = 0;
  for (let firstIndex = 0; firstIndex < sessions.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < sessions.length; secondIndex += 1) {
      if (sessionsOverlap(sessions[firstIndex], sessions[secondIndex])) overlaps += 1;
    }
  }
  return overlaps;
}

function hasOverlapBetween(existing, incoming) {
  return existing.some((first) => incoming.some((second) => sessionsOverlap(first, second)));
}

function sessionsOverlap(first, second) {
  if (first.dayOfWeek !== second.dayOfWeek) return false;
  if (first.courseCode === second.courseCode && first.group === second.group) return false;
  return toMinutes(first.startTime) < toMinutes(second.endTime)
    && toMinutes(second.startTime) < toMinutes(first.endTime);
}

function calculateGapHours(sessions) {
  let totalMinutes = 0;
  for (const daySessions of groupBy(sessions, (session) => session.dayOfWeek).values()) {
    const intervals = daySessions
      .map((session) => [toMinutes(session.startTime), toMinutes(session.endTime)])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (!intervals.length) continue;
    let currentEnd = intervals[0][1];
    intervals.slice(1).forEach(([start, end]) => {
      if (start > currentEnd) totalMinutes += start - currentEnd;
      currentEnd = Math.max(currentEnd, end);
    });
  }
  return totalMinutes / 60;
}

function calculateGapSatisfaction(gapHours, preference) {
  if (preference === "neutral") return 1;
  if (preference === "avoid") return 1 / (1 + Math.max(0, gapHours));
  return Math.max(0, gapHours) / (Math.max(0, gapHours) + 2);
}
function calculateTimePreferenceMatch(sessions, preference) {
  if (preference === "neutral" || !sessions.length) return 1;
  let matchingMinutes = 0;
  let totalMinutes = 0;
  sessions.forEach((session) => {
    const start = toMinutes(session.startTime);
    const end = toMinutes(session.endTime);
    totalMinutes += Math.max(0, end - start);
    const boundary = 14 * 60;
    matchingMinutes += preference === "morning"
      ? Math.max(0, Math.min(end, boundary) - start)
      : Math.max(0, end - Math.max(start, boundary));
  });
  return totalMinutes ? matchingMinutes / totalMinutes : 1;
}

function calculateHourlyImportanceSatisfaction(sessions, hourlyImportance, hourSlots) {
  if (!sessions.length) return 1;
  let weightedMinutes = 0;
  let totalMinutes = 0;
  sessions.forEach((session) => {
    const start = toMinutes(session.startTime);
    const end = toMinutes(session.endTime);
    hourSlots.forEach((slot) => {
      const overlap = Math.max(0, Math.min(end, slot.endMinutes) - Math.max(start, slot.startMinutes));
      if (!overlap) return;
      weightedMinutes += overlap * (Number(hourlyImportance[formatMinutes(slot.startMinutes)] ?? 10) / 10);
      totalMinutes += overlap;
    });
  });
  return totalMinutes ? weightedMinutes / totalMinutes : 1;
}


function normalizeWeight(value) {
  return clamp01(Number(value || 0) / 10);
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
function getFreeDaySatisfaction(freeDays, general) {
  const dayCount = getActiveDayIds(general).size || DEFAULT_ACTIVE_DAY_IDS.length;
  if (general.freeDaysMode === "neutral") return 1;
  if (general.freeDaysMode === "maximize") return freeDays / dayCount;
  if (general.freeDaysMode === "minimize") return (dayCount - freeDays) / dayCount;
  return Math.max(0, 1 - Math.abs(freeDays - general.exactFreeDays) / dayCount);
}

function getActiveDayIds(general) {
  const valid = new Set([1, 2, 3, 4, 5, 6, 7]);
  const ids = Array.isArray(general.activeDayIds)
    ? general.activeDayIds.map(Number).filter((id) => valid.has(id))
    : [];
  return new Set(ids.length ? ids : DEFAULT_ACTIVE_DAY_IDS);
}

function countFreeDays(sessions, activeDayIds) {
  const usedDays = new Set(
    sessions
      .map((session) => Number(session.dayOfWeek))
      .filter((dayId) => activeDayIds.has(dayId)),
  );
  return Math.max(0, activeDayIds.size - usedDays.size);
}

function weightedCourseSample(codes, count, preferences) {
  const available = [...codes];
  const selected = [];
  while (available.length && selected.length < count) {
    const weights = available.map((code) => getCourseImportance(preferences, code) + 0.25);
    let threshold = Math.random() * weights.reduce((sum, value) => sum + value, 0);
    let chosenIndex = 0;
    for (let index = 0; index < weights.length; index += 1) {
      threshold -= weights[index];
      if (threshold <= 0) {
        chosenIndex = index;
        break;
      }
    }
    selected.push(available.splice(chosenIndex, 1)[0]);
  }
  return selected;
}

function getCourseImportance(preferences, code) {
  return Number(preferences.coursePreferences[code]?.importance || 0);
}

function estimateSearchSpace(codes, count, optionsByCourse) {
  let total = 0;
  for (const courseSet of combinations(codes, count)) {
    let product = 1;
    courseSet.forEach((code) => {
      product *= (optionsByCourse.get(code) || []).length;
      product = Math.min(product, Number.MAX_SAFE_INTEGER);
    });
    total = Math.min(total + product, Number.MAX_SAFE_INTEGER);
  }
  return total;
}

function* combinations(items, count, start = 0, prefix = []) {
  if (prefix.length === count) {
    yield [...prefix];
    return;
  }
  for (let index = start; index <= items.length - (count - prefix.length); index += 1) {
    prefix.push(items[index]);
    yield* combinations(items, count, index + 1, prefix);
    prefix.pop();
  }
}

function groupBy(items, keyFn) {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}

function getGroupFamily(group) {
  const value = Number(group);
  return Number.isFinite(value) ? Math.floor(value / 10) : String(group);
}

function compareGroups(first, second) {
  return Number(first.group) - Number(second.group) || String(first.group).localeCompare(String(second.group));
}

function randomIndex(length) {
  return length > 0 ? Math.floor(Math.random() * length) : 0;
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
}

function toMinutes(time) {
  const [hours, minutes] = String(time).split(":").map(Number);
  return hours * 60 + minutes;
}

function formatMinutes(total) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function formatMetric(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function average(values, fallback = 1) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}
