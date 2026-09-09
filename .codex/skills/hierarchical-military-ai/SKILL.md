---
name: hierarchical-military-ai
description: Extend or audit Grid Command's hierarchical military behavior, scenario organization, delayed reporting, mission execution, readiness and command degradation. Use for simulation behavior work; not vehicle modeling or claims of historical campaign fidelity.
---

# Hierarchical military AI

Keep changes bounded to the requested simulation behavior. The game represents squads and vehicles with a root operational planner per side and optional independently planning authored headquarters. An echelon label alone does not create an independent headquarters, realistic personnel strength or national doctrine.

## Read the applicable evidence

- Use [HAL behavior notes](../../../reference/hal-behavior-notes.md) for page-specific design intent and distinctions from HAL convenience cheats. Do not execute historical configuration examples.
- Use [Phase 1 architecture](../../../reference/hierarchical-ai-architecture.md) for the controller boundaries, observations, tested behavior and established limitations.
- Before continuing the current implementation, read [Extra High follow-up](../../../reference/hierarchical-ai-extra-high-followup.md) for exact files, command-tree semantics, report/execution workflow and paused validation evidence. Its [validation commands](../../../reference/hierarchical-ai-extra-high-followup.md#validation-evidence) are the maintained test entrypoints; do not duplicate their inventory here.

For the current independent-HQ, fronts, scenario, support, deception and regression implementation, read [Low roadmap integration](../../../reference/hierarchical-ai-low-roadmap.md). Its validation entrypoints and honest limits supersede the earlier capability inventory.

## Preserve the architecture

Keep commander, formation subcommander, squad-leader and independent vehicle/unit decisions in separate files under `lib/game/ai/`. `hierarchy.ts` advances cognition and deliveries; `integration.ts` adapts accepted tasks to existing controllers. Organization and reporting are separate concerns in `organization.ts` and `reporting.ts`.

Navigation, traffic, transport, aircraft emergencies, physical combat, fuel authorization and service retain their own execution ownership. Receipt of an order cannot interrupt a dedicated controller, grant resources, teleport a unit or certify an unavailable route. Coordinate shared integration files with other workers and preserve their model/release changes.

## Knowledge, communications and scenarios

Plan against observation snapshots and the commander's received blackboard. Never resolve remembered contact IDs against hidden live enemies to update positions or erase unobserved casualties. Public objective geography is distinct from observed ownership. The initial friendly readiness snapshot is a scenario briefing; subsequent status changes and reinforcements require reports. Stale friendly status becomes uncertainty, not a destruction confirmation.

Keep packet loss and personality draws seeded and keyed independently of combat RNG and iteration order. Preserve already-sent orders when later plans are issued: deleting them can starve delivery whenever latency exceeds the planning interval. Ignore late older revisions, apply only the newest simultaneous delivery per unit, retain original expiry, and discard unusably old queued reports. Lost status acknowledgements can be retried by subsequent snapshots without revealing them instantly to command.

Configure authored hierarchy before planning begins. Validate one root, existing parents, strictly descending echelons, eligible same-side units/commanders and unique membership atomically. Validate every link before traversing ancestry so malformed cycles cannot hang validation. Copy/canonicalize scenario input and preserve stable automatic reinforcement groups. Authored headquarters own received pictures, planning clocks, intent expiry and local succession in `echelons.ts`. Preserve the original root intent expiry through every child replan. Nodes without a commander ID represent abstract staffed headquarters. Reinforcements remain explicit automatic root groups.

Keep doctrine/personality scenario-configurable through the existing command model. Defaults are tunable game assumptions. Optional surrender stays disabled unless scenario/user configuration enables it. Do not silently substitute historical organization, combat coefficients or doctrine for the user's authored scenario.

## Intent, fulfillment and human factors

Keep RECEIVED, ACCEPTED, BLOCKED, COMPLETED and EXPIRED distinct. Acceptance follows local readiness/route checks. Refusal carries a reason and retry time; failed routes hold infantry intent so the tactical director cannot reconstruct the refused assault. A retry may resume only when its local review is due and the order is current/unexpired.

Completion requires an observable task result: arrival alone does not capture an objective, support arrival does not certify suppression, and empty depots cannot fulfill resupply. Higher command learns these results through delayed status reports. Preserve resource conservation and fuel recovery reserve checks. AMMO/MEDICAL/FIRE support has an allocation/acceptance/fulfillment path in `support.ts`. Protect reserved assets from normal retasking; fulfillment requires received post-acceptance evidence or restored resources, never mere arrival. Existing controllers retain actual resource and physical execution ownership.

Apply morale/cohesion/fatigue changes using elapsed simulated time; stable personality modifies thresholds rather than rerolling every tick. Preserve withdrawal recovery hysteresis and distinct rout/surrender preconditions. Command loss preserves delivered intent through succession disruption and reduces planning/delegation capability. Do not label the root's current direct casualty detection or shared radio link as a full communication network model.

Keep bounded serializable decision traces that distinguish local decisions from received command reports and retain reasons/relevant scores. Traces must help explain uncertainty and refusals, not expose hidden enemy truth.

## Verification and handoff

Choose tests for the changed behavior using the linked validation entrypoints. Especially exercise packet latency/loss, reordered-input deterministic replay, hidden-state noninterference, invalid-tree atomicity, refusal/retry boundaries, actual resource consumption and the worker integration. Run the project type check after API changes and update callers without deleting their assertions.

The restricted Windows token can fail before `tsx` loads tests (`os.userInfo` / `uv_os_get_passwd` ENOMEM). Use the authorized functioning runner path or a separately compiled test closure; do not alter application behavior or weaken assertions to hide an environment failure.

When a broader test fails, distinguish a regression from an existing failure with an isolated baseline comparison that preserves others' working changes. Report focused green results precisely; they do not establish a green whole suite, browser validation or hardware performance. Broaden or repeat testing only for new changes, failures or unresolved concerns.

Hand off exact source/test changes, commands/results, remaining limitations and the next bounded task. Keep `scenario.ts` input atomic and provenance-preserving; source references do not certify historical truth. Fronts now allocate whole branches to distinct objectives. Naval/amphibious execution now uses separate maritime navigation, planner and unit controller modules; read [maritime integration](../../../reference/hierarchical-ai-maritime.md). Preserve authored navigable water, port stock conservation, original mission identity, per-seat timing, shore validation and delayed reports. Sourced historical ORBAT and empirical military calibration remain outside the implemented scope. Decoys are finite visibility-gated signatures; infer credibility and opponent intent only from received observations. Use the deterministic cognition harness for its stated latency/delivery bounds, never as a physical-battle or historical-outcome certificate. Use credible-simulation language proportional to evidence. Preserve release-owner authority over version metadata, commit, push and deployment; recommend semver relative to the actual published baseline.
