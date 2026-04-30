export function StatusPill({ status, label }: { status: string; label?: string }) {
  const normalized = status.replaceAll("_", " ");
  const tone =
    status.includes("confirmed") || status.includes("live") || status.includes("accepted")
      ? "success"
      : status.includes("pending") || status.includes("approval") || status.includes("onboarding")
        ? "warn"
        : status.includes("review") || status.includes("failed") || status.includes("past")
          ? "danger"
          : "info";

  return <span className={`pill ${tone}`}>{label ?? normalized}</span>;
}
