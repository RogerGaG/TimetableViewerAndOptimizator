export function createRandomSearch(problem) {
  let iteration = 0;
  let elite = null;
  let eliteScore = -Infinity;
  const recent = [];

  return {
    key: "random",
    next() {
      let candidate;
      if (iteration === 0) {
        candidate = problem.deterministicCandidate();
      } else if (elite && iteration % 4 === 0) {
        candidate = problem.mutateCandidate(elite, iteration % 12 === 0 ? 3 : 1);
      } else if (recent.length && iteration % 9 === 0) {
        candidate = problem.mutateCandidate(recent[Math.floor(Math.random() * recent.length)], 2);
      } else {
        candidate = problem.randomCandidate();
      }

      const evaluated = problem.evaluate(candidate);
      if (evaluated.score > eliteScore) {
        elite = candidate;
        eliteScore = evaluated.score;
      }
      recent.push(candidate);
      if (recent.length > 24) recent.shift();
      iteration += 1;
      return evaluated;
    },
    isComplete: () => false,
    isProvenOptimal: () => false,
    isExact: () => false,
  };
}
