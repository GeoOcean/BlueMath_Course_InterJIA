"""
Export the data behind the interactive slides (slides/data/).

The slides run in the browser, so everything they show is either a small
JavaScript re-implementation (LHS, MDA, RBF, copulas...) or data exported here
from the course models in notebooks/pretrained/ and notebooks/data/.

Run it inside the course container, from the repository root:

    python slides/scripts/export_data.py          # the models in notebooks/pretrained/
    python slides/scripts/export_data.py --own    # yours, after running notebooks 01-04

With --own it reads the models of notebooks 01-02 (notebooks/export/), the
SFINCS runs (notebooks/cases/, or pretrained/ if you did not run SFINCS) and
the emulated climate of notebook 03 (notebooks/outputs/).

It checks that the browser maths (RBF + PCA + flood depth) reproduces
bluemath-tk before writing anything.
"""

import argparse
import json
import logging
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

warnings.filterwarnings("ignore")
logging.disable(logging.WARNING)

ROOT = Path(__file__).resolve().parents[2]
NB = ROOT / "notebooks"
PRE = NB / "pretrained"
DATA = NB / "data"
OUT = ROOT / "slides" / "data"
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(NB))  # utils/

from bluemath_tk.core.io import load_model  # noqa: E402
from utils.postprocessing import water_level_cases  # noqa: E402
from utils.reconstruction import pcs_to_water_level  # noqa: E402

parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
parser.add_argument("--own", action="store_true",
                    help="export your results of notebooks 01-04 instead of pretrained/")
OWN = parser.parse_args().own

# Where the models and results come from (the DEM is always the pretrained one)
MODELS = NB / "export" if OWN else PRE
SIMULATED = NB / "outputs" / "simulated_precip_ss_q.nc" if OWN else PRE / "simulated_precip_ss_q.nc"
for f in ["pca_model.pkl", "rbf_model.pkl", "mda_centroids.pkl", "lhs_dataset.pkl"]:
    if not (MODELS / f).exists():
        sys.exit(f"Missing {(MODELS / f).relative_to(ROOT)}: run notebooks 01 and 02 first.")
if not SIMULATED.exists():
    sys.exit(f"Missing {SIMULATED.relative_to(ROOT)}: run notebook 03 first.")

VARIABLES = ["TWL", "Q", "precip_acum"]
POINTS = {
    "Asón valley": (465050.0, 4799950.0),
    "Western marshes": (460250.0, 4807750.0),
}
NODATA_I16 = -32768
NODATA_U16 = 65535


def rnd(a, n=3):
    """Round an array for JSON (NaN -> None)."""
    a = np.round(np.asarray(a, dtype=float), n)
    return [None if np.isnan(v) else (int(v) if n == 0 else float(v)) for v in a.ravel()]


def write_json(name, obj):
    path = OUT / name
    path.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))
    print(f"  {name:28s} {path.stat().st_size / 1024:8.1f} kB")


def write_bin(name, arr):
    path = OUT / name
    np.ascontiguousarray(arr).astype(arr.dtype.newbyteorder("<")).tofile(path)
    print(f"  {name:28s} {path.stat().st_size / 1024:8.1f} kB  {arr.dtype} {arr.shape}")


def to_cm(a):
    """float metres -> int16 centimetres (NaN -> nodata)."""
    out = np.full(a.shape, NODATA_I16, dtype=np.int16)
    ok = np.isfinite(a)
    out[ok] = np.clip(np.round(a[ok] * 100), -32767, 32767)
    return out


t_start = time.time()
print(f"Loading models from {MODELS.relative_to(ROOT)}/")
pca = load_model(MODELS / "pca_model.pkl")
rbf = load_model(MODELS / "rbf_model.pkl")
mda_centroids = pd.read_pickle(MODELS / "mda_centroids.pkl")[VARIABLES]
n_cases = len(mda_centroids)
if OWN and all((NB / "cases" / f"{i:04d}" / "sfincs_map.nc").exists() for i in range(n_cases)):
    print("SFINCS water levels from notebooks/cases/")
    water_levels = water_level_cases(cases_dir=NB / "cases", n_cases=n_cases)["zs"]
else:
    if OWN:
        print("No complete SFINCS runs in notebooks/cases/: using pretrained/sfincs_water_levels.nc")
    water_levels = xr.open_dataset(PRE / "sfincs_water_levels.nc")["zs"]
dem_da = xr.open_dataarray(PRE / "dem_santona_utm.tif").squeeze(drop=True)
df_hist = xr.open_dataset(DATA / "data_hycoffee_sfincs.nc").to_dataframe()
pc_names = list(pca.pcs_df.columns)
n_pcs = len(pc_names)

# ---------------------------------------------------------------------------
# 1. Grids: SFINCS 100 m grid (north-up) and the 20 m DEM
# ---------------------------------------------------------------------------
print("Grids")
# North-up: row 0 = northernmost row
wl = water_levels.sortby("y", ascending=False).sortby("x")
gx, gy = wl.x.values, wl.y.values
ny, nx = len(gy), len(gx)
active = wl.isel(case_num=0).notnull().values  # (ny, nx)
cell_of = np.full((ny, nx), -1, dtype=np.int64)
cell_of[active] = np.arange(active.sum())
n_cells = int(active.sum())
cell_rows, cell_cols = np.nonzero(active)


def grid_vec(da):
    """(y, x) DataArray on the SFINCS grid -> vector of the active cells."""
    v = da.sortby("y", ascending=False).sortby("x").values
    return v[active]


dem_da = dem_da.sortby("y", ascending=False).sortby("x")
dx_s, dy_s = float(gx[1] - gx[0]), float(gy[0] - gy[1])
# Nearest SFINCS cell of every DEM pixel (= rasterio "nearest" reprojection)
col = np.rint((dem_da.x.values - gx[0]) / dx_s).astype(int)
row = np.rint((gy[0] - dem_da.y.values) / dy_s).astype(int)
R, C = np.meshgrid(row, col, indexing="ij")
inside = (R >= 0) & (R < ny) & (C >= 0) & (C < nx)
idx_full = np.full(R.shape, -1, dtype=np.int64)
idx_full[inside] = cell_of[R[inside], C[inside]]
# Crop to the active pixels, as water_level_to_depth does
rows_any = (idx_full >= 0).any(axis=1)
cols_any = (idx_full >= 0).any(axis=0)
dem_crop = dem_da.isel(y=np.nonzero(rows_any)[0], x=np.nonzero(cols_any)[0])
idx = idx_full[np.ix_(rows_any, cols_any)]
dem = dem_crop.values.astype("float64")
H, W = dem.shape


def depth_js(zs_cells):
    """Exactly what the browser does: depth = max(zs[cell] - DEM, 0)."""
    z = np.where(idx >= 0, zs_cells[np.clip(idx, 0, None)], np.nan)
    d = np.where(np.isfinite(dem), np.maximum(z - dem, 0.0), 0.0)
    return np.where(idx >= 0, d, np.nan)


# Check against the course post-processing (hydromt-sfincs downscaling)
from utils.postprocessing import water_level_to_depth  # noqa: E402

dep_hr = xr.open_dataset(PRE / "dem_santona_utm.tif")
check_cases = [0, 1, 37]
ref = water_level_to_depth(water_levels.isel(case_num=check_cases), dep_hr)
ref = ref.sortby("y", ascending=False).sortby("x")
assert ref.shape[1:] == (H, W), f"DEM crop {(H, W)} != {ref.shape[1:]}"
for k, case in enumerate(check_cases):
    mine = depth_js(grid_vec(water_levels.isel(case_num=case)))
    theirs = ref.isel(case_num=k).values
    both = np.isfinite(mine) & np.isfinite(theirs)
    assert (np.isfinite(mine) == np.isfinite(theirs)).mean() > 0.999
    err = np.abs(mine[both] - theirs[both]).max()
    assert err < 1e-3, f"depth mismatch {err}"
print(f"  depth on the DEM reproduces water_level_to_depth ({H}x{W} px)")

write_bin("dem_cm.bin", to_cm(dem))
idx_u16 = np.where(idx >= 0, idx, NODATA_U16).astype(np.uint16)
write_bin("dem_cell.bin", idx_u16)

# ---------------------------------------------------------------------------
# 2. PCA: mean + EOFs on the active cells (linear, so from inverse_transform)
# ---------------------------------------------------------------------------
print("PCA")


def recon(pcs_matrix):
    df = pd.DataFrame(pcs_matrix, columns=pc_names)
    zs = pcs_to_water_level(pca, df)
    return np.stack([grid_vec(zs.isel(case_num=i)) for i in range(len(df))])


basis = recon(np.vstack([np.zeros(n_pcs), np.eye(n_pcs)]))
mean, eofs = basis[0], basis[1:] - basis[0]
pcs_cases = pca.pcs_df[pc_names].values
# check: reconstruction == bluemath inverse_transform
assert np.allclose(mean + pcs_cases[:5] @ eofs, recon(pcs_cases[:5]), atol=1e-3)
write_bin("pca_basis.bin", np.vstack([mean, eofs]).astype(np.float32))

# ---------------------------------------------------------------------------
# 3. RBF: coefficients of each PC (gaussian kernel, min-max normalisation)
# ---------------------------------------------------------------------------
print("RBF")
assert rbf.kernel == "gaussian"
xs = rbf.normalized_subset_data[VARIABLES].values  # (100, 3)
rbf_pcs = []
for pc in pc_names:
    sigma = float(rbf.opt_sigmas[pc])
    coeff, _ = rbf._calc_rbf_coeff(
        sigma=sigma, x=xs.T, y=rbf.normalized_target_data[pc].values
    )
    rbf_pcs.append({"sigma": sigma, "coeff": coeff.ravel().tolist(),
                    "scale": list(map(float, rbf.target_scale_factor[pc]))})
in_scale = {v: list(map(float, rbf.subset_scale_factor[v])) for v in VARIABLES}


def rbf_np(X):
    """The browser version of rbf.predict."""
    Xn = np.column_stack([(X[:, j] - in_scale[v][0]) / (in_scale[v][1] - in_scale[v][0])
                          for j, v in enumerate(VARIABLES)])
    r2 = ((Xn[:, None, :] - xs[None]) ** 2).sum(-1)
    out = []
    for p in rbf_pcs:
        c = np.array(p["coeff"])
        n = len(xs)
        y = np.exp(-0.5 * r2 / p["sigma"] ** 2) @ c[:n] + c[n] + Xn @ c[n + 1:]
        out.append(y * (p["scale"][1] - p["scale"][0]) + p["scale"][0])
    return np.column_stack(out)


rng = np.random.default_rng(1)
lo = np.array([in_scale[v][0] for v in VARIABLES])
hi = np.array([in_scale[v][1] for v in VARIABLES])
X_test = lo + (hi - lo) * rng.random((50, 3))
ref_pcs = rbf.predict(pd.DataFrame(X_test, columns=VARIABLES))[pc_names].values
assert np.allclose(rbf_np(X_test), ref_pcs, atol=1e-6 * np.abs(ref_pcs).max())
print("  numpy/JS RBF reproduces rbf.predict")
tests = X_test[:3]
write_json("surrogate.json", {
    "variables": VARIABLES,
    "inputScale": in_scale,
    "train": rnd(xs, 6),
    "trainPhysical": rnd(mda_centroids[VARIABLES].values, 4),
    "pcs": rbf_pcs,
    "pcNames": pc_names,
    "explained": rnd(pca.explained_variance_ratio, 6),
    "pcsCases": rnd(pcs_cases, 4),
    "tests": [{"x": rnd(t, 6), "zsCell0": float((mean + rbf_np(t[None]) @ eofs)[0, 0])}
              for t in tests],
})

# ---------------------------------------------------------------------------
# 4. Grid metadata, points and SFINCS truth of six contrasting cases
# ---------------------------------------------------------------------------
print("Domain and SFINCS cases")
situations = {"All low": [0, 0, 0], "Sea": [1, 0, 0], "River": [0, 1, 0],
              "Rain": [0, 0, 1], "Sea + river": [1, 1, 0], "All high": [1, 1, 1]}
norm = (mda_centroids - mda_centroids.min()) / (mda_centroids.max() - mda_centroids.min())
show_cases = [int(((norm - t) ** 2).sum(axis=1).idxmin()) for t in situations.values()]
zs_cases = np.stack([grid_vec(water_levels.isel(case_num=c)) for c in show_cases])
write_bin("sfincs_cases_cm.bin", to_cm(zs_cases))


def nearest_cell(x, y):
    return int(cell_of[int(np.argmin(np.abs(gy - y))), int(np.argmin(np.abs(gx - x)))])


write_json("domain.json", {
    "grid": {"x0": float(gx[0]), "y0": float(gy[0]), "dx": dx_s, "dy": dy_s,
             "nx": nx, "ny": ny, "nCells": n_cells,
             "cellRow": cell_rows.tolist(), "cellCol": cell_cols.tolist()},
    "dem": {"x0": float(dem_crop.x[0]), "y0": float(dem_crop.y[0]),
            "dx": float(dem_crop.x[1] - dem_crop.x[0]),
            "dy": float(dem_crop.y[0] - dem_crop.y[1]), "w": W, "h": H,
            "nodata": NODATA_I16, "cellNodata": NODATA_U16},
    "points": {k: {"x": v[0], "y": v[1], "cell": nearest_cell(*v)} for k, v in POINTS.items()},
    "mouth": [[463527.0, 4809150.0], [463527.0, 4810000.0]],
    "river": [464870.0, 4798000.0],
    "boundary": [463527.0, 4809480.0],
    "cases": [{"name": n, "case": c, **{v: round(float(mda_centroids[v].iloc[c]), 3)
                                         for v in VARIABLES}}
              for n, c in zip(situations, show_cases)],
    "epsg": 25830,
})

# ---------------------------------------------------------------------------
# 5. Historical forcing, LHS + hull + MDA, unit hydrograph
# ---------------------------------------------------------------------------
print("Historical data and sampling")
dwt_model = load_model(DATA / "dwt_model.pkl")
bmus = dwt_model.kma_bmus["kma_bmus"].copy()
bmus.index = pd.to_datetime(bmus.index).normalize()
tide = df_hist["waterlevel"] - df_hist["surge"]
ntr_mean = float((df_hist["TWL"] - tide).mean())
assert (np.diff(df_hist.index.values).astype("timedelta64[D]").astype(int) == 1).all()
write_json("history.json", {
    "start": str(df_hist.index[0].date()),
    "TWL": rnd(df_hist["TWL"], 3), "tide": rnd(tide, 3),
    "surge": rnd(df_hist["surge"], 3), "setup": rnd(df_hist["setup"], 3),
    "Q": rnd(df_hist["Q"], 1), "precip": rnd(df_hist["precip_acum"], 1),
    "dwt": [int(v) if np.isfinite(v) else None
            for v in bmus.reindex(df_hist.index).values.astype(float)],
    "ntrMean": round(ntr_mean, 4),
})

from bluemath_tk.datamining.lhs import LHS  # noqa: E402
from scipy.spatial import ConvexHull  # noqa: E402
from utils.sampling import inside_convex_hull  # noqa: E402

bounds = {v: (df_hist[v].min(), df_hist[v].max()) for v in VARIABLES}
lhs_raw = LHS(num_dimensions=3, seed=1).generate(
    dimensions_names=VARIABLES, lower_bounds=[b[0] for b in bounds.values()],
    upper_bounds=[b[1] for b in bounds.values()], num_samples=20_000)
inside = inside_convex_hull(lhs_raw, df_hist, columns=["Q", "precip_acum"])
assert inside.sum() == len(pd.read_pickle(MODELS / "lhs_dataset.pkl"))
sub = np.random.default_rng(0).choice(len(lhs_raw), 3000, replace=False)
hull = ConvexHull(df_hist[["Q", "precip_acum"]].values)
hv = df_hist[["Q", "precip_acum"]].values[hull.vertices]
uh = pd.read_excel(DATA / "UH_SCS.xlsx", header=None, names=["t/tp", "q/qp"])
write_json("sampling.json", {
    "bounds": {v: [float(b[0]), float(b[1])] for v, b in bounds.items()},
    "nRaw": len(lhs_raw), "nInside": int(inside.sum()),
    "lhs": {v: rnd(lhs_raw[v].values[sub], 3) for v in VARIABLES},
    "inside": inside[sub].astype(int).tolist(),
    "hull": {"Q": rnd(hv[:, 0], 2), "precip_acum": rnd(hv[:, 1], 2)},
    "mda": {v: rnd(mda_centroids[v].values, 3) for v in VARIABLES},
    "uh": {"t": rnd(uh["t/tp"], 4), "q": rnd(uh["q/qp"], 4)},
    "ntrMean": round(ntr_mean, 4),
})

# ---------------------------------------------------------------------------
# 6. k-fold cross-validation of the RBF (as in notebook 02)
# ---------------------------------------------------------------------------
print("k-fold cross-validation (a minute or two)")
from bluemath_tk.interpolation.rbf import RBF  # noqa: E402
from sklearn.model_selection import KFold  # noqa: E402

df_inputs = mda_centroids[VARIABLES]
df_pcs = pca.pcs_df
depth_sfincs = np.stack([depth_js(grid_vec(water_levels.isel(case_num=i)))
                         for i in range(len(pcs_cases))])
valid = np.isfinite(depth_sfincs[0])
kfold = KFold(n_splits=5, shuffle=True, random_state=0)
folds = np.zeros(len(df_inputs), dtype=int)
for f, (_, test) in enumerate(kfold.split(df_inputs)):
    folds[test] = f
n_train_list = [10, 20, 30, 40, 50, 60, 70, 80]
rmse = {}
for n_train in n_train_list:
    pcs_cv = np.zeros_like(pcs_cases)
    for train, test in kfold.split(df_inputs):
        train = np.sort(train)[:n_train]
        m = RBF()
        m.fit(subset_data=df_inputs.iloc[train], target_data=df_pcs.iloc[train])
        pcs_cv[test] = m.predict(df_inputs.iloc[test])[pc_names].values
    err = []
    for i in range(len(df_inputs)):
        d = depth_js(mean + pcs_cv[i] @ eofs)
        err.append(np.sqrt(np.mean((d[valid] - depth_sfincs[i][valid]) ** 2)))
    rmse[n_train] = np.array(err)
    print(f"  N = {n_train}: mean RMSE {rmse[n_train].mean():.3f} m")
write_json("kfold.json", {
    "nTrain": n_train_list, "folds": folds.tolist(),
    "mean": rnd([rmse[n].mean() for n in n_train_list], 4),
    "p05": rnd([np.quantile(rmse[n], 0.05) for n in n_train_list], 4),
    "p95": rnd([np.quantile(rmse[n], 0.95) for n in n_train_list], 4),
    "rmse80": rnd(rmse[80], 4),
})

# ---------------------------------------------------------------------------
# 7. Weather types, copulas and the emulated climate (notebook 03)
# ---------------------------------------------------------------------------
print("Weather types and emulator")
slp = dwt_model._data["mslp"]
kb = dwt_model._data["kma_bmus"]
n_dwt = int(dwt_model.num_clusters)
labels = list(range(1, n_dwt + 1))
assert set(np.unique(kb.values)) <= set(labels)
slp_mean = slp.mean("time")
patterns = np.stack([(slp.where(kb == k, drop=True).mean("time") - slp_mean).values
                     for k in labels])
freq = np.array([(kb.values == k).mean() for k in labels])

forcing = xr.open_dataset(DATA / "data_hycoffee_sfincs.nc")
forcing["surge_setup"] = forcing["surge"] + forcing["setup"]
pred = (forcing[["precip_acum", "surge_setup", "Q"]].to_dataframe()
        .rename(columns={"precip_acum": "precip", "surge_setup": "ss", "Q": "q"})
        .join(bmus.rename("bmus"), how="inner").dropna())
pred["bmus"] = pred["bmus"].astype(int)
from scipy.special import ndtri  # noqa: E402
from statsmodels.distributions.empirical_distribution import ECDF  # noqa: E402

pairs = [("precip", "ss"), ("precip", "q"), ("ss", "q")]
rho = np.full((n_dwt, len(pairs)), np.nan)
stats = []
for i, k in enumerate(labels):
    obs = pred.loc[pred["bmus"] == k, ["precip", "ss", "q"]]
    stats.append([len(obs)] + [float(obs[v].mean()) if len(obs) else np.nan
                               for v in ["precip", "ss", "q"]])
    if len(obs) < 5:
        continue
    z = pd.DataFrame({v: ndtri(np.clip(ECDF(obs[v])(obs[v]) * len(obs) / (len(obs) + 1),
                                       1e-6, 1 - 1e-6)) for v in obs})
    for j, (a, b) in enumerate(pairs):
        rho[i, j] = z[a].corr(z[b])

coast = []
try:
    import cartopy.feature as cfeature
    from shapely.geometry import box

    bb = box(-14.5, 33, 7.5, 54.5)
    for geom in cfeature.NaturalEarthFeature("physical", "coastline", "50m").geometries():
        g = geom.intersection(bb)
        for line in getattr(g, "geoms", [g]):
            if line.is_empty or line.length < 0.3:
                continue
            c = np.asarray(line.simplify(0.05).coords)
            coast.append(rnd(c.ravel(), 2))
except Exception as e:  # no internet: the maps are drawn without coastline
    print(f"  (no coastline: {e})")

simulated = xr.open_dataset(SIMULATED)
probs = np.linspace(0.005, 0.995, 100)
qq = {v: {"obs": rnd(np.nanquantile(pred[v], probs), 3),
          "sim": [rnd(np.nanquantile(simulated[v].isel(n_sim=s), probs), 3)
                  for s in range(simulated.sizes["n_sim"])]}
      for v in ["precip", "ss", "q"]}
win = simulated.isel(n_sim=0).sel(time=slice("2040-01-01", "2049-12-31"))
write_json("weather.json", {
    "lat": rnd(slp.latitude, 3), "lon": rnd(slp.longitude, 3),
    "patterns": [rnd(p, 2) for p in patterns],
    "freq": rnd(freq, 5), "stats": [rnd(s, 3) for s in stats],
    "pairs": ["-".join(p) for p in pairs], "rho": [rnd(r, 3) for r in rho],
    "coast": coast, "site": [-3.45, 43.44],
    "qq": qq, "probs": rnd(probs, 4),
    "window": {"start": str(pd.Timestamp(win.time.values[0]).date()),
               "precip": rnd(win["precip"], 1), "ss": rnd(win["ss"], 3),
               "q": rnd(win["q"], 1), "dwt": win["DWT"].values.astype(int).tolist()},
    "nSims": int(simulated.sizes["n_sim"]),
    "years": [int(pd.Timestamp(simulated.time.values[0]).year),
              int(pd.Timestamp(simulated.time.values[-1]).year)],
})

# ---------------------------------------------------------------------------
# 8. Flood climate (notebook 04): annual maxima and return-period maps
# ---------------------------------------------------------------------------
print("Flood climate: 3 x 100 years through the surrogate")
rng = np.random.default_rng(0)
df_sim = (simulated[["precip", "ss", "q"]].to_dataframe().reset_index()
          .rename(columns={"precip": "precip_acum", "q": "Q"}))
df_sim["TWL"] = rng.choice(tide.values, size=len(df_sim)) + df_sim["ss"]
df_sim["year"] = df_sim["time"].dt.year
lower, upper = mda_centroids.min(), mda_centroids.max()
outside = {v: {"below": round(100 * float((df_sim[v] < lower[v]).mean()), 3),
               "above": round(100 * float((df_sim[v] > upper[v]).mean()), 3)}
           for v in VARIABLES}
X_sim = df_sim[VARIABLES].clip(lower, upper, axis=1).values
X_hist = df_hist[VARIABLES].clip(lower, upper, axis=1).values
t0 = time.time()
pcs_sim = np.vstack([rbf_np(X_sim[i:i + 20000]) for i in range(0, len(X_sim), 20000)])
pcs_hist = rbf_np(X_hist)
pt_cells = [nearest_cell(*v) for v in POINTS.values()]


def annual(pcs, keys):
    """Annual maximum maps and daily levels at the points, per complete year."""
    level = mean[pt_cells] + pcs @ eofs[:, pt_cells]
    maps, out_keys, am_pts, am_day = [], [], [], []
    for key, rows in pd.Series(range(len(pcs))).groupby(keys).indices.items():
        if len(rows) < 360:
            continue
        maps.append((mean + pcs[rows] @ eofs).max(axis=0))
        out_keys.append(key)
        am_pts.append(level[rows].max(axis=0))
        am_day.append(rows[level[rows].argmax(axis=0)])
    return np.array(maps), out_keys, np.array(am_pts), np.array(am_day), level


keys_sim = (df_sim["n_sim"].astype(str) + "-" + df_sim["year"].astype(str)).values
maps_sim, ksim, am_sim, day_sim, _ = annual(pcs_sim, keys_sim)
maps_hist, khist, am_hist, _, _ = annual(pcs_hist, df_hist.index.year.values)
elapsed = time.time() - t0
print(f"  {len(X_sim):,} days -> {len(ksim)} annual maps in {elapsed:.0f} s")
T_list = [2, 5, 10, 25, 50, 100]
zs_T = np.quantile(maps_sim, [1 - 1 / T for T in T_list], axis=0)
write_bin("flood_T_cm.bin", to_cm(zs_T))
bg = df_sim.sample(4000, random_state=0)
write_json("floodclimate.json", {
    "T": T_list, "points": list(POINTS), "outside": outside,
    "nDays": len(X_sim), "seconds": round(elapsed, 1),
    "amSim": [rnd(am_sim[:, j], 3) for j in range(len(POINTS))],
    "simOf": [int(k.split("-")[0]) for k in ksim],
    "amHist": [rnd(am_hist[:, j], 3) for j in range(len(POINTS))],
    "drivers": [{v: rnd(df_sim[v].values[day_sim[:, j]], 3) for v in VARIABLES}
                for j in range(len(POINTS))],
    "background": {v: rnd(bg[v].values, 3) for v in VARIABLES},
    "tideHist": rnd(tide.values, 3),
})

print(f"Done in {time.time() - t_start:.0f} s -> {OUT.relative_to(ROOT)}")
