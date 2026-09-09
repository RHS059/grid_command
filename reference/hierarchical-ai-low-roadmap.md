# Astra 4 Low — behavior roadmap integration handoff

2026-09-09. Continues the existing Extra High behavior work and the Low carrier-transition handoff. No commit, push, release metadata change, Blender regeneration or GLB edit. Terra retains the user-designated GitHub commit/PR/merge role.

## Delivered behavior

1. Authored headquarters now own separate received pictures, stable personalities, planning clocks and local succession. Parent intent travels through actual headquarters packets. Local status reaches each ancestor after the relevant path delay. A local commander loss interrupts that headquarters for at least 15 seconds, selects a distinct eligible local successor, and preserves existing delivered intent. Child replanning cannot extend the original parent intent expiry. Automatic unnamed formations retain the prior root-command path.
2. The operational planner assigns up to the doctrine's maximum number of simultaneous objective fronts (default two). It keeps command branches intact, emits distinct objectives to different branches, and retains exclusive reserve membership. A reported base threat releases root reserves. Each child may choose local posture within its received objective authority.
3. buildScenario validates and creates an independent scenario state: represented units and strength, objectives, authored organization, doctrine, personality, communications, explicit starting stock/credits and source references. Units, nodes and sources reject duplicate/unsafe IDs. Unsupported roles, missing commanders, invalid provenance references, nonfinite positions and invalid numerical policies are rejected. Automatic supply/reinforcements require scenario opt-in. Worker init/restart accepts the scenario; invalid input leaves the running operation intact. Settings now offers Load an authored operation, a name/count review and Start loaded operation.
4. Received FIRE/MEDICAL/AMMO requests reserve existing assets or depot service, send executable missions, and protect allocations from ordinary retasking. States distinguish ASSIGNED, ACCEPTED, BLOCKED, FULFILLED and EXPIRED. Fulfillment uses received post-acceptance firing evidence or restored resources. Actual route acceptance, aircraft fuel authorization, depot consumption, medical behavior and physical firing remain in existing controllers. Naval and amphibious capabilities are explicitly empty because the engine has no such roles/controllers.
5. Authored decoy signatures consume a finite per-unit charge inventory, require deployment near the source, pass the same observer visibility gate, and reach command through normal reports. Command receives no decoy truth flag. Counterdeception uses corroboration and implausible reported displacement; it keeps nonzero credibility, positional uncertainty and competing objective-intent hypotheses. No hidden live enemy lookup is used by this model.
6. Named decision profiles expose bounded threat/distance weights, recovery/defense thresholds and review cadence. Trace reasons identify the selected profile. The deterministic regression harness compares profiles across seeds against explicit latency/delivery/finite-state/monotonic-revision limits. This is synthetic scenario calibration infrastructure, not empirical validation of military behavior.

The completed carrier milestone remains integrated: seven passengers plus driver, stable actor identity, entry staging, stopped 80/24-second mounting and serial dismounting, duplicate-render suppression, safe exits and cancellation. See low-carrier-transition-handoff.md for its detailed contract.

## New files in the roadmap continuation

- lib/game/ai/echelons.ts — independent HQ runtime, intent/report receipt, scoped planning, local succession and preserved original expiry.
- lib/game/ai/fronts.ts — branch-preserving objective allocation.
- lib/game/ai/scenario.ts — validated scenario construction and provenance retention.
- lib/game/ai/support.ts — support capabilities, allocation ownership and truthful reported fulfillment.
- lib/game/ai/opponent.ts — observation-only credibility/intent uncertainty.
- lib/game/ai/deception.ts — finite authored visibility-gated signature deployment.
- lib/game/ai/regression.ts — deterministic cognition/communications metrics and profile evaluation.
- components/game/scenario-loader.tsx — file selection, validation and operation review.
- tools/evaluate-behavior.ts — scenario/profile evaluation CLI.
- reference/scenarios/synthetic-two-fronts.json — clearly synthetic example, no historical claim.
- tests/echelon-planners.test.ts, fronts.test.ts, scenario-config.test.ts, support-allocation.test.ts, opponent-deception.test.ts, behavior-regression.test.ts — 18 new roadmap regressions.

## Updated files in the roadmap continuation

- lib/game/ai/model.ts — typed HQ packets/state, fronts, support, opponent and decision-profile fields; issued mission revision tracking.
- lib/game/ai/hierarchy.ts — independent-node advancement, support mission dispatch and collision-free per-unit revision sequencing.
- lib/game/ai/commander.ts — simultaneous fronts, uncertainty-weighted threat and named tunable decision profiles.
- lib/game/ai/subcommander.ts — formation-specific front target.
- lib/game/ai/reporting.ts — position/firing evidence and delayed per-HQ readiness delivery.
- lib/game/ai/organization.ts — reject unsafe dictionary-key node IDs while preserving existing atomic tree validation.
- lib/game/types.ts — scenario metadata and finite deception inventory/state, preserving the earlier carrier fields and other shared edits.
- lib/game/perception.ts — visibility-gated decoy observations.
- lib/game/simulation.worker.ts — authored scenario init/restart, atomic rejection, opt-in authored reinforcement economy.
- components/game/game-dialogs.tsx and game.tsx — narrow scenario-loader wiring; no unrelated UI redesign.
- tests/behavior-followup.test.ts — the authored four-hop test now asserts no premature leaf packet, steps each real relay and retains the original eight-second end-to-end delivery assertion.
- .codex/skills/hierarchical-military-ai/SKILL.md — maintained implementation reference and current capability/limit corrections.

Existing source changes from the Extra High phase and the weapon/model lanes were preserved. The separate carrier continuation adds its own source/test files listed in its handoff; do not treat a whole repository diff as exclusively this roadmap lane.

## Validation entrypoints and evidence

Final combined command from work/grid_command:

node --import tsx --test tests/behavior-regression.test.ts tests/opponent-deception.test.ts tests/support-allocation.test.ts tests/scenario-config.test.ts tests/fronts.test.ts tests/echelon-planners.test.ts tests/behavior-followup.test.ts tests/hierarchical-ai.test.ts tests/carrier-transitions.test.ts tests/carrier-capacity.test.ts tests/simulation.test.ts tests/vehicle-animation.test.ts tests/models.test.ts

Result: 68 passed, 0 failed. Includes original delayed-report/refusal/noninterference coverage, real HQ relay/succession/expiry, fronts, worker scenario load/rejection/restart, support stock consumption, decoy observation gates, profile metrics, carrier transitions and model/preview checks.

node node_modules/typescript/bin/tsc --noEmit --incremental false: passed during milestone validation. Final production build and whitespace results are recorded in the completion addendum below.

node --import tsx tools/evaluate-behavior.ts reference/scenarios/synthetic-two-fronts.json: both candidate profiles pass four seeds (1, 7, 37, 101), using 120 seconds of cognition and explicit max 30-second delivery/minimum four-order criteria. Saved evaluation: outputs/astra_4_behavior/decision-profile-evaluation.json. Latency is measured from leaf mission issuance; it is not an end-to-end parent-intent latency metric. The separate relay test establishes the four-hop eight-second path.

The normal Windows-token runner is still required for tsx because the restricted token fails before tests initialize with uv_os_get_passwd ENOMEM. No application behavior or assertions were weakened for that environment failure.

Earlier additional transport subset: four passed, one pre-existing helicopter reservation assertion failed (undefined versus six squads). The same assertion independently failed with the isolated pre-transition transport reconstruction. No whole-suite-green claim is made and no historical baseline failures were silently removed.

## Honest limits and final app review

- Browser visual acceptance remains a separate required review. Worker integration and production compilation do not certify terrain streaming, pointer interaction, carrier limb clearance or frame rate. Inspect the settings scenario loader, a running authored operation, a complete truck mount/serial exit and existing model preview controls.
- Root commander loss remains locally/directly detected at the simulation boundary. Named child headquarters have distinct local succession, but this is not a physical staff/communications-network simulator. Side-wide radio availability remains a shared gate in addition to per-HQ settings. Headquarters without a commanderUnitId represent abstract staffed nodes whose individual leader cannot be killed.
- Front assignment is deterministic branch allocation across objective scores, not a theater optimizer or historically sourced operational plan. New automatic reinforcements attach at root; they are not silently inserted into a historical authored formation.
- Scenario labels, dates and source fields preserve provenance supplied by the author; they do not verify it. No Gulf War, Taiwan or other historical ORBAT/equipment/doctrine dataset was invented. Each represented unit supports at most 64 actual individuals; echelon labels do not instantiate thousands of personnel.
- Ground/air fire allocation, medical movement and depot service use existing game controllers. There is no naval/amphibious campaign or strategic lift planner, no salvo scheduler, no suppression certification, no medical consumables model added, and no proof that nearby health recovery was caused exclusively by the allocated medic. Fire evidence establishes activity after acceptance near the requester, not target destruction.
- Decoys are abstract observable signatures with finite charges, not new rendered/destructible dummy vehicles. This is not a full tactical feint, concealment, electronic order-of-battle or adversarial deception planner. Counterdeception applies the same evidence rules to true and false contacts and does not know their hidden truth.
- Calibration profiles are tunable game hypotheses. The harness measures cognition/communications, not combat outcome accuracy, force-exchange ratios, historical fit or hardware performance. Empirical datasets and broader outcome calibration remain future evidence work.
- Carrier limitations remain: immediate existing driver bailout; squad-level physical combat accounting while mounting; navigation entry/exit validation rather than imported-limb swept-volume proof; no new browser playback claim.

Terra should review the combined shared diff and app validation evidence before the user-authorized commit/PR/merge. This agent has not staged, committed, pushed or modified version metadata.

## Completion addendum

Final source production build: node node_modules/next/dist/bin/next build --webpack passed, including compilation, TypeScript, static generation and /, /lab, /range pages. The final build was rerun after the evidence-timing and parent-expiry review fixes. git diff --check passed with only normal LF/CRLF warnings.

Full repository run: node --import tsx --test tests/*.test.ts — 143 tests, 133 passed, 10 failed. Full evidence is outputs/astra_4_behavior/full-suite.log. Failures:

- double trailers increase actual cargo capacity to 2,700 without creating stock
- 24 seats fit six four-person rifle squads; fewer than 12 never reserve an assault flight
- helicopter touches down, unloads exactly one soldier per second, then infantry capture
- all moving vehicle classes have doubled burn and fuel/ammo service takes 60 seconds
- partial sound updates are atomic and malformed banks retain last working sounds
- sector navigation holds unknown areas without clamping city endpoints
- transport reservations are atomic and actual troops disembark
- requested assets have distinguishable silhouettes and articulated parts
- commanders buy infantry then transport symmetrically and deliberately save
- vehicle fuel depends on simulated engine time, not playback speed; infantry is unaffected

Seven match the earlier documented legacy trailer/helicopter/fuel/procurement/audio categories. The transport-reservation assertion was additionally reproduced against the saved pre-transition transport implementation: actual undefined versus expected ['BLU-RIFLE'], before any animation logic is reached. Scratch evidence remains under work/carrier-baseline as non-executable text. The navigation and heavy-lift rotor assertions concern source this continuation did not change; they were not independently baseline-reconstructed in this final pass. Treat the full-suite failures as release-review work, not a passing whole suite.

Skill validation: attempted the bundled quick_validate.py; it could not initialize because the bundled Python lacks PyYAML. A direct check of the saved skill's name/description frontmatter, local linked resources and unfinished placeholders passed. The implementation/test evidence above validates the actual workflow capabilities; the unavailable generic validator is not represented as a success.

No browser acceptance was performed by this lane. Root was notified to arrange the authored-scenario/settings/transport/preview visual pass before Terra's final commit/PR/merge.
