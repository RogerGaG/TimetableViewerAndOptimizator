import { createRandomSearch } from "./random-search.js";
import { createHillClimbing } from "./hill-climbing.js";
import { createSimulatedAnnealing } from "./simulated-annealing.js";
import { createGeneticAlgorithm } from "./genetic-algorithm.js";
import { createBranchAndBound } from "./branch-and-bound.js";
import { createConstraintSearch } from "./constraint-search.js";

export const ALGORITHM_LABELS = {
  random: "Random search",
  hillClimbing: "Hill climbing",
  simulatedAnnealing: "Simulated annealing",
  genetic: "Genetic algorithm",
  branchAndBound: "Branch and bound",
  constraintSearch: "Constraint search",
};

export function createAlgorithm(key, problem) {
  if (key === "hillClimbing") return createHillClimbing(problem);
  if (key === "simulatedAnnealing") return createSimulatedAnnealing(problem);
  if (key === "genetic") return createGeneticAlgorithm(problem);
  if (key === "branchAndBound") return createBranchAndBound(problem);
  if (key === "constraintSearch") return createConstraintSearch(problem);
  return createRandomSearch(problem);
}
