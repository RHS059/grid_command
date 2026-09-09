# Grid Command hierarchical AI: phase 1 architecture and release handoff

Astra 4 Behavior, 2026-09-09. Recommended feature version: **v2.1.0**. This is a reviewable first implementation, not a certified Gulf War or Taiwan campaign model. No commit, push, deployment or release metadata change was made.

## Implemented architecture

The worker now runs a deterministic hierarchy over the existing game controllers. A side's operational commander chooses an objective and advance/defend/recover posture from received intelligence and friendly readiness. Formation subcommanders turn that intent into assault, reconnaissance, support, reserve, withdrawal and resupply missions. Infantry leaders score tactical actions with morale and initiative constraints. Independent vehicle decisions can preserve fuel, seek service or disengage from reported threats while dedicated transport/emergency controllers retain movement ownership.

```
Perception observations -> observer memory -> delayed/lossy report -> command blackboard
                                                        -> delayed relay -> local memory
Command intent -> stable formation decomposition -> delayed/lossy mission order
                                                  -> squad / vehicle decisions
                                                  -> existing movement, service and combat
```

Commander personality includes risk, tempo, initiative, consistency, reserve preference and experience. Seeded keyed draws create traits and radio losses independently of the combat RNG, so unit iteration order cannot consume another unit's random choices. Personality changes thresholds and timing, never supplies hidden enemy knowledge. Human factors track morale, cohesion, fatigue, suppression and recent damage. Withdrawal recovery uses hysteresis; surrender is optional and disabled by default.

Cognition updates at two Hz. Normal operational reviews take about 20-45 simulated seconds depending on tempo. Changes in known contact identities, observed objective control, friendly composition or severe readiness create an early-review trigger after an eight-second guard. Commander death selects a surviving commandable element, pauses replanning for at least 15 seconds and slows subsequent reviews. Previously delivered intent survives. Loss of the command post plus all remaining combat elements ends the match; territorial victory still works.

The default radio link uses a two-second delay per hop and 3% deterministic loss. Intelligence reaches the reporting observer immediately, higher command after an uplink, and other units after a relay. Mission orders traverse two command hops. Memories expire after 45 seconds and lose confidence. Contact IDs are never resolved against live hidden enemies; even an unobserved destruction no longer erases the perception memory. Objective locations are public scenario geography, while ownership requires nearby friendly observation and report delay.

The commander holds a personality-weighted reserve once enough maneuver units exist and releases it when received reports threaten the command post. Subcommanders use a small support-first timing window for a formation with ready supporting weapons. Local units produce structured ammunition, medical or fire-support requests in their mind state. These requests and assignment reasons are visible, but they do not yet have a full acceptance/completion workflow.

`configureFormations` accepts scenario-authored formation names and unit membership, rejecting duplicate assignments atomically. Default formations group at most three existing game units and preserve membership across losses and reinforcement. Existing squad soldiers remain the lowest represented infantry entities. These default groups are game abstractions, not asserted real-world organizations.

## Code audit and integration

Before this slice, `simulation.worker.ts` selected objectives from globally spotted live enemy units and directly routed every combat asset. `InfantryDirector.ensureOrder` could recreate a force-wide order without delivery. `Perception.update` removed a memory when its hidden target died. Soldier micro-behavior also looked up live positions from side-wide spotting. Those paths now use delivered hierarchical intent and observation snapshots when the hierarchy is active.

The existing staff council remains the mission-readiness gate. Fuel authorization, procurement, supplies, transport seating, route checks, collision, weapon eligibility and firing line of sight remain their specialized controllers. The adapter prevents undelivered orders or held reserves from being bypassed by automatic transport. Optional surrendered units cannot receive autonomous missions, board automatically, observe, shoot, be selected for deliberate fire, or capture objectives. Existing physical stray-fire collision remains possible; a complete prisoner system is outside this slice.

Decision traces live at `BattleState.behavior.traces` and retain the latest 240 entries. Entries identify level, actor, decision, reasons and relevant scores. Operational summaries also enter the existing radio event feed. Missions, memories, traits, pending packets and factor state are plain serializable data. No new dependency is required.

## Research basis

The design uses mission intent and delegated execution as described by the official [Marine Corps MCDP 6 publication](https://www.marines.mil/Portals/1/Publications/MCDP%206.pdf), which treats command and control as a human process under uncertainty and time pressure. The inspected document is the 1996 publication with Change 1 dated 2018; the current [publication record](https://www.marines.mil/News/Publications/MCPEL/Electronic-Library-Display/Article/898678/mcdp-6/) marks it current. This informs the hierarchy and degraded communications model, not numeric combat predictions.

The official Army [Mission Command discussion](https://www.armyupress.army.mil/Journals/NCO-Journal/Archives/2020/May/Mission-Command/) explains the ADP 6-0 principles of competence, trust, shared understanding, intent, mission orders, initiative and risk acceptance. The implementation translates these into bounded delegation and coherent risk thresholds. This article is a professional interpretation of 2019 doctrine; direct Army PDF endpoints timed out during this research, so it is not represented as a verified latest ADP edition.

The Army's [armor reserve discussion](https://www.army.mil/article/283006/bct_armor_reserve_an_approach_to_large_scale_combat_operations) cites ADP 3-90's reserve concept. Holding forces for a later decisive purpose informed the reserve state and explicit release trigger. The game does not yet model reserve movement corridors or formal relief-in-place.

For game architecture, Guerrilla's [2026 Decima HTN presentation](https://www.guerrilla-games.com/read/from-byrd-box-to-debug-boxes-htn-introduction-and-application-in-decima) describes hierarchical decomposition and debugging. Epic's [Behavior Tree overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/behavior-tree-in-unreal-engine---overview) separates blackboard knowledge from behavior and explains event-driven reevaluation. These primary studio sources support separating intent, knowledge and execution. This slice uses a small explicit mission decomposition plus utility decisions, not a general backtracking HTN engine.

The official [ATP 3-21.8 supplement](https://www.benning.army.mil/infantry/DoctrineSupplement/ATP3-21.8/) distinguishes platoon/squad organization and responsibilities. A future scenario importer should preserve actual dated organization, attachments and command relationships rather than infer a universal three-by-three hierarchy. HAL extraction and page-specific requirements are recorded in `reference/hal-behavior-notes.md`.

## Changelog for release review

- Add separate commander, subcommander, squad-leader and independent unit behavior modules.
- Add deterministic command blackboards, report/order delays and loss, fading contact confidence and local observation memories.
- Add stable personality traits, morale/cohesion/fatigue tracking, reserve use, withdrawal/rout, optional surrender and degraded command succession.
- Add formation mission decomposition, support sequencing, structured support requests and validated scenario formation membership.
- Prevent global order reconstruction, live hidden-contact lookup and automatic reserve transport from bypassing the hierarchy.
- Expose decision reasons, utility scores, bounded traces and operational radio summaries.
- Preserve the existing stock, mission fuel, transport, navigation and line-of-sight controllers.

## Exact owned files

New modules under `lib/game/ai/`: `model.ts`, `blackboard.ts`, `commander.ts`, `subcommander.ts`, `squad-leader.ts`, `unit-behavior.ts`, `hierarchy.ts`, `integration.ts`.

Modified integration files: `lib/game/types.ts`, `lib/game/simulation.worker.ts`, `lib/game/infantry-ai.ts`, `lib/game/perception.ts`, `lib/game/behaviors.ts`, `lib/game/transport.ts`, `lib/game/combat.ts`, `lib/game/capture.ts`.

New tests: `tests/hierarchical-ai.test.ts`. Internal reference notes: `reference/hal-behavior-notes.md`. This handoff is also copied into `reference/hierarchical-ai-architecture.md` for reviewers.

Other agents' Blender/model/animation edits were present at start and were left intact. Do not stage those files as part of an isolated behavior-only change without coordinating their owners.

## Validation and release status

- TypeScript project check passes (`tsc --noEmit --incremental false`).
- All **16 new behavior tests** pass: hierarchy, deterministic replay under reordered units, delayed uplink/downlink, sustained reporting, hidden enemy movement/destruction, delayed objective reports, blackout, succession, morale and risk, rout/surrender hysteresis, reserve release, support sequencing, vehicle autonomy, delivery boundaries, surrender capture exclusion, formation validation and reserve transport.
- All **5 existing simulation tests** pass, including the worker's 15,000-tick run to autonomous tier-three upgrades, deterministic restart, captures, victory and aircraft service.
- The earlier broader subset ran 71 tests (14 behavior tests at that point): **64 passed, 7 failed**. All seven failures reproduce with every behavior-modified source restored to HEAD in an isolated baseline. They concern older trailer/cargo, helicopter loading, fuel-burn, procurement and audio-schema expectations. Baseline: 52 tests, 45 passed, the same 7 failed. This is evidence of pre-existing failures, not a green full suite.
- The restricted Windows token caused `tsx` to fail in `os.userInfo` before tests loaded. The normal runner succeeds outside that token; native Node execution of separately compiled test closures also worked. No application code or test assertions were weakened to bypass the runner issue.
- No browser battle, whole-app production build or hardware performance certification was performed for this phase. Release owner should run these after integrating the active model lanes and resolving or explicitly tracking the existing test failures.

## Limits and next production slice

This phase does not yet represent an actual Gulf War order of battle or Taiwan invasion. It has no naval/amphibious campaign, theater air tasking, strategic lift, historical equipment tables, dated national doctrine packages, or nested corps/division/brigade graph. A scenario-ready model needs an explicit sourced organization tree, authoritative equipment/strength data with provenance, scenario objectives/constraints, independent fronts and logistics networks. The current four-person rifle squad and role catalog remain game abstractions.

Friendly readiness is still available instantly to the operational planner; enemy reports and objective ownership are delayed. Communications are side-level links rather than terrain/range-dependent radio networks or per-echelon outages. Local objective observation uses a proximity abstraction. Contact classification and position measurements have no sensor error beyond age/confidence, and there is no confirmed-destruction report type. Support timing does not certify suppression, and support requests do not consume or schedule dedicated assets yet. Medical requests, complex air-defense avoidance routes, prisoner handling, garrison/ambush tasks, objective morale events, experience accumulation and empirical calibration remain open.

The next slice should first introduce a typed organization tree with separate brigade/battalion/company/platoon nodes and scenario-authored command links. Then add delayed friendly status/support requests with acknowledgements, route/terrain-aware mission preconditions, task completion/failure reports and per-front replanning. Validate outcomes statistically across seeds and extreme communication settings before describing the simulation as militarily credible at operational scale.
