# Image of the InterJIA HyDeCoFfEE course: SFINCS compiled from source + Python
# environment (bluemath-tk, hydromt-sfincs, Jupyter).
#
# Users do not build this: devcontainer.json pulls the prebuilt image. It is
# published multi-arch (linux/amd64 + linux/arm64) so it runs natively on
# Codespaces, Linux/Windows PCs and Apple Silicon Macs. To rebuild and publish
# it (from the repository root, on an amd64 host):
#
#   # one-time setup: QEMU emulation for arm64 + a multi-platform builder
#   docker run --privileged --rm tonistiigi/binfmt --install arm64
#   docker buildx create --name multiarch --driver docker-container --use
#
#   docker buildx build --platform linux/amd64,linux/arm64 \
#       -f .devcontainer/Dockerfile -t geoocean/interjia:latest --push .
#
# The arm64 half compiles SFINCS and solves the conda env under emulation:
# expect it to be several times slower than the amd64 build.
#
# SFINCS (Deltares, GPL-3.0): https://github.com/Deltares/SFINCS

ARG SFINCS_TAG=v2.5.0_Hautacam_release

# ---------------------------------------------------------------------------
# Stage 1: compile SFINCS (CPU, OpenMP) following Deltares' Dockerfile.cpu
# ---------------------------------------------------------------------------
FROM ubuntu:22.04 AS sfincs-build
ARG SFINCS_TAG
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates git build-essential gfortran autoconf automake libtool m4 \
        pkg-config libnetcdf-dev \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch ${SFINCS_TAG} https://github.com/Deltares/SFINCS.git /usr/src/SFINCS

WORKDIR /usr/src/SFINCS/source
# -fallow-argument-mismatch: https://github.com/Unidata/netcdf-fortran/issues/212
ENV FCFLAGS="-fopenmp -O3 -fallow-argument-mismatch -w" \
    FFLAGS="-fopenmp -O3 -fallow-argument-mismatch -w"
RUN chmod +x autogen.sh \
    && autoreconf -ivf && ./autogen.sh \
    && ./configure --disable-openacc --prefix=/opt/sfincs \
    && make && make install  # serial: Fortran modules must compile in order

# ---------------------------------------------------------------------------
# Stage 2: devcontainer with SFINCS on the PATH and the course environment
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/devcontainers/base:ubuntu-22.04
ENV DEBIAN_FRONTEND=noninteractive

# SFINCS runtime libraries (same Ubuntu release as the build stage)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libnetcdf19 libgfortran5 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=sfincs-build /opt/sfincs /opt/sfincs
# SFINCS ships its own netcdf-fortran in /opt/sfincs/lib: register it with the
# dynamic linker (not LD_LIBRARY_PATH, which would leak into the conda stack)
RUN echo /opt/sfincs/lib > /etc/ld.so.conf.d/sfincs.conf && ldconfig
ENV PATH=/opt/sfincs/bin:$PATH
# Fail the build if any SFINCS library is missing
RUN ! ldd /opt/sfincs/bin/sfincs | grep "not found"

# Python environment (micromamba, installed as the root prefix /opt/conda)
COPY --from=mambaorg/micromamba:1.5.10 /bin/micromamba /usr/local/bin/micromamba
COPY environment.yml /tmp/environment.yml
RUN micromamba create -y -p /opt/conda -f /tmp/environment.yml \
    && micromamba clean -a -y \
    && chown -R vscode:vscode /opt/conda \
    && rm /tmp/environment.yml
ENV PATH=/opt/conda/bin:$PATH \
    PROJ_DATA=/opt/conda/share/proj \
    GDAL_DATA=/opt/conda/share/gdal

# Smoke test: Python stack imports
RUN python -c "import bluemath_tk, hydromt_sfincs, geopandas, rioxarray; print('ok')"

USER vscode