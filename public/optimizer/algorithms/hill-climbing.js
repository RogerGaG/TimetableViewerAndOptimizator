export function createHillClimbing(problem) {
  const neighborhoodSize = 14;
  const tabuLimit = 80;
  const tabu = [];
  let current = null;
  let currentScore = -Infinity;
  let best = null;
  let bestScore = -Infinity;
  let plateauSteps = 0;
  let pending = [];

  function restart() {
    current = best && Math.random() < 0.45
      ? problem.mutateCandidate(best, 3)
      : problem.randomCandidate();
    currentScore = problem.evaluate(current).score;
    plateauSteps = 0;
    pending = [];
  }

  function buildNeighborhood() {
    const candidates = [];
    for (let index = 0; index < neighborhoodSize; index += 1) {
      const intensity = index < 8 ? 1 : index < 12 ? 2 : 3;
      const neighbor = problem.mutateCandidate(current, intensity);
      if (!tabu.includes(neighbor.key)) candidates.push(problem.evaluate(neighbor));
    }
    candidates.sort((a, b) => b.score - a.score || a.violations.length - b.violations.length);
    pending = candidates;
  }

  return {
    key: "hillClimbing",
    next() {
      if (!current || plateauSteps >= 35) restart();
      if (!pending.length) buildNeighborhood();

      const evaluated = pending.shift() || problem.evaluate(problem.randomCandidate());
      const aspiration = evaluated.score > bestScore;
      if (evaluated.score > currentScore || (evaluated.score === currentScore && Math.random() < 0.15) || aspiration) {
        const improved = evaluated.score > currentScore;
        current = evaluated;
        currentScore = evaluated.score;
        plateauSteps = improved ? 0 : plateauSteps + 1;
        tabu.push(current.key);
        if (tabu.length > tabuLimit) tabu.shift();
      } else {
        plateauSteps += 1;
      }

      if (evaluated.score > bestScore) {
        best = evaluated;
        bestScore = evaluated.score;
        plateauSteps = 0;
      }
      return evaluated;
    },
    isComplete: () => false,
    isProvenOptimal: () => false,
    isExact: () => false,
  };
}
