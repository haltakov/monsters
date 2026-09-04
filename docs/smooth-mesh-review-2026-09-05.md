# Smooth-mesh trait review

## Scope and approach

This pass reviews the DNA-to-visual mapping, not simulation balance. The existing
DNA schema, save format, size/build multipliers, ownership, and server physics are
unchanged. Existing monsters pick up the revised appearance without a migration.
The renderer remains deterministic: no random numbers, clock values, or instance
IDs are used to construct a phenotype. Time only drives its pose.

The useful direction is a hybrid procedural model:

- An implicit, smoothed torso/head/limb surface for organic blending.
- Closed, tapered analytic sweeps for small features that voxels erase.
- Attachments projected onto the **finished** skin, after smoothing.
- Rest-space fragment-shader patterns, independent of triangle density.

This retains the DNA variability and the existing skeleton. It avoids making the
entire voxel volume larger merely to preserve a thin tail or a sharp claw. The
body, tails and claws share a skinned draw call. Small rigid/hinged accessories
remain separate meshes. This is not a claim of one Boolean-unioned manifold:
closed, overlapping shells deliberately form some joins.

## Findings and changes

| Area                | Problem found                                                                                                                                                   | Change                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Body family         | Most profiles used the same spherical strengths; their nominal width/height/length mainly moved satellites around. Distinct bodies converged on a similar bulb. | Bounded anisotropic torso fields honor all three profile axes. Bean, long, upright, low slug and aquatic silhouettes separate more clearly.                                          |
| Broad skin shading  | Linear field truncation and normals averaged across irregular triangles produced contour-like shading on broad surfaces.                                        | C1 field falloff plus trilinearly sampled field-gradient normals for the organic body. Analytic appendages keep their own normals.                                                   |
| Leg shape           | Repeated spherical fields overwhelmed the small foot ellipsoids, obscuring the selected shape.                                                                  | Bounded leg shafts expose feet; thin stilts, wider paws, bent springy legs and flat flippers read differently.                                                                       |
| Hooves              | Smoothing filled the split between the hoof lobes.                                                                                                              | A localized, post-smoothing cloven cut preserves the front split.                                                                                                                    |
| Claws and gait      | Thin toe tips were lost to the voxel grid. The skin-weight distance cutoff left extended foot vertices with the root bone.                                      | Closed analytic claws are merged into the skinned mesh. The foot weighting envelope now includes long toes and reaches full leg influence at the foot.                               |
| Tails               | A second small marching-cubes grid blurred curls/forks, clipped or rounded fins, and made tufts/clubs look similar.                                             | Skin-fitted tail roots and deterministic tapered sweeps: a readable open curl, fork, elongated whip, club, pointed tuft and flattened caudal-fin lobes. No separate tail voxel grid. |
| Horns               | Fixed profile coordinates and a universal inset did not match the new skin. Some horns sank into it or floated.                                                 | Independent skin queries for each root, surface-aligned tapered horns, branching antlers and curled ram horns.                                                                       |
| Ears                | Guessed side anchors and oversized socket spheres produced disconnected-looking or buried ears.                                                                 | Fitted roots without extra socket balls, distinct upright/pointed/floppy silhouettes, and inner panels for round/fan ears.                                                           |
| Eyes                | A single flat eye plane did not follow the shape of the face.                                                                                                   | Each eye is fitted independently to the front surface and slightly embedded. Eye counts are preserved.                                                                               |
| Mouths              | The smile torus lay on the wrong plane; mouth offsets could float forward of the face; grin teeth were much too far in front of the mouth.                      | A smile curve follows the actual skin. Other mouths are inset against the skin, and grin teeth sit at the lip surface.                                                               |
| Wings/fins          | Similar flattened oval paddles with guessed roots.                                                                                                              | Shared skin-fitted hinges, a larger feathered wing fan, and a smaller fin silhouette. Existing wing animation refs still drive the hinge.                                            |
| Shell/plates/spines | A rear sphere or evenly placed spikes often disappeared into the body.                                                                                          | Fitted dorsal scutes, broad plates and narrow spines sample the back separately at each root.                                                                                        |
| Mane/antennae       | Fixed rings and stalk offsets could miss the head or extend below the neckline.                                                                                 | A fitted upper/side collar and curved antenna stalks with joined tips.                                                                                                               |
| Gills               | Tiny capsules at estimated side positions could read as external colored objects.                                                                               | Thin, tapered dark grooves follow sampled side-skin points. Lungs add no geometry.                                                                                                   |
| Patterns            | Vertex colors made small patterns depend on LOD, muddying freckles/scales and triangulating stripe edges. “Belly” was mainly a front-facing patch.              | Antialiased rest-space shader patterns: spots, stripes, patches, scalloped scales, underside/chest belly, fine freckles and a dorsal saddle. Legacy rings still render.              |
| Geometry cache      | Color/pattern choices unnecessarily duplicated identical topology.                                                                                              | Geometry cache keys contain shape genes only. Material state remains per rig, including its pigment uniforms.                                                                        |
| QA gallery          | Screen labels were horizontally reversed relative to the negative-Z camera. Its random adaptation step skipped shell and spines altogether.                     | Correct label mapping, complete adaptation coverage for the fixed seed, and an explicit coverage regression test.                                                                    |

Diet and social behavior intentionally add no decorative symbols. Breathing only
adds gill grooves where applicable. A zero-leg animal has no foot phenotype,
although the stored leg-shape gene remains available to offspring. Size and build
continue to scale the entire creature, including every fitted attachment.

## Verification

- Inspected the 100-specimen gallery, plus controlled single-gene comparisons.
- Added comparisons for bodies, leg count, feet, tails, horns, ears, adaptations,
  patterns, mouths, eye count, builds, sizes and breathing at `/game/audit/`.
- Added close-up inspection with orbit/zoom, walking poses, and hero/remote LOD
  toggles. These use the same `MonsterVisual` as the game and archive portraits.
- Automated 100-DNA × 2-LOD geometry checks: finite positions/normals, normalized
  skin weights, valid bone indices, valid anchors, and no open mesh edges.
- Closed-sweep/winding checks and deterministic tail geometry checks, including
  minimum visible fork width and fin height.
- Regression coverage for topology sharing, shader injection, distinct foot
  geometries, stilt length, and random adaptation coverage.
- Frontend lint, TypeScript checks, tests and a production static-export build.

The geometry checks are not a substitute for visual review: a closed mesh can
still have an unattractive silhouette. The trait matrix and close-up inspector
are deliberately retained for the next art pass.

## Remaining limitations / sensible next steps

1. This is a procedural stylized renderer, not an artist-authored anatomical
   rig. Eight/ten-leg upright combinations intentionally look unusual. Pairwise
   overlap between two large selected accessories (for example antlers and long
   ears) is not globally solved by the skin-fitting system.
2. Feet use the existing simple swing rig rather than terrain-aware foot IK.
   Full contact-aware knees/ankles would be a separate animation improvement.
3. Shader patterns make pigment stable at different LODs, but do not create
   geometric scales or fur. Similar primary/accent colors still give low-contrast
   patterns by design.
4. No iPhone GPU benchmark was performed in this pass. Field resolutions have
   not been increased, tail voxels were removed and topology sharing improved,
   but feather/scute detail and fragment patterns should still be profiled on
   the target device before increasing visible population/detail further.
5. Automated screenshot comparisons in CI and worker-based mesh generation would
   be useful follow-ups. Neither is required to adopt this visual update.
