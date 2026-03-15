/**
 * Validate the action outcome against the scenario expectation so success and
 * failure cases can live in the same scenario catalog.
 */
export async function assertScenarioOutcome({ core, scenarioId, expectFailure, outcome }) {
  if (!scenarioId) {
    throw new Error("scenarioId is required");
  }

  const expectedFailure = expectFailure === "true";
  const expectedOutcome = expectedFailure ? "failure" : "success";

  if (outcome !== expectedOutcome) {
    core.setFailed(`Expected scenario '${scenarioId}' to ${expectedOutcome}, but got '${outcome}'.`);
    return;
  }

  core.info(`Scenario '${scenarioId}' finished with the expected outcome.`);
}
