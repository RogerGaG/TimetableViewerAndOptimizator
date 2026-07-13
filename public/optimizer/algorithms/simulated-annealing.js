export function createSimulatedAnnealing(problem) {
  const initialTemperature = 22;
  const minimumTemperature = 0.08;
  let current = null;
  let currentScore = -Infinity;
  let best = null;
  let bestScore = -Infinity;
  let temperature = initialTemperature;
  let acceptedWindow = 0;
  let attemptedWindow = 0;
  let stagnant = 0;

  function restart() {
    current = best && Math.random() < 0.55
      ? problem.mutateCandidate(best, 3)
      : problem.randomCandidate();
    currentScore = problem.evaluate(current).score;
    temperature = initialTemperature;
    acceptedWindow = 0;
    attemptedWindow = 0;
    stagnant = 0;
  }

  return {
    key: "simulatedAnnealing",
    next() {
      if (!current || temperature < minimumTemperature || stagnant > 500) restart();
      const progress = temperature / initialTemperature;
      const intensity = progress > 0.65 ? 3 : progress > 0.25 ? 2 : 1;
      const neighbor = problem.mutateCandidate(current, intensity);
      const evaluated = problem.evaluate(neighbor);
      const delta = evaluated.score - currentScore;
      const accepted = delta >= 0 || Math.random() < Math.exp(delta / Math.max(temperature, minimumTemperature));

      attemptedWindow += 1;
      if (accepted) {
        current = evaluated;
        currentScore = evaluated.score;
        acceptedWindow += 1;
      }
      if (evaluated.score > bestScore) {
        best = evaluated;
        bestScore = evaluated.score;
        stagnant = 0;
      } else {
        stagnant += 1;
      }

      temperature *= 0.996;
      if (attemptedWindow >= 80) {
        const acceptanceRate = acceptedWindow / attemptedWindow;
        if (acceptanceRate < 0.08) temperature = Math.min(initialTemperature, temperature * 1.8);
        if (acceptanceRate > 0.75) temperature *= 0.8;
        acceptedWindow = 0;
        attemptedWindow = 0;
      }
      return evaluated;
    },
    isComplete: () => false,
    isProvenOptimal: () => false,
    isExact: () => false,
  };
}
