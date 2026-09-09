# Astra 4 Extra High: behavior audit and bounded follow-up

Date: 2026-09-09. Scope: Grid Command hierarchical behavior and the requested troop-carrier capacity correction. No commit, push, deployment, or release metadata edit was performed.

## Outcome

The original **21-test evidence was independently reproduced: 21 passed, 0 failed**. The follow-up closes four concrete gaps found by that audit: delayed orders being repeatedly replaced before delivery, mission delivery being mistaken for execution acceptance, immediate friendly-readiness access at operational command, and insufficient validation of scenario-authored organization. It also sets the troop carrier to **seven passengers plus one driver**, matching the current eight-seat rig.

Final combined checks: **41 passed, 0 failed**. The TypeScript project check passes. The tracked diff whitespace check passes, with only Git's normal LF/CRLF conversion warnings.

## Audit against the HAL notes and the user's simulation goal

| Reference concern | Audited Phase 1 behavior | Follow-up and remaining boundary |
| --- | --- | --- |
| HAL pp. 3, 8: commander intent distinct from execution | Separate commander, formation, squad and independent-unit modules; actual movement/service remain specialized controllers. | Added RECEIVED, ACCEPTED, BLOCKED, COMPLETED and EXPIRED execution states. A received order is no longer represented as successfully executing merely because it arrived. |
| HAL pp. 6, 10–11: command loss and degraded decisions | Deterministic succession, a 15-second minimum interruption, slower review, preserved intent and bounded morale effects are exercised by the original tests. | Invalid surrendered/bailed successors are excluded; degraded command also doubles new order and friendly-status travel time. Named subordinate commanders in the authored tree are validation/organization metadata, not independent simulated personalities or independently failing headquarters. |
| HAL pp. 8–14: readiness, reserves and constrained support | Local ammunition/fuel/health checks, reserve holds and support-first timing are implemented. Initial support requests lacked an acceptance/completion system. | Commander planning now uses received readiness snapshots, including fuel, availability, morale and support requests. Actual resupply fulfillment requires restored local resources; tests demonstrate that empty depots cannot supply or fulfill a request. Dedicated medical/fire-support asset scheduling remains open. |
| HAL pp. 18–21: explainable hierarchy and operational planning | Traces and one operational objective per side exist. Flat formation membership lacked parent-link validation. | Added an explicit authored echelon tree with validation and command-path timing. This remains one operational planner per side; no per-front campaign optimizer was introduced. |
| Credible variable simulation | Seeded traits and lossy reports permit bounded variation without granting hidden enemy knowledge. | The follow-up preserves deterministic replay with packet loss and reordered scenario input. Numeric coefficients remain game-design hypotheses, not empirically calibrated military predictions. |

The audit used the previously extracted and visually inspected HAL notes in `reference/hal-behavior-notes.md`, not new historical research. No claim is made that the game now represents a Gulf War or Taiwan force organization or campaign.

## Exact behavior changes

### Scenario organization

New `lib/game/ai/organization.ts` exposes `configureOrganization(command, nodes, ownUnits)`. Nodes identify a name, echelon, parent, assigned game units and optional commander. Supported echelon labels are THEATER, CORPS, DIVISION, BRIGADE, BATTALION, COMPANY, PLATOON and SECTION; represented game units remain the existing infantry squads and vehicles.

Validation is atomic and checks one root, existing parents, strictly descending echelons (therefore no cycles), unique/nonblank IDs and names, unique eligible same-side unit assignments, unique eligible same-side commanders, and subordinate membership for commanders represented by maneuver units. It validates every link before walking ancestry. The automatic-formation ID namespace is reserved. Scenario configuration must occur before operational planning starts, so it cannot silently invalidate in-flight orders.

Authored input is copied and sorted canonically. Each assigned formation retains its root-to-formation command path; each authored command node contributes a transmission hop for orders and friendly reports. Unassigned reinforcements retain explicit automatic groups attached to the authored root. These labels do not create personnel, equipment, dated doctrine or additional planning agents.

The existing `configureFormations` API now uses the stronger same-side/eligibility/name checks and the same pre-planning restriction. Commander, subcommander, squad-leader and independent-unit logic remain in separate files.

### Reports, command knowledge and degradation

New `lib/game/ai/reporting.ts` captures immutable friendly snapshots: health, ammunition, fuel, morale, availability, locally observed execution state and existing support requests. Starting units have an initial scenario briefing. Subsequent changes and reinforcements require delayed, deterministically lossy reports. Status packets are sent periodically (five seconds), with earlier sends for changed execution/support state and a half-second minimum send interval. Lost packets are retried through later snapshots.

The operational planner no longer accepts live units/factors as arguments. It reads only its received blackboard. Old reports decay toward uncertain readiness; they do not become confirmed destruction reports. Refusal penalties require received BLOCKED feedback. Out-of-order packets cannot replace a newer observation. Status packets older than the doctrine's report lifetime are discarded even on extreme-latency links, bounding queued stale status data.

Local subcommanders and specialized readiness/service controllers still inspect their own live units. Root commander loss is still detected directly by the simulation; terrain/range-dependent and per-echelon radio outages remain future work. Enemy/objective reports retain the Phase 1 side-level link abstraction rather than being rerouted through every authored node.

### Order and execution flow

Already-sent orders stay in flight when new revisions are issued, closing starvation when round-trip order latency exceeds the planning interval. The receiver ignores older revisions and applies only the newest revision if several arrive together. Issued orders continue to expire at their original lifetime; older buffered orders cannot revive an expired mission.

Local mission states are distinct:

- RECEIVED: the order arrived; route and readiness checks remain pending.
- ACCEPTED: local readiness and route checks passed, or the assigned reserve hold was accepted.
- BLOCKED: a dedicated controller owns the unit, staff/fuel requirements refuse the task, the objective is missing, or routing failed. The reason and retry time are recorded.
- COMPLETED: an observable task-specific result exists. Assault requires nearby observation of uncontested friendly objective control. Recon requires arrival at its assigned position and makes no claim of an enemy-free area. Withdrawal requires arrival. Resupply requires ammunition/health recovery and, for vehicles, fuel recovery with service complete.
- EXPIRED: intent expired without verified completion. Support and reserve holds are ongoing assignments, not automatically completed promises of suppression or success.

Blocked tasks retry after their local review interval. Service/emergency/transport/construction movement ownership is preserved. Failed routes clear the failed movement and install an explicit infantry hold, preventing the tactical director from reconstructing the rejected assault. Successful retries install the real movement order. Command learns execution outcomes only through later reports. Trace entries distinguish local mission transitions from received command reports.

The implementation never adds stock, ammunition, fuel, healing, or teleportation to satisfy this workflow. Existing service and logistics code supplies actual resources. The new resupply test consumes depot stock through `serviceVehicle` and observes completion only after resources are restored.

### Troop-carrier invariant

`troopSeats('TROOP_TRUCK')` is now 7; driver capacity remains separate. Current rig seat `01_driver` is first, followed by seven passenger positions. There are six forward-facing occupants including the driver and two transverse rear passengers. Two focused tests tie the live eight-visible-occupant state and unique rig seat metadata to passenger capacity, and exercise actual manual reservation acceptance for seven living passengers versus atomic rejection of eight. No Blender/GLB/rig generation or occupant-rendering file was edited in this follow-up.

## Exact follow-up file ownership

New source files:

- `lib/game/ai/organization.ts`
- `lib/game/ai/reporting.ts`

Updated Phase 1 source files:

- `lib/game/ai/model.ts`: organization, readiness and mission-execution types; shared command eligibility.
- `lib/game/ai/blackboard.ts`: initial friendly briefing, status queue, canonical receiver iteration and observer eligibility.
- `lib/game/ai/commander.ts`: planning from received readiness only, stale-status uncertainty and received refusal penalties.
- `lib/game/ai/subcommander.ts`: stronger organization validation, stable automatic groups, authored command-path timing.
- `lib/game/ai/hierarchy.ts`: report/fulfillment processing, queued-order preservation, ordered receiving and blocked-task retries.
- `lib/game/ai/integration.ts`: truthful acceptance/refusal feedback, route-failure hold and dedicated-controller ownership.
- `lib/game/types.ts`: **only the follow-up change to TROOP_TRUCK passenger capacity from 6 to 7**; preserve the existing shared Phase 1 changes.

Tests:

- `tests/behavior-followup.test.ts`: 11 new behavior regressions.
- `tests/carrier-capacity.test.ts`: 2 new capacity/metadata regressions.
- `tests/hierarchical-ai.test.ts`: update the existing reserve/support test's commander call to the new three-argument API, preserving all assertions and its local `own` fixture for formation decomposition.

This handoff is copied into `reference/hierarchical-ai-extra-high-followup.md`. The original Phase 1 handoff remains the historical baseline and is supplemented by this document. Other agents' model, vehicle, release and documentation edits were preserved.

## Validation evidence

1. Before follow-up edits, `node --import tsx --test tests/hierarchical-ai.test.ts tests/simulation.test.ts`: **21/21 passed**, independently confirming the Phase 1 evidence.
2. After implementation, `node --import tsx --test tests/hierarchical-ai.test.ts tests/behavior-followup.test.ts tests/carrier-capacity.test.ts tests/simulation.test.ts tests/vehicle-animation.test.ts`: **41/41 passed**, 0 failures, about 2.3 seconds test-runner duration in the final combined run. This includes 16 original behavior tests, 11 follow-up behavior tests, 5 simulation tests, 2 carrier capacity tests and 7 existing/current vehicle animation tests. The simulation test includes the 15,000-tick autonomous upgrade run, restart determinism, capture, victory and aircraft service.
3. `node node_modules/typescript/bin/tsc --noEmit --incremental false`: passes after the new tests and capacity change.
4. `git diff --check`: passes for tracked files; ordinary LF/CRLF conversion warnings only. New files were reviewed directly because they are untracked pending release-owner staging.

The restricted Windows token still prevents `tsx` from initializing `os.userInfo` (`uv_os_get_passwd` ENOMEM). These test runs used the normal token through the approved execution path. No assertions or application behavior were weakened for the runner problem.

This is a focused green suite, **not a claim of a green whole repository suite**. The Phase 1 handoff records seven independently reproduced pre-existing failures in its earlier broader subset. This follow-up did not repeat that baseline experiment, run a browser battle, certify whole-app production output, or measure hardware performance.

## Changelog bullets for release owner

- Add validated authored command trees with explicit echelon links, safe membership rules and deterministic command-path timing.
- Model friendly readiness and execution feedback as delayed, lossy reports rather than immediate operational knowledge.
- Prevent frequent replanning from starving already-sent orders on slow communications links.
- Distinguish receipt, acceptance, refusal, completion and expiry; retry locally blocked orders and report observed results.
- Preserve controller ownership and require actual restored resources before reporting resupply completion.
- Correct troop-carrier capacity to seven passengers plus one driver and enforce agreement with eight-seat model metadata.

## Version and remaining limits

Recommend **v2.1.0** for the combined, still-unreleased hierarchy feature relative to the v2.0 baseline. This follow-up belongs in that same minor release if Phase 1 has not shipped. If v2.1.0 was already published elsewhere, the new authored-organization/reporting functionality warrants **v2.2.0**, with the isolated seat/starvation/refusal fixes also suitable for a patch. The release owner should determine the actual base; this agent did not edit version metadata.

Still absent: sourced dated ORBAT/equipment data, nested independent headquarters planners and succession chains, independent fronts, theater air/naval/amphibious planning, strategic lift, per-link communications topology/terrain/jamming, sensor-error calibration, confirmed-destruction reporting, formal acknowledgements and dedicated scheduling for medical/fire-support requests, suppression-certified assault synchronization, empirical seed/outcome calibration and prisoner handling. The base game's squad/catalog scale and local proximity observation model remain abstractions. Authored echelon labels and delayed reports make these boundaries explicit; they do not certify operational military fidelity.
