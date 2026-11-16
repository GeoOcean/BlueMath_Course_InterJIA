import geopandas as gpd
import numpy as np
import xarray as xr
from rasterio import features
from scipy import ndimage
from shapely.geometry import shape
from shapely.ops import unary_union

_CONNECTIVITY = np.ones((3, 3))


def _raster_to_polygon(mask, da):
    """Vectorize the True cells of a boolean raster aligned with `da`."""
    polygons = [
        shape(geom)
        for geom, value in features.shapes(
            mask.astype("uint8"), mask=mask, transform=da.rio.transform()
        )
        if value == 1
    ]
    return unary_union(polygons)



def _cell_index(da, point):
    iy = int(np.abs(da.y.values - point[1]).argmin())
    ix = int(np.abs(da.x.values - point[0]).argmin())
    return iy, ix



def close_at_mouth(
    dem: xr.DataArray,
    gdf_contour: gpd.GeoDataFrame,
    mouth_line,
    inner_point: tuple,
    z_connect: float = 3.0,
) -> gpd.GeoDataFrame:
    """
    Close the model contour with a line across the estuary mouth.

    The sea on the outer side of `mouth_line` is removed from `gdf_contour`:
    it is made of the areas below `z_connect` that, once the mouth is closed,
    are no longer connected to the estuary (`inner_point`) and reach the edge
    of the DEM. Choose `z_connect` above the highest water level, and draw
    `mouth_line` from land to land, so that it is the only connection between
    the estuary and the sea.

    Returns
    -------
    gpd.GeoDataFrame
        Polygon of the modelled domain, to be used as the SFINCS active mask.
    """
    transform = dem.rio.transform()
    z = dem.values

    # Close the mouth with a thin band along the line
    band = features.rasterize(
        [(mouth_line.buffer(abs(transform.a)), 1)], out_shape=z.shape, transform=transform
    ).astype(bool)

    low = (z < z_connect) & np.isfinite(z) & ~band
    labels, _ = ndimage.label(low, structure=_CONNECTIVITY)

    estuary_label = labels[_cell_index(dem, inner_point)]
    if estuary_label == 0:
        raise ValueError("`inner_point` is not below `z_connect`.")

    # Low areas outside the estuary that reach the edge of the DEM: the sea
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    sea = np.isin(labels, edge[(edge > 0) & (edge != estuary_label)])

    domain = gdf_contour.to_crs(dem.rio.crs).union_all().difference(_raster_to_polygon(sea, dem))

    # Keep only the part of the domain on the estuary side of the mouth line
    inside = features.rasterize([(domain, 1)], out_shape=z.shape, transform=transform).astype(bool)
    labels, _ = ndimage.label(inside & ~band, structure=_CONNECTIVITY)
    estuary_side = (labels == labels[_cell_index(dem, inner_point)]) | (band & inside)

    return gpd.GeoDataFrame(geometry=[_raster_to_polygon(estuary_side, dem)], crs=dem.rio.crs)
