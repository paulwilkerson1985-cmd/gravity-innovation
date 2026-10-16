"""Open a saved kin .blend and time: (a) full render as configured, (b) Freestyle off, (c) 8 spp."""
import bpy, sys, time, os
blend = sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene
out = os.path.splitext(blend)[0]
def t(label, path):
    sc.render.filepath = path; t0 = time.perf_counter(); bpy.ops.render.render(write_still=True); print(f'TIMING {label}: {time.perf_counter()-t0:.1f}s', flush=True)
t('24spp+freestyle', out + '_t_full.png')
sc.render.use_freestyle = False
t('24spp no freestyle', out + '_t_nofs.png')
sc.cycles.samples = 8
t('8spp no freestyle', out + '_t_8.png')
sc.render.use_freestyle = True
t('8spp+freestyle', out + '_t_8fs.png')
