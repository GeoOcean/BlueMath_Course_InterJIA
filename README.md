# HyDeCoFfEE: Hybrid Compound-Flood Modelling of the Santoña Estuary

Course material of the **InterJIA workshop** (Madrid, November 2026), by the
[GeoOcean Group](https://geoocean.unican.es) (Universidad de Cantabria).

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/GeoOcean/BlueMath_Course_InterJIA)

**Slides:** <https://geoocean.github.io/BlueMath_Course_InterJIA/>

The Santoña estuary (Cantabria, Spain) can be flooded by the **sea**, the
**Asón river** and the **rain**, often at the same time. Simulating every
possible day with a flood model is too expensive, so we build a **hybrid
model**: HyDeCoFfEE, a simpler version of
[HyCoFfEE](https://doi.org/10.1016/j.ecss.2026.110271) that uses SFINCS
instead of SCHISM.

1. pick 100 representative days with **LHS + MDA**,
2. simulate them with **[SFINCS](https://github.com/Deltares/SFINCS)**,
3. learn the flood maps with **PCA + RBF**, a surrogate that answers in milliseconds,
4. drive it with a **climate emulator** to get 3 × 100 years of floods and the
   10-, 50- and 100-year flood maps.

## Getting started

**In the browser (recommended):** click *Open in GitHub Codespaces* above and
wait about a minute. Everything is installed. Open the notebooks in
`notebooks/` and choose the Python kernel in `/opt/conda`.

**On your machine, with Docker:** open the repository in VS Code and choose
*Reopen in Container* (Dev Containers extension). Or, from the repository folder:

```bash
docker run -it --rm -p 8888:8888 -v "$PWD":/workspace -w /workspace \
    geoocean/interjia:latest jupyter lab --ip 0.0.0.0 --no-browser
```

and open the `http://127.0.0.1:8888/...` link it prints.

**On your machine, without Docker:** with [Miniforge](https://github.com/conda-forge/miniforge):

```bash
mamba env create -f environment.yml
conda activate interjia
jupyter lab notebooks/
```

SFINCS is not included this way: set `run_sfincs = False` in notebook 01 and
it uses our results.

## Notebooks

Run them in order: each one uses what the previous one created.

| Notebook | What you do |
|:--|:--|
| [`01_SFINCS_wrapper`](notebooks/01_SFINCS_wrapper.ipynb) | Pick 100 days (LHS + MDA), run SFINCS, compress the flood maps with PCA |
| [`02_Surrogate`](notebooks/02_Surrogate.ipynb) | Fit the RBF surrogate, check its error, predict new days |
| [`03_Emulator`](notebooks/03_Emulator.ipynb) | Fit one Gaussian copula per weather type and simulate 3 × 100 years of rain, sea level and river flow |
| [`04_Flood_climate`](notebooks/04_Flood_climate.ipynb) | Run the 110,000 emulated days through the surrogate: return periods and flood maps |

The weather types are given in `notebooks/data/`: the 25 daily weather types
(DWTs, `dwt_model.pkl`), and the 3 × 100 years of annual (AWTs) and daily
weather types simulated with the two ALR models (`AWT_SIM_nsims3_2000_2100.nc`,
`xds_output.nc`). The slides explain how they were built, but you do not run
that part: notebook 03 starts from the simulated DWTs.

Something failed, or you want to skip a step? Set `USE_PRETRAINED = True` at
the top of notebooks 02 and 04, and they use our results in
`notebooks/pretrained/`.

## The slides on your machine

```bash
python -m http.server 8000 --directory slides
```

and open <http://localhost:8000> (press `S` for the speaker notes).

To see **your own models** in the interactive slides, after running notebooks
01 to 04:

```bash
python slides/scripts/export_data.py --own
```

and refresh the page. Without `--own`, the slides go back to our models.

## Credits

- [BlueMath toolkit](https://github.com/GeoOcean/BlueMath_tk) (GeoOcean): LHS, MDA, PCA, RBF and the climate emulator.
- [SFINCS](https://github.com/Deltares/SFINCS) (Deltares) and [HydroMT-SFINCS](https://github.com/Deltares/hydromt_sfincs).

Licensed under the GNU GPL v3.0, like BlueMath and SFINCS (see [LICENSE](LICENSE)).
