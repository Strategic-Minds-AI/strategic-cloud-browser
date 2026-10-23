// Fail-closed release contract: older engines must not receive client sessions.
// This attestation is a runtime prerequisite, NOT a substitute for independent
// host isolation evidence or a network egress firewall.
export function assertBrowserEngineReady(report) {
  const { status, payload } = report || {};
  if (
    status !== 200 ||
    payload?.ok !== true ||
    payload?.browser_launch !== "verified" ||
    payload?.security?.sandbox !== "required" ||
    payload?.security?.non_root !== true ||
    !Number.isInteger(payload?.security?.uid) ||
    payload.security.uid <= 0
  ) {
    const error = new Error("secure browser engine readiness not verified");
    error.code = "SECURE_BROWSER_NOT_READY";
    throw error;
  }
  return true;
}
