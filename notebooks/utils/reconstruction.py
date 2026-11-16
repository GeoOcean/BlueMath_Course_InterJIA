import xarray as xr


def pcs_to_water_level(pca, pcs, var="zs"):
    """
    Reconstruct the maximum water level from principal components.

    Parameters
    ----------
    pca : PCA
        Fitted bluemath_tk PCA model of the SFINCS water levels.
    pcs : pd.DataFrame
        Principal components, one row per scenario (columns PC1, PC2, ...).
    var : str, optional
        Name of the reconstructed variable.

    Returns
    -------
    xr.DataArray
        Maximum water level with dimensions (case_num, y, x), NaN outside the
        active cells. Use `water_level_to_depth` to obtain the flood maps.
    """
    pc_names = list(pca.pcs_df.columns)

    pcs_xr = xr.DataArray(
        pcs[pc_names].values,
        dims=[pca.pca_dim_for_rows, "PCs"],
        coords={pca.pca_dim_for_rows: pcs.index.values, "PCs": pc_names},
    )

    return pca.inverse_transform(pcs_xr)[var].transpose(pca.pca_dim_for_rows, "y", "x")
