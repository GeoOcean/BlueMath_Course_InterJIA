import numpy as np
import pandas as pd
from scipy.spatial import Delaunay


def inside_convex_hull(
    samples: pd.DataFrame,
    data: pd.DataFrame,
    columns: list,
) -> np.ndarray:
    """
    Boolean mask of the `samples` that lie inside the convex hull of `data`,
    computed in the space of `columns` normalized to [0, 1] with the range
    of `data`.

    Parameters
    ----------
    samples : pd.DataFrame
        Points to check (e.g. an LHS dataset).
    data : pd.DataFrame
        Observed data that define the convex hull.
    columns : list
        Variables used to build the convex hull (2 or more).
    """
    lower, upper = data[columns].min(), data[columns].max()

    def normalize(df):
        return ((df[columns] - lower) / (upper - lower)).values

    return Delaunay(normalize(data)).find_simplex(normalize(samples)) >= 0
