import xarray as xr
from hydromt_sfincs import SfincsModel, utils


def read_water_level(case_dir):
    """
    Maximum water level of a SFINCS case on its grid.

    Cells that never get wet take the level of their bed, so that every
    active cell has a value. Inactive cells are NaN.
    """
    sf = SfincsModel(case_dir, mode="r")
    sf.read_results()

    zsmax = sf.results["zsmax"].max(dim="timemax")

    return zsmax.where(zsmax.notnull(), sf.results["zb"])


def water_level_cases(cases_dir, n_cases):
    """
    Maximum water level of all the SFINCS cases, as an xr.Dataset with the
    variable `zs` and dimensions (case_num, y, x).
    """
    return xr.concat(
        [read_water_level(f"{cases_dir}/{i:04d}") for i in range(n_cases)],
        dim="case_num",
    ).rename("zs").to_dataset()


def water_level_to_depth(zs, dep_hr):
    """
    Maximum water depth on the high-resolution DEM: depth = max(zs - DEM, 0).

    Parameters
    ----------
    zs : xr.DataArray
        Maximum water level on the SFINCS grid, with dimensions (y, x) or
        (case_num, y, x). NaN outside the active cells.
    dep_hr : xr.Dataset
        High-resolution DEM (variable `band_data`).

    Returns
    -------
    xr.DataArray
        Maximum water depth with the dimensions of `zs` on the DEM grid,
        cropped to the active cells: 0 where it stays dry, NaN outside the
        active cells.
    """
    dep = dep_hr["band_data"].squeeze(drop=True)

    single = "case_num" not in zs.dims
    if single:
        zs = zs.expand_dims(case_num=[0])

    # Active cells (same for all the cases) on the DEM grid, and crop
    active = zs.isel(case_num=0).notnull().astype("float32")
    active.attrs = {}
    active.raster.set_crs(dep.raster.crs)
    active.raster.set_nodata(-1.0)
    active_hr = (active.raster.reproject_like(dep, method="nearest") == 1).compute()
    rows = active_hr.any(dim="x").values
    cols = active_hr.any(dim="y").values
    dep = dep.sel(y=dep.y[rows], x=dep.x[cols])
    active_hr = active_hr.sel(y=dep.y, x=dep.x)

    depths = []
    for case in zs.case_num.values:
        level = zs.sel(case_num=case)
        level.raster.set_crs(dep.raster.crs)
        depth = utils.downscale_floodmap(zsmax=level, dep=dep, hmin=0.0)
        depths.append(depth.fillna(0).where(active_hr).astype("float32"))

    depths = xr.concat(depths, dim="case_num").assign_coords(case_num=zs.case_num.values)
    depths = depths.rename("depth").drop_vars("spatial_ref", errors="ignore")

    return depths.isel(case_num=0, drop=True) if single else depths
