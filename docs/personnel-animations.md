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

## Body and equipment mapping

`grid_commander_soldier.glb` supplies the humanoid body for all non-commander
personnel, including unarmed logistics workers. `grid_commander_commander.glb`
is the commander's separate body. The source files use UniRig bone names; the
right wrists are `Bone_022` and `Bone_026`, respectively.

`grid_commander_rifle.glb` is a rifle prop. It ships separately as `rifle.glb`
and is attached to the animated right hand. It never receives humanoid motion.
The animation builder stores a calibrated grip, 0.82 m length, and orientation
in each sidecar. Both engines consume the same values. Named Mixamo RightHand
bones are supported as a fallback. Missing hand bones report an attachment
failure instead of substituting a weapon for the soldier.

Soldier and logistics aliases use the same humanoid mesh and the same full
skeletal retargeting. There is no rigid infantry fallback. The browser and
Godot model previews use the same attachment as the game. Logistics and pilots
remain unarmed. The commander retains the original full-resolution texture.

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


