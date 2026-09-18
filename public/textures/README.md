# Shared vehicle damage

`vehicle_destroyed_mask.png` is one 1024 x 1024 grayscale texture. ImageGen made the source image. The tile is mirrored at its borders for continuous repetition. Black areas do not add scorch. Light areas add scorch.

The destroyed material projects the texture onto all three local axes. A vehicle does not need special UV coordinates. The texture stays fixed to the surface when the vehicle moves. The material keeps the base color texture and its panel lines. It adds soot, ash, small pits, loss of paint color, and a rough finish. It disables material emission.

Set `vehicle.userData.destroyed = true` to apply the finish. Set it to `false` to restore the normal finish. The flag also applies to attached stores. Vehicle effects marked `userData.vehicleEffect` are excluded. The model viewer has a **Destroyed vehicle** check box. The battlefield applies the finish to destroyed vehicles. Ground vehicle wrecks use a separate instance group, so live vehicles keep their normal materials.

The runtime shares one mask per scene. It caches a separate destroyed material for each base material. It does not change the source material or the source color texture.
