"""Turnaround renderer: fixed ortho scale across views, ground on one line, camera-relative toon light.
Usage inside a script after the creature mesh exists: turnaround(obj, outdir, size=768, spp=12)."""
import bpy, os, math
import numpy as np
from mathutils import Vector
from common import camera_basis, set_light_dir, link, render

VIEWS = [('1_front', 90, 12), ('2_threeq', 35, 12), ('3_side', 0, 12), ('4_back34', -45, 12), ('5_back', -90, 12)]


def world_pts(o):
    dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg); me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    M = np.array(o.matrix_world); ev.to_mesh_clear()
    return co @ M[:3, :3].T + M[:3, 3]


def place_cam(P, yaw, elev, ortho, size, ground_px):
    sc = bpy.context.scene
    d, rot, right, up = camera_basis(yaw, elev)
    R, U = np.array(right), np.array(up)
    xs, ys = P @ R, P @ U
    cam = sc.camera
    if cam is None or cam.type != 'CAMERA':
        cd = bpy.data.cameras.new('cam'); cd.type = 'ORTHO'; cd.clip_end = 100
        cam = link(bpy.data.objects.new('cam', cd)); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    cx = (xs.max() + xs.min()) / 2
    cy = ys.min() - ((1 - ground_px / size) - 0.5) * ortho
    cam.location = right * cx + up * cy + d * 30
    cam.rotation_euler = rot.to_euler()
    set_light_dir((-0.55 * right + 0.72 * up + 0.42 * d).normalized())
    sc.render.resolution_x = sc.render.resolution_y = size


def turnaround(o, outdir, size=768, spp=12, views=VIEWS, fill=0.80, ground_px=690, denoise=True, prefix=''):
    sc = bpy.context.scene
    sc.cycles.samples = spp
    sc.cycles.use_denoising = denoise
    if denoise:
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    P = world_pts(o)
    ortho = 0
    for _, yaw, elev in views:
        d, rot, right, up = camera_basis(yaw, elev)
        xs, ys = P @ np.array(right), P @ np.array(up)
        ortho = max(ortho, (ys.max() - ys.min()) / fill, (xs.max() - xs.min()) / 0.92)
    os.makedirs(outdir, exist_ok=True)
    paths = []
    for nm, yaw, elev in views:
        place_cam(P, yaw, elev, ortho, size, ground_px)
        p = os.path.join(outdir, f'{prefix}{nm}.png'); render(p, nm); paths.append(p)
    return paths, ortho
