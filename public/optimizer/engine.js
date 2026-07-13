import { createOptimizationProblem } from "./problem.js";
import { ALGORITHM_LABELS, createAlgorithm } from "./algorithms/index.js";

export { ALGORITHM_LABELS };

export function createOptimizationRun({
  catalog,
  preferences,
  hourSlots,
  algorithmKey,
  requestedSolutions,
  maxEvaluations,
  onlyDifferentSubjectsBestOptions = true,
}) {
  const problem = createOptimizationProblem(catalog, preferences, hourSlots);
  const impossible = problem.selectableCodes.length < problem.targetCourseCount;
  const algorithm = impossible ? null : createAlgorithm(algorithmKey, problem);
  const state = {
    evaluated: 0,
    bestSolutions: [],
    seen: new Set(),
    completed: impossible,
    provenOptimal: false,
    infeasible: impossible,
    stoppedByLimit: false,
  };

  function step(batchSize) {
    if (impossible) return snapshot();
    let attempts = 0;
    while (attempts < batchSize && state.evaluated < maxEvaluations && !algorithm.isComplete()) {
      attempts += 1;
      const candidate = algorithm.next();
      if (!candidate) break;
      state.evaluated += 1;
      if (state.seen.has(candidate.key)) continue;
      state.seen.add(candidate.key);
      if (!Number.isFinite(candidate.score) && !problem.isCandidateHardValid(candidate)) continue;
      insertBest(Number.isFinite(candidate.score) ? candidate : problem.evaluate(candidate));
      if (state.bestSolutions.length >= requestedSolutions
        && state.bestSolutions.every((solution) => solution.score === 100)) {
        break;
      }
    }

    const perfect = state.bestSolutions.length >= requestedSolutions
      && state.bestSolutions.every((solution) => solution.score === 100);
    state.completed = algorithm.isComplete() || state.evaluated >= maxEvaluations || perfect;
    state.infeasible = algorithm.isExact() && algorithm.isComplete() && state.bestSolutions.length === 0;
    state.provenOptimal = !state.infeasible && (algorithm.isProvenOptimal() || perfect);
    state.stoppedByLimit = state.evaluated >= maxEvaluations && !algorithm.isComplete() && !perfect;
    return snapshot();
  }

  function insertBest(solution) {
    if (!solution || solution.score <= 0) return;
    if (onlyDifferentSubjectsBestOptions) {
      const courseSetKey = getSolutionCourseSetKey(solution);
      const existingIndex = state.bestSolutions.findIndex(
        (existing) => getSolutionCourseSetKey(existing) === courseSetKey,
      );

      if (existingIndex >= 0) {
        if (compareSolutions(solution, state.bestSolutions[existingIndex]) >= 0) return;
        state.bestSolutions.splice(existingIndex, 1, solution);
      } else {
        state.bestSolutions.push(solution);
      }
    } else {
      state.bestSolutions.push(solution);
    }

    state.bestSolutions.sort(compareSolutions);
    state.bestSolutions = state.bestSolutions.slice(0, requestedSolutions);
  }

  function compareSolutions(first, second) {
    return second.score - first.score
      || first.violations.length - second.violations.length
      || first.key.localeCompare(second.key);
  }

  function getSolutionCourseSetKey(solution) {
    return [...solution.chosenCodes].sort().join("|");
  }
  function snapshot() {
    return {
      algorithmKey,
      algorithmLabel: ALGORITHM_LABELS[algorithmKey] || algorithmKey,
      evaluated: state.evaluated,
      bestSolutions: [...state.bestSolutions],
      completed: state.completed,
      provenOptimal: state.provenOptimal,
      infeasible: state.infeasible,
      stoppedByLimit: state.stoppedByLimit,
      searchSpaceSize: problem.searchSpaceSize,
      maxEvaluations,
    };
  }

  return { step, snapshot };
}
