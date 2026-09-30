export const MIGRATION_STEPS = [
  "legacy-exit",
  "midnight-registration",
  "private-state-backup",
  "eligibility",
  "proof",
  "settlement",
] as const;

export type MigrationStep = (typeof MIGRATION_STEPS)[number];
export type MigrationStepStatus = "pending" | "in-flight" | "complete" | "failed";

export type TimelineStep = Readonly<{
  status: MigrationStepStatus;
  publicReference?: string;
  updatedAt: string;
  error?: string;
}>;

export type MigrationTimeline = Readonly<{
  format: "shroudly-migration-timeline";
  version: 1;
  id: string;
  network: string;
  account: string;
  updatedAt: string;
  steps: Readonly<Record<MigrationStep, TimelineStep>>;
}>;

export function createMigrationTimeline(input: {
  id: string;
  network: string;
  account: string;
  now?: string;
}): MigrationTimeline {
  const now = input.now ?? new Date().toISOString();
  const steps = Object.fromEntries(
    MIGRATION_STEPS.map((step) => [step, { status: "pending", updatedAt: now }]),
  ) as Record<MigrationStep, TimelineStep>;

  return Object.freeze({
    format: "shroudly-migration-timeline",
    version: 1,
    id: input.id,
    network: input.network,
    account: input.account,
    updatedAt: now,
    steps: Object.freeze(steps),
  });
}

export function updateTimelineStep(
  timeline: MigrationTimeline,
  step: MigrationStep,
  update: Pick<TimelineStep, "status"> & Partial<Pick<TimelineStep, "publicReference" | "error">>,
  now = new Date().toISOString(),
): MigrationTimeline {
  const steps = {
    ...timeline.steps,
    [step]: {
      ...timeline.steps[step],
      ...update,
      updatedAt: now,
    },
  } as Record<MigrationStep, TimelineStep>;

  return Object.freeze({ ...timeline, updatedAt: now, steps: Object.freeze(steps) });
}

export function nextMigrationStep(
  timeline: MigrationTimeline,
): MigrationStep | null {
  return MIGRATION_STEPS.find((step) => timeline.steps[step].status !== "complete") ?? null;
}

export function pendingMigrationSteps(
  timeline: MigrationTimeline,
): readonly MigrationStep[] {
  return MIGRATION_STEPS.filter((step) => timeline.steps[step].status !== "complete");
}

export function serializeMigrationTimeline(timeline: MigrationTimeline): string {
  return JSON.stringify(timeline);
}

export function parseMigrationTimeline(serialized: string): MigrationTimeline {
  const parsed: unknown = JSON.parse(serialized);
  if (!isRecord(parsed) || parsed.format !== "shroudly-migration-timeline" || parsed.version !== 1) {
    throw new Error("invalid migration timeline");
  }
  return parsed as unknown as MigrationTimeline;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
