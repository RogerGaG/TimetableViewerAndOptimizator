export function createGeneticAlgorithm(problem) {
  const populationSize = 64;
  const eliteCount = 8;
  const immigrantCount = 6;
  let population = [];
  let generation = 0;
  let childIndex = 0;
  let nextGeneration = [];

  function initialize() {
    population = [problem.evaluate(problem.deterministicCandidate())];
    while (population.length < populationSize) {
      population.push(problem.evaluate(problem.randomCandidate()));
    }
    population = deduplicate(population).sort(compareFitness);
    while (population.length < populationSize) population.push(problem.evaluate(problem.randomCandidate()));
  }

  function tournament() {
    const contestants = [];
    for (let index = 0; index < 4; index += 1) {
      contestants.push(population[Math.floor(Math.random() * population.length)]);
    }
    contestants.sort(compareFitness);
    return contestants[0];
  }

  function startGeneration() {
    population.sort(compareFitness);
    nextGeneration = population.slice(0, eliteCount);
    for (let index = 0; index < immigrantCount; index += 1) {
      nextGeneration.push(problem.evaluate(problem.randomCandidate()));
    }
    childIndex = nextGeneration.length;
  }

  function finishGeneration() {
    population = deduplicate(nextGeneration).sort(compareFitness).slice(0, populationSize);
    while (population.length < populationSize) population.push(problem.evaluate(problem.randomCandidate()));
    generation += 1;
    startGeneration();
  }

  return {
    key: "genetic",
    next() {
      if (!population.length) {
        initialize();
        startGeneration();
      }
      if (childIndex >= populationSize) finishGeneration();

      const first = tournament();
      const second = tournament();
      let child = problem.crossoverCandidates(first, second);
      const mutationRate = Math.max(0.18, 0.55 * Math.exp(-generation / 80));
      if (Math.random() < mutationRate) {
        child = problem.mutateCandidate(child, Math.random() < 0.2 ? 3 : 1);
      }
      const evaluated = problem.evaluate(child);
      nextGeneration.push(evaluated);
      childIndex += 1;
      return evaluated;
    },
    isComplete: () => false,
    isProvenOptimal: () => false,
    isExact: () => false,
  };
}

function compareFitness(first, second) {
  return second.score - first.score
    || first.violations.length - second.violations.length
    || first.key.localeCompare(second.key);
}

function deduplicate(population) {
  const unique = new Map();
  population.forEach((candidate) => {
    const previous = unique.get(candidate.key);
    if (!previous || compareFitness(candidate, previous) < 0) unique.set(candidate.key, candidate);
  });
  return [...unique.values()];
}
