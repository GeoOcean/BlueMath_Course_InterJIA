# HySfincs: Hybrid Compound-Flood Modelling of the Santoña Estuary

Course material of the **InterJIA workshop** (Madrid, November 2026), by the
[GeoOcean Group](https://geoocean.unican.es) (Universidad de Cantabria).

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/GeoOcean/BlueMath_Course_InterJIA)

The Santoña estuary (Cantabria, Spain) can be flooded by the **sea**, the
**Asón river** and the **rain**, often at the same time. Simulating every
possible day with a flood model is too expensive, so we build a **hybrid
model**:

1. pick 100 representative days with **LHS + MDA**,
2. simulate them with **[SFINCS](https://github.com/Deltares/SFINCS)**,
3. compress the flood maps with **PCA** and learn them with an **RBF**
   surrogate that answers in milliseconds,
4. drive the surrogate with a **climate emulator** (weather types + copulas)
   to get 300 years of floods and the 10-, 50- and 100-year flood maps.

Slides: <https://geoocean.github.io/BlueMath_Course_InterJIA/>

## Getting started

**In the browser (recommended):** click *Open in GitHub Codespaces* above. The
environment (SFINCS, Python, bluemath-tk, Jupyter) is ready in about a
minute. Open the notebooks in `notebooks/` and choose the *Python 3* kernel.

**On your machine, with Docker:** the same image as Codespaces, SFINCS
included. Either open the repository in VS Code and choose *Reopen in
Container* (Dev Containers extension), or run Jupyter directly from the
repository folder:

```bash
docker run -it --rm -p 8888:8888 -v "$PWD":/workspace -w /workspace \
    geoocean/interjia:latest \
    jupyter lab --ip 0.0.0.0 --no-browser
```

and open the `http://127.0.0.1:8888/...` link it prints.

**On your machine, without Docker:** with [Miniforge](https://github.com/conda-forge/miniforge):

```bash
mamba env create -f environment.yml
conda activate interjia
jupyter lab notebooks/
```

You also need SFINCS to run the simulations of notebook 01. Use the
[Deltares Docker image](https://hub.docker.com/r/deltares/sfincs-cpu) or an
Apptainer image (set `SFINCS_SIF=/path/to/sfincs.sif`). Without SFINCS, set
`run_sfincs = False` and the notebook uses the results we provide.

## Notebooks

| Notebook | What you do | Time |
|:--|:--|:--|
| [`01_SFINCS_metamodel`](notebooks/01_SFINCS_metamodel.ipynb) | Sample 100 days (LHS + MDA), build the forcing, run SFINCS, compress the flood maps with PCA | ~5 min (SFINCS) |
| [`02_Surrogate`](notebooks/02_Surrogate.ipynb) | Fit the RBF surrogate, cross-validate it, predict new days | ~1 min |
| [`03_Emulator`](notebooks/03_Emulator.ipynb) | Simulate 3 × 100 years of rain, surge + setup and river discharge from weather types | ~1 min |
| [`04_Flood_climate`](notebooks/04_Flood_climate.ipynb) | Run the 110,000 emulated days through the surrogate: return periods and flood maps | ~1 min |

### Your results or ours

Each notebook writes its results next to it (`cases/`, `templates/`,
`export/`, `outputs/`). The next notebook reads them, so you work with **your
own** models.

If something fails or you want to skip a step, set `USE_PRETRAINED = True` at
the top of notebooks 02 and 04. They then read the models and results in
[`notebooks/pretrained/`](notebooks/pretrained/), which were produced with the
same code and seeds.

## Repository structure

```
.devcontainer/      Dockerfile (SFINCS compiled from source + Python) and Codespaces config
environment.yml     Python environment
notebooks/
├── 01-04_*.ipynb   the course
├── data/           inputs: forcing, DEM, model contour, weather-type models
├── pretrained/     models and SFINCS results we provide (fallback)
└── utils/          SFINCS wrapper, forcing, post-processing and plotting
slides/             workshop slides (GitHub Pages)
```

## Slides

The slides are plain HTML files in [`slides/`](slides/), published at
<https://geoocean.github.io/BlueMath_Course_InterJIA/>. The interactive demos run in the
browser, so nothing needs installing. To view them locally, serve the folder
(some browsers block `file://` pages from loading data files):

```bash
python -m http.server 8000 --directory slides
```

and open <http://localhost:8000>. In Codespaces, the forwarded port opens in your browser.

## For maintainers: the container image

Codespaces (and `docker run` on your machine) pull the prebuilt image
`geoocean/interjia:latest` from Docker Hub, so that it starts fast. Rebuild
it whenever `.devcontainer/Dockerfile` or `environment.yml` changes. All the
commands below run from the repository root.

**1. Build** (15-25 min, most of it compiling SFINCS):

```bash
docker build -f .devcontainer/Dockerfile -t geoocean/interjia:latest .
```

The build fails if SFINCS misses a library or the Python stack does not import.

**2. Check SFINCS and Python:**

```bash
docker run --rm geoocean/interjia:latest which sfincs   # /opt/sfincs/bin/sfincs
docker run --rm geoocean/interjia:latest python -c "import bluemath_tk, hydromt_sfincs; print('ok')"
```

**3. Run the notebooks** with the repository mounted:

```bash
docker run -it --rm -p 8888:8888 -v "$PWD":/workspace -w /workspace \
    geoocean/interjia:latest \
    jupyter lab --ip 0.0.0.0 --no-browser
```

Run 01 to 04 in order. Notebook 01 should end with `SFINCS cases run: 100 of 100`
and `8 PCs explain 99.91% of the variance`, the same as `notebooks/pretrained/`.
To check the dev container itself, open the repository in VS Code and choose
*Reopen in Container*.

To run the notebooks headless instead:

```bash
docker run --rm -v "$PWD":/workspace -w /workspace/notebooks geoocean/interjia:latest \
    bash -c 'for nb in 0*.ipynb; do jupyter nbconvert --to notebook --execute --inplace "$nb" || exit 1; done'
```

**4. Push** (the Docker Hub repository must be **public**):

```bash
docker login
docker push geoocean/interjia:latest
```

**Apple Silicon (optional).** The image above is `linux/amd64`: it runs on M1-M4
Macs through emulation, only slower. To publish a native `arm64` image as well:

```bash
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 \
    -f .devcontainer/Dockerfile -t geoocean/interjia:latest --push .
```

**Without the prebuilt image**, Codespaces can build it on start (slow, ~20 min):
replace `"image"` in `.devcontainer/devcontainer.json` with
`"build": {"dockerfile": "Dockerfile", "context": ".."}`.

## Credits

- [BlueMath toolkit](https://github.com/GeoOcean/BlueMath_tk) (GeoOcean): LHS, MDA, PCA, RBF and the climate emulator.
- [SFINCS](https://github.com/Deltares/SFINCS) (Deltares) and [HydroMT-SFINCS](https://github.com/Deltares/hydromt_sfincs).

Licensed under the GNU GPL v3.0, like BlueMath and SFINCS (see [LICENSE](LICENSE)).
