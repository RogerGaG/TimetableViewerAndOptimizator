export function createConstraintSearch(problem) {
  let complete = false;
  const iterator = problem.exhaustiveCandidates({
    orderMostPromisingFirst: true,
    hardConstraints: problem.hardConstraints,
  });

  return {
    key: "constraintSearch",
    next() {
      const result = iterator.next();
      complete = result.done;
      return complete ? null : result.value;
    },
    isComplete: () => complete,
    isProvenOptimal: () => complete,
    isExact: () => true,
  };
}
