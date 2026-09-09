- v2.0.1
  - Reworked infantry with faceted uniforms, tapered limbs, fitted armor, helmets, equipment, and detailed rifles and machine guns.
  - Replaced armored vehicle boxes with sloped hulls, detailed turrets, wheels, and tracks.
  - Rebuilt the troop carrier as an open utility vehicle with a roll cage and visible seating.
  - Updated model viewer materials for the low poly art style while retaining animation and instancing.
  - Switched production builds to Webpack to bundle the simulation worker for GitHub Pages.

- v2.0.2
  - Added CAS_FIGHTER, a separate two-seat propeller aircraft based on the first two references, with wing guns, tandem canopy, five-blade propeller and external fuel tanks. No anti-tank missiles or explosive gun splash.
  - CAS guns can engage every ground unit role, including armored vehicles. Tank damage is 10% of the same gun hit against other ground targets after range falloff; ordinary bullets still cannot damage armor. CAS does not target aircraft.
  - Added CAS purchasing, airfield spawning and servicing, commander tasking, forward firing arc, model catalog entry and aircraft UI identification. Initial balance: 8,000 SP, 85 m/s, 140 m flight altitude, 1,200 m gun range, 6 base damage and 0.2-second firing cooldown.
  - Rebuilt the strike fighter with a faceted pointed fuselage, tandem canopy, swept wings, paired intakes and exhausts, and twin vertical tails based on the third reference.
  - Rebuilt the transport helicopter with a faceted glazed cabin, four-blade main rotor, tail rotor, twin engine housings and external tanks based on the fourth reference. Existing troop capacity is preserved.
  - Rebuilt the heavy lift helicopter as the sixth reference's angular cargo airframe with a high wing, two wingtip rotors, twin fins and cargo bay. Existing 1,800-unit lift capacity and sling cargo behavior are preserved.
  - Rebuilt the attack helicopter from the same heavy-lift airframe, adding an independently aimed turret beneath the cockpit. Existing attack-helicopter weapon behavior is preserved.
  - Rebuilt the supply truck as the fifth reference's eight-wheel cab-over carrier with split windshield, mirrors, tanks and ribbed cargo container. Existing cargo and trailer capacities are preserved.
  - Baked stationary aircraft and truck details by material while retaining separate rotor, turret and trailer groups. Updated model-design.md with these reference recipes.
  - Submitted for owner confirmation without running tests, builds or model renders, as requested.

- v2.0.3
  - Heavy lift and attack VTOL nacelles tilt with signed forward speed: upward at hover, forward during forward travel, and backward during reverse travel. Rotor spin remains independent of nacelle tilt.
  - Attack helicopter chin turret tracks ground/world aim independently of aircraft heading and updates between shots. Model lab animation demonstrates turret rotation and forward/reverse nacelle tilt.
  - Light troop carrier now displays a seated driver with bent knees and hands at the steering wheel, plus up to six seated passengers drawn from actually boarded active troops. Passengers disappear from their seats as they disembark.
  - A living troop carrier driver bails out below 30% vehicle health when a valid ground exit is available, becoming one surviving dismounted crew member. Boarded troops evacuate and pickup reservations are released. The vehicle remains abandoned and targetable, with no automatic driving or servicing after crew exit. Bailout does not count surviving crew as casualties or duplicate them.
  - Updated model-design.md. No tests, builds or visual renders run; submitted for manual confirmation.

- v2.0.4
  - Replaced the cargo plane's turboprop model with a reference-inspired strategic jet airlifter: broad fuselage, swept high wings, four underwing engines, tall T-tail and multi-wheel landing gear.
  - Applied the heavy lift VTOL's pale faceted bodywork, dark angular cockpit, muted metal details and small team markings. Retained the animated rear cargo ramp and existing cargo missions, speed and capacities.
  - Updated model-design.md and the model catalog. No tests, builds or visual renders run; submitted for manual review.

- Use geometry normals for battlefield vehicle and infantry lighting instead of derivative-based flat shading at large map coordinates, addressing the speckled/grainy surfaces absent from the centered model preview. Apply the same setting to aircraft, support vehicles and seated occupants when their models are created. No tests, builds or renders run; submitted for manual confirmation.


- v0.9.33
  - Repaired the Babylon geographic tile upload so the existing OpenFreeMap San Diego map reaches the GPU. Ground cartography uses an unlit material and tile errors reach the map status UI.
  - Converted authored sRGB model colors to linear Babylon inputs to restore material colors and lighting contrast in previews and the battlefield.
  - Reserved cinematic post processing for High quality. Balanced retains color processing without full screen temporal AA, bloom, ambient occlusion, and reflections.
  - Replaced the misleading disabled buildings startup message with graphics initialization and navigation progress.
  - Added a 10 second WebGPU startup deadline, safe cleanup after partial initialization, and compatibility fallback that also disposes late GPU initialization.
  - Verification: GitHub Pages production export and TypeScript passed. Final suite: 163/173 passing, with the same ten failures present on the unchanged baseline. Local browser preview was inaccessible; no hardware FPS result is claimed.
