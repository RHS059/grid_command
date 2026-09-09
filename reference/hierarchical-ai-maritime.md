# Maritime behavior integration

2026-09-09. Adds PATROL_BOAT, FRIGATE, LANDING_CRAFT and AMPHIBIOUS_APC to the actual unit catalog, scenario loader, command decomposition, physical worker loop and procedural model catalog.

## Execution contract

`maritime-navigation.ts` owns deterministic bounded water routing over authored navigable polygons. `ai/naval-planner.ts` translates authored directives and received friendly reports into ordinary delayed missions. `maritime-controller.ts` owns acceptance, navigation, patrol completion, received-position escort, surface-fire evidence, air-defense stationing, lift reservations, individual 80/24-second seat transitions, landing, amphibious beach movement and finite port servicing. The established hierarchy retains communications, morale, human factors, succession, mission reports and traces. Physical combat retains visibility and actual ammunition spending. All moving craft use engine-time fuel burn.

The controller retains the accepted order identity when newer blocked orders arrive. It does not claim completion of a newer mission from older movement. Unloaded infantry retain identity/resources and resume normal orders; boats never capture. Fully embarked passengers remain under the lift controller if the order expires during the crossing. Unknown or blocked shores hold transitions; fuel exhaustion holds movement. Naval destruction uses the casualty controller and does not spawn survivors on arbitrary nearest land.

## Authored use

Load `reference/scenarios/synthetic-maritime.json` using the existing scenario file loader. It demonstrates the schema, not a geographic/historical campaign. Authored water must represent genuinely navigable water and landing shores must have loaded traversable terrain; otherwise landing deliberately blocks. Set per-unit `navalDirective` to PATROL, ESCORT, SURFACE_STRIKE, AIR_DEFENSE or AMPHIBIOUS_LIFT. Lift supplies pickupId, landingId and actual same-side passengerIds. Landing craft have 24 passenger seats; amphibious APCs have eight. Ships require a friendly recovery port.

## Evidence and limits

See the external `outputs/astra_4_behavior/naval-integration-handoff.md` for final commands/results and commit ownership. Tests cover real hierarchy order delay, scenario rejection, navigation, engine fuel, finite service stock, identities, transitions, cancellation, landing safety, beach crossing, escort report staleness and fire completion.

This is a deterministic game abstraction: no hydrodynamics, bathymetry, ocean state, submarine warfare, carrier flight-deck operations or historical calibration. Water route checks sample center lines; six-meter vessel separation is not full hull swept-volume navigation. Shore links are authored within 25 meters and require known clear shore, not a beach engineering model. Naval boarding uses timed per-seat identities inside hulls, not a new visual boarding animation asset. The detailed vehicle and carrier-soldier artwork remains separately owned by Astra 3. No browser validation, deployment or historical scenario work was performed.
