"""Q10: gmsh meshes for the FEniCS (SELCIE-toolchain) cross-check of the symmetron benchmark.
Axisymmetric half-plane (r, z) in units of 1/mu: chamber r <= R, |z| <= L; test sphere a1 at z = 0,
source sphere a2 at z = -D (both removed from the domain: Dirichlet bodies); optional full-width
membrane line at z = zm embedded in the mesh (interior facets, Robin sheet).
Usage: python mesh_q10.py <out_basename> <hmin> <hmax> [source 0/1] [membrane_z or none]"""
import sys, numpy as np, gmsh, meshio

def build(base, hmin, hmax, source=True, zm=None, R=5.0, L=5.0, a1=0.3, a2=0.6, D=1.4, grow=0.25):
    gmsh.initialize(); gmsh.option.setNumber("General.Terminal", 0)
    gmsh.model.add("q10")
    occ = gmsh.model.occ
    rect = occ.addRectangle(0, -L, 0, R, 2 * L)
    holes = [(2, occ.addDisk(0, 0, 0, a1, a1))]
    if source:
        holes.append((2, occ.addDisk(0, -D, 0, a2, a2)))
    out, _ = occ.cut([(2, rect)], holes)
    occ.synchronize()
    surf = [t for d, t in out if d == 2]
    if zm is not None:
        p0 = occ.addPoint(0, zm, 0); p1 = occ.addPoint(R, zm, 0)
        ln = occ.addLine(p0, p1)
        occ.synchronize()
        fr, fm = occ.fragment([(2, s) for s in surf], [(1, ln)])
        occ.synchronize()
        surf = [t for d, t in gmsh.model.getEntities(2)]
    # classify boundary curves
    curves = gmsh.model.getEntities(1)
    wall, axis, sph1, sph2, memb = [], [], [], [], []
    for d, c in curves:
        xmin, ymin, _, xmax, ymax, _ = gmsh.model.getBoundingBox(1, c)
        cx, cy = 0.5 * (xmin + xmax), 0.5 * (ymin + ymax)
        tol = 1e-5   # OCC bounding boxes are padded (~1e-7)
        if zm is not None and abs(ymin - zm) < tol and abs(ymax - zm) < tol:
            memb.append(c)
        elif xmax < tol:
            axis.append(c)
        elif abs(xmin - R) < tol or (abs(ymin + L) < tol and abs(ymax + L) < tol) or (abs(ymin - L) < tol and abs(ymax - L) < tol):
            wall.append(c)
        elif ymax <= a1 + tol and ymin >= -a1 - tol and xmax <= a1 + tol:
            sph1.append(c)
        else:
            sph2.append(c)
    print("curves: wall", wall, "axis", axis, "sph1", sph1, "sph2", sph2, "memb", memb)
    gmsh.model.addPhysicalGroup(2, surf, 1)
    gmsh.model.addPhysicalGroup(1, wall, 1)
    gmsh.model.addPhysicalGroup(1, axis, 2)
    gmsh.model.addPhysicalGroup(1, sph1, 3)
    if sph2: gmsh.model.addPhysicalGroup(1, sph2, 4)
    if memb: gmsh.model.addPhysicalGroup(1, memb, 5)
    # size field: hmin at the spheres (and membrane), growing linearly to hmax
    f = gmsh.model.mesh.field
    fd = f.add("Distance"); f.setNumbers(fd, "CurvesList", sph1 + sph2); f.setNumber(fd, "Sampling", 400)
    ft = f.add("Threshold"); f.setNumber(ft, "InField", fd)
    f.setNumber(ft, "SizeMin", hmin); f.setNumber(ft, "SizeMax", hmax)
    f.setNumber(ft, "DistMin", 0.0); f.setNumber(ft, "DistMax", (hmax - hmin) / grow)
    fields = [ft]
    if memb:
        fm2 = f.add("Distance"); f.setNumbers(fm2, "CurvesList", memb); f.setNumber(fm2, "Sampling", 400)
        ft2 = f.add("Threshold"); f.setNumber(ft2, "InField", fm2)
        f.setNumber(ft2, "SizeMin", 2 * hmin); f.setNumber(ft2, "SizeMax", hmax)
        f.setNumber(ft2, "DistMin", 0.0); f.setNumber(ft2, "DistMax", (hmax - 2 * hmin) / grow)
        fields.append(ft2)
    fmn = f.add("Min"); f.setNumbers(fmn, "FieldsList", fields); f.setAsBackgroundMesh(fmn)
    for k in ["Mesh.MeshSizeExtendFromBoundary", "Mesh.MeshSizeFromPoints", "Mesh.MeshSizeFromCurvature"]:
        gmsh.option.setNumber(k, 0)
    gmsh.option.setNumber("Mesh.Algorithm", 6)
    gmsh.model.mesh.generate(2)
    gmsh.write(base + ".msh")
    gmsh.finalize()
    m = meshio.read(base + ".msh")
    pts = m.points[:, :2]
    tri = m.get_cells_type("triangle"); trid = m.get_cell_data("gmsh:physical", "triangle")
    lin = m.get_cells_type("line"); lind = m.get_cell_data("gmsh:physical", "line")
    meshio.write(base + "_tri.xdmf", meshio.Mesh(pts, [("triangle", tri)], cell_data={"tag": [trid]}))
    meshio.write(base + "_lin.xdmf", meshio.Mesh(pts, [("line", lin)], cell_data={"tag": [lind]}))
    return len(tri)

if __name__ == "__main__":
    base, hmin, hmax = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    src = bool(int(sys.argv[4])) if len(sys.argv) > 4 else True
    zm = None if len(sys.argv) <= 5 or sys.argv[5] == "none" else float(sys.argv[5])
    print(base, "triangles:", build(base, hmin, hmax, src, zm))
