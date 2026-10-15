# Blender path A for a kin (pointer to orbkin-blender-forge)

Use it only after the silhouette sheet shows that the kit's primitives (orbs, tubes, slabs,
lathes, blades) cannot make the form: one continuous soft volume with fillets at every joint,
long S-curved necks or tails with smooth taper, swept horns and flames, organic lumps. Code kin
beat Blender SDF kin 6/6 in frozen-clock blind pairs at 1x and 2x density, so the default is
always the code builder; path A is an exception that must win the in-game A/B. In path A the
Blender body (metaballs or GN SDF -> voxel remesh -> QuadriFlow/decimate, vertex `COLOR_0`,
smooth normals, ONE mesh) replaces only the geometry: it ships the same per-vertex rig as the
kit (`_RIGP` pivot xyz, `_RIGK` kind, `_RIGB` amp/phase/speed, exported with
`export_attributes=True`, read back by `GLTFLoader` as `_rigp/_rigk/_rigb` and remapped to
`rigA`/`rigB`), so `CreatureView`, the rig shader, blinks, lunges and the `SpriteBaker` stay
unchanged. Eyes are separate crisp parts placed at `surface + 0.3 * size` along the normal (0.08
sank under the remesh), still tagged with the blink rig. Budgets incl. eyes: stage 1 <= 2,500
tris, stage 2 <= 3,500, stage 3 / rare <= 4,500; the unit test for code kin stays at 2,500.

Hand the build to orbkin-blender-forge by name with the brief, the chosen concept, the
silhouette sheet and the texel facts from `read_sheet.py`; it owns bpy, bakes, export and
packing (Blender 5.2 LTS through `$ORBKIN_BPY`, never an ad-hoc venv path). When the GLB comes
back: run `read_sheet.py` and `lineup.py` on it like any kin, then the in-game pairwise gate
(desk crop + phone full) against the code builder of the same species; keep whichever wins in
both orders, and `ip_check` both the lineup and the battle crop again (the bake can create a
franchise read the model did not have: Maelstrode went from 5-6 to 7-9).
