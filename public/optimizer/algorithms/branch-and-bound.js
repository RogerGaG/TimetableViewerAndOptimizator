export function createBranchAndBound(problem) {
  let bestScore = -Infinity;
  let complete = false;
  const iterator = problem.exhaustiveCandidates({
    orderMostPromisingFirst: true,
    hardConstraints: problem.hardConstraints,
    shouldPruneCourseSet: (upperBound) => upperBound < bestScore,
    shouldPruneOverlap: () => bestScore > problem.maximumScoreWithOverlap,
  });

  return {
    key: "branchAndBound",
    next() {
      const result = iterator.next();
      complete = result.done;
      if (complete) return null;
      const evaluated = problem.evaluate(result.value);
      bestScore = Math.max(bestScore, evaluated.score);
      return evaluated;
    },
    isComplete: () => complete,
    isProvenOptimal: () => complete,
    isExact: () => true,
  };
}
