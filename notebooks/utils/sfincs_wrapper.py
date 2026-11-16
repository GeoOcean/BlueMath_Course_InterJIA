import os
import os.path as op
import shutil
from typing import List

import geopandas as gpd
import numpy as np
import pandas as pd
from hydromt_sfincs import SfincsModel

from bluemath_tk.wrappers._base_wrappers import BaseModelWrapper

# SFINCS Apptainer/Singularity image, for machines without the executable
# (e.g. a cluster). Point the SFINCS_SIF environment variable to it.
SFINCS_SIF = os.environ.get("SFINCS_SIF", "sfincs.sif")


def default_launcher() -> str:
    """
    Launcher to use on this machine: the `sfincs` executable if it is on the
    PATH (course devcontainer / Codespaces), else the Apptainer image if
    SFINCS_SIF exists, else Docker.
    """
    if shutil.which("sfincs"):
        return "serial"
    if op.exists(SFINCS_SIF):
        return "apptainer"
    return "docker"


class SfincsModelWrapper(BaseModelWrapper):
    """
    Wrapper for the SFINCS model.

    SFINCS wrapper of the BlueMath course, extended with **river discharge** forcing
    (`sfincs.src` + `sfincs.dis`) and with a template builder that only needs
    a DEM (friction, infiltration and boundary shapefiles are optional).

    Attributes
    ----------
    default_parameters : dict
        The default parameters type for the wrapper.
    available_launchers : dict
        The available launchers for the wrapper.
    """

    default_parameters = {}

    available_launchers = {
        # SFINCS executable on the PATH (course devcontainer / Codespaces)
        "serial": "sfincs",
        "docker": "docker run --rm -v .:/case_dir -w /case_dir deltares/sfincs-cpu",
        # Apptainer image (4 OpenMP threads per case, so that parallel cases
        # do not compete for the cores)
        "apptainer": (
            f'apptainer run --env OMP_NUM_THREADS=4 --bind "$(pwd)" --pwd "$(pwd)" {SFINCS_SIF}'
        ),
    }

    def __init__(
        self,
        templates_dir: str,
        metamodel_parameters: dict,
        fixed_parameters: dict,
        output_dir: str,
        templates_name: dict = "all",
        debug: bool = True,
    ) -> None:
        """
        Initialize the SFINCS model wrapper.
        """

        super().__init__(
            templates_dir=templates_dir,
            metamodel_parameters=metamodel_parameters,
            fixed_parameters=fixed_parameters,
            output_dir=output_dir,
            templates_name=templates_name,
            default_parameters=self.default_parameters,
        )
        self.set_logger_name(
            name=self.__class__.__name__, level="DEBUG" if debug else "INFO"
        )

    def setup_dem(self, sf: SfincsModel, case_context: dict) -> List[dict]:
        """
        Setup the DEM for the SFINCS model.
        """

        ds = sf.data_catalog.get_rasterdataset(
            data_like=case_context.get("path_to_dem_tif"),
            variables=[case_context.get("dem_tif_var_name")],
            geom=sf.region,
            meta={"version": "1"},
        )

        datasets_dep = [{"da": ds}]  # "zmin": 0.001

        sf.setup_dep(datasets_dep=datasets_dep)

        return datasets_dep

    def setup_friction(self, sf: SfincsModel, case_context: dict) -> List[dict]:
        """
        Setup the friction for the SFINCS model.

        If no roughness map is given, an empty list is returned and the subgrid
        tables use the constant `manning_land` / `manning_sea` values.
        """

        if case_context.get("path_to_rgh_tif") is None:
            return []

        dataset_rgh = sf.data_catalog.get_rasterdataset(
            data_like=case_context.get("path_to_rgh_tif"),
        )

        datasets_rgh = [{"manning": dataset_rgh}]

        sf.setup_manning_roughness(
            datasets_rgh=datasets_rgh,
            rgh_lev_land=0,  # the minimum elevation of the land
        )

        return datasets_rgh

    def setup_infiltration(self, sf: SfincsModel, case_context: dict) -> List[dict]:
        """
        Setup the infiltration for the SFINCS model (optional).
        """

        p_infiltration = case_context.get("path_to_inf_tif")

        if p_infiltration is None:
            return None

        ant_moisture = "avg"

        dataset_inf = sf.data_catalog.get_rasterdataset(p_infiltration)

        dataset_inf.name = "cn_{0}".format(ant_moisture)

        sf.setup_cn_infiltration(
            dataset_inf.compute(), antecedent_moisture="{0}".format(ant_moisture)
        )

        return dataset_inf

    def setup_outflow(self, sf: SfincsModel, case_context: dict) -> None:
        """
        Setup the outflow for the SFINCS model (optional).
        """

        if case_context.get("path_to_outflow_shp") is None:
            return

        gdf = sf.data_catalog.get_geodataframe(
            data_like=case_context.get("path_to_outflow_shp")
        )

        sf.setup_mask_bounds(btype="outflow", include_mask=gdf, reset_bounds=True)

    def setup_waterlevel_mask(self, sf: SfincsModel, case_context: dict) -> None:
        """
        Setup the waterlevel mask for the SFINCS model.

        The water-level boundary cells are the cells at the edge of the active
        domain that lie inside `waterlevel_include_mask` (a GeoDataFrame or a
        path to a shapefile; optional) and are deeper than `waterlevel_zmax`
        (optional).
        """

        include_mask = case_context.get(
            "waterlevel_include_mask", case_context.get("path_to_waterlevel_shp")
        )

        if include_mask is not None and not isinstance(include_mask, gpd.GeoDataFrame):
            include_mask = sf.data_catalog.get_geodataframe(data_like=include_mask)

        sf.setup_mask_bounds(
            btype="waterlevel",
            include_mask=include_mask,
            include_mask_buffer=case_context.get("waterlevel_include_buffer", 0),
            zmax=case_context.get("waterlevel_zmax"),
            reset_bounds=True,
        )

    def run_cases_with_progress(
        self, launcher: str, num_workers: int = 1, refresh_seconds: float = 1.0
    ) -> None:
        """
        Run all the cases (like `run_cases`) showing their progress in the output
        of the notebook cell: number of finished cases and % of the running ones,
        read from the SFINCS log of each case (`wrapper_out.log`).

        The results and logs of previous runs are removed first.
        """
        import re
        import threading
        import time

        from IPython.display import Pretty, display

        for case_dir in self.cases_dirs:
            for file in ("sfincs_map.nc", "sfincs_his.nc", "wrapper_out.log", "wrapper_error.log"):
                if op.exists(op.join(case_dir, file)):
                    os.remove(op.join(case_dir, file))

        runner = threading.Thread(
            target=self.run_cases, kwargs={"launcher": launcher, "num_workers": num_workers}
        )
        runner.start()
        progress = display(Pretty("Starting SFINCS..."), display_id=True)

        while True:
            finished = not runner.is_alive()
            n_done, running = 0, []

            for case_num, case_dir in enumerate(self.cases_dirs):
                log_file = op.join(case_dir, "wrapper_out.log")
                if not op.exists(log_file):
                    continue
                with open(log_file, errors="ignore") as f:
                    log = f.read()
                if "Simulation finished" in log:
                    n_done += 1
                else:
                    percentages = re.findall(r"(\d+)% complete", log)
                    running.append(f"case {case_num}: {percentages[-1] if percentages else 0}%")

            text = f"SFINCS cases finished: {n_done}/{len(self.cases_dirs)}"
            if running and not finished:
                text += "  |  running: " + ", ".join(running)
            progress.update(Pretty(text))

            if finished:
                break
            time.sleep(refresh_seconds)

    def set_ctimes(self, case_context: dict) -> str:
        """
        Determine the start time (TSTART) end time (TSTOP) for the simulation based on
        precipitation, water level and discharge forcing, add 1 hour,
        and return it formatted as 'YYYYMMDD HHMMSS'.
        """

        forcings = [
            case_context.get(name)
            for name in (
                "precipitation_forcing",
                "slowly_waterlevel_forcing",
                "quickly_waterlevel_forcing",
                "discharge_forcing",
            )
        ]

        tstart_times, tstop_times = [], []

        for forcing in forcings:
            if forcing is not None:
                tstart_times.append(forcing.index.values[0])
                tstop_times.append(forcing.index.values[-1])

        if not tstart_times:
            raise ValueError("No forcing data found to determine TSTART.")

        if not tstop_times:
            raise ValueError("No forcing data found to determine TSTOP.")

        # Get the latest time and add one hour
        tstop_max = max(tstop_times)
        tstop_plus_1h = tstop_max + np.timedelta64(1, "h")

        tstart_min = min(tstart_times)

        # Convert to pandas.Timestamp (works with numpy.datetime64) then format
        formatted_tstop = pd.to_datetime(tstop_plus_1h).strftime("%Y%m%d %H%M%S")
        formatted_tstart = pd.to_datetime(tstart_min).strftime("%Y%m%d %H%M%S")

        return formatted_tstart, formatted_tstop

    def build_template_case(self, plot_basemap: bool = False) -> SfincsModel:
        """
        Build a base SFINCS model case used as a template for multiple simulations.
        This function sets up all the static components of the model that are
        common to all cases, such as grid definition, DEM, active mask,
        friction, infiltration, subgrid configuration and boundary masks.
        """

        sf = SfincsModel(root=self.templates_dir, mode="w+")

        sf.setup_grid(
            x0=self.fixed_parameters["x0"],
            y0=self.fixed_parameters["y0"],
            dx=self.fixed_parameters["dx"],
            dy=self.fixed_parameters["dy"],
            nmax=self.fixed_parameters["nmax"],
            mmax=self.fixed_parameters["mmax"],
            rotation=self.fixed_parameters["rotation"],
            epsg=self.fixed_parameters["epsg"],
        )

        datasets_dep = self.setup_dem(sf=sf, case_context=self.fixed_parameters)

        # Active cells: inside a polygon (GeoDataFrame or file) and/or
        # within an elevation range
        sf.setup_mask_active(
            mask=self.fixed_parameters.get(
                "mask_polygon", self.fixed_parameters.get("path_to_mask")
            ),
            zmin=self.fixed_parameters.get("mask_zmin"),
            zmax=self.fixed_parameters.get("mask_zmax"),
            fill_area=self.fixed_parameters.get("mask_fill_area", 10.0),
            drop_area=self.fixed_parameters.get("mask_drop_area", 0.0),
        )

        datasets_rgh = self.setup_friction(sf, case_context=self.fixed_parameters)

        _dataset_inf = self.setup_infiltration(sf, case_context=self.fixed_parameters)

        sf.setup_subgrid(
            datasets_dep=datasets_dep,
            datasets_rgh=datasets_rgh,
            nr_subgrid_pixels=self.fixed_parameters.get("nr_subgrid_pixels"),
            manning_land=self.fixed_parameters.get("manning_land", 0.04),
            manning_sea=self.fixed_parameters.get("manning_sea", 0.02),
            write_dep_tif=True,
            write_man_tif=False,
        )

        self.setup_outflow(sf=sf, case_context=self.fixed_parameters)

        self.setup_waterlevel_mask(sf=sf, case_context=self.fixed_parameters)

        if plot_basemap:
            _ = sf.plot_basemap(bmap="sat", zoomlevel=12)

        sf.write()

        return sf

    def build_case(self, case_context: dict, case_dir: str) -> None:
        """
        Build the base SFINCS model. This includes setting up the grid,
        depth, friction, mask, outflow and waterlevel mask. It also
        applies the precipitation, waterlevel and river discharge
        forcing if specified.
        """

        sf = SfincsModel(root=case_dir, mode="w+")

        # Start from the template configuration (static input files, physics...)
        # NOTE: sfincs.inp must not be in templates_name, or it would overwrite
        # the configuration written here
        sf.read_config(op.join(self.templates_dir, "sfincs.inp"))

        sf.setup_grid(
            x0=case_context["x0"],
            y0=case_context["y0"],
            dx=case_context["dx"],
            dy=case_context["dy"],
            nmax=case_context["nmax"],
            mmax=case_context["mmax"],
            rotation=case_context["rotation"],
            epsg=case_context["epsg"],
        )
        tstart, tstop = self.set_ctimes(case_context=case_context)

        sf.config["tref"] = tstart
        sf.config["tstart"] = tstart
        sf.config["tstop"] = tstop
        sf.config["dtout"] = case_context.get("dtout", 60)
        sf.config["storemeteo"] = 1

        if case_context.get("quickly_waterlevel_forcing") is not None:
            """
            NOTE - There is not a specific Python function yet,
            but one could call the setup_waterlevel_forcing function
            twice with saving the files in between and changing their names
            """

            sf.setup_waterlevel_forcing(
                timeseries=case_context.get("quickly_waterlevel_forcing"),
                locations=case_context.get("gdf_boundary_points"),
            )
            sf.write_forcing()
            os.rename(op.join(case_dir, "sfincs.bzs"), op.join(case_dir, "sfincs.bzi"))
            sf.config["bzifile"] = "sfincs.bzi"

        if case_context.get("slowly_waterlevel_forcing") is not None:
            slowly_waterlevel_forcing = case_context.get("slowly_waterlevel_forcing")

            sf.setup_waterlevel_forcing(
                timeseries=slowly_waterlevel_forcing,
                locations=case_context.get("gdf_boundary_points"),
            )
            sf.write_forcing()

            # Start from a water level in equilibrium with the boundary
            sf.config["zsini"] = round(float(slowly_waterlevel_forcing.iloc[0, 0]), 3)

        if case_context.get("precipitation_forcing") is not None:
            precip = case_context["precipitation_forcing"]

            precip_file = os.path.join(case_dir, "_precipitation_forcing.csv")

            precip.to_csv(
                precip_file,
                index=True,
                index_label="time",
            )

            sf.setup_precip_forcing(
                timeseries=precip_file,
            )

            os.remove(precip_file)

        if case_context.get("discharge_forcing") is not None:
            # River inflow: sfincs.src (locations) + sfincs.dis (time series).
            # The columns of the time series must match the index of the
            # source points GeoDataFrame.
            sf.setup_discharge_forcing(
                timeseries=case_context.get("discharge_forcing"),
                locations=case_context.get("gdf_river_points"),
            )

        if case_context.get("gdf_crs") is not None:
            sf.setup_observation_lines(
                locations=case_context.get("gdf_crs"), merge=False
            )

        if case_context.get("gdf_obs") is not None:
            sf.setup_observation_points(locations=case_context.get("gdf_obs"))

        sf.write()
