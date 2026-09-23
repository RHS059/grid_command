# Personnel animation source and rig contract

The commander and logistics worker use the supplied GLBs with their original
skins and textures. Separate JSON clips bind to each model's actual UniRig
hierarchy. Their bone numbers differ. They are not Mixamo-named skeletons.

The initial motion source is the repository's existing authored soldier GLB.
Its 13 retained clips cover idle, ready/aim, walk, fire, crouch, prone, cover,
cover fire, peek, throw, drag, downed, and dead. The extracted source bundle
records the original GLB hash. This release does **not** claim to include
downloaded Mixamo motion.

`tools/build_personnel_animations.py` bakes each compatible model's tracks at
24 Hz. It converts source global rotations into the target's local axes,
corrects the supplied A-pose arms against the source rest pose, preserves bone
lengths, and transfers hip height and fall motion. It never rewrites model GLBs.
The browser and Godot load identical animation JSON. Runtime clip state follows
movement, engagement, shots, downed state, and death. Native Model Preview lists
the clips. Non-looping death clips hold their last pose.

## Armed infantry rig limitation

The supplied `grid_commander_rifle.glb` contains 14 joints, no anatomical
hip/knee/ankle chains, and a 3.76 m-wide mesh at 1.7 m height. Applying humanoid
leg motion to these joints would deform unrelated geometry. Its original skin
is preserved. The bundle explicitly uses `rigid-fallback`: a small movement
bob, shot motion, and whole-model fall. These are not a skeletal walk cycle.
The infantry model needs a corrected humanoid skin before true leg, arm, and
hand animation can be enabled. Commander and logistics use skeletal animation.

## Replacing the motion source with Mixamo

Adobe's Mixamo downloads require a signed-in Adobe ID. No signed-in download
session or animation files were supplied for this task. Obtain the required
clips through the project's authorized account, record their exact names and
source, retarget onto each actual hierarchy, and replace the sidecar bundles.
Keep the runtime state names above. Do not rename UniRig bones and assume this
changes their bind pose. Do not relabel the repository's authored clips as
Mixamo assets.

References: [Mixamo](https://www.mixamo.com/),
[Adobe's download instructions](https://helpx.adobe.com/creative-cloud/help/mixamo-rigging-animation.html),
[Adobe's Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html).

