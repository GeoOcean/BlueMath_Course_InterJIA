import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import xarray as xr


def plot_output_cases(output, dep_hr, ncols=3, figsize=None, cmap='BuPu', vmin=None, vmax=None, titles=None, label='Max. flood depth [m]'):
    """Plot the maximum flood depth of each simulated case."""

    nrows = int(np.ceil(len(output) / ncols))
    figsize = figsize or (11, 2.5 * nrows)

    fig, axes = plt.subplots(nrows, ncols, figsize=figsize, sharex=True, sharey=True, dpi=160, squeeze=False)
    axes = axes.ravel()

    dep = dep_hr["band_data"].squeeze()

    for i, ds in enumerate(output):

        da = ds.zsmax if isinstance(ds, xr.Dataset) else ds
        im = da.plot(ax=axes[i], cmap=cmap, add_colorbar=False, vmin=vmin, vmax=vmax)

        axes[i].contour(
            dep.x, dep.y, dep,
            levels=[0], colors="k", linewidths=.7
        )

        axes[i].set_xlim(float(da.x.min()), float(da.x.max()))
        axes[i].set_ylim(float(da.y.min()), float(da.y.max()))
        axes[i].set_title(titles[i] if titles is not None else f"Case {i}", fontsize=9)
        axes[i].set_aspect("equal")
        axes[i].set_xlabel("")
        axes[i].set_ylabel("")

    for ax in axes[len(output):]:
        ax.set_visible(False)

    fig.colorbar(im, ax=axes, shrink=0.8, label=label)

    return fig, axes



def plot_pca_eofs_pcs(pca, dep_hr, var_to_predict, inputs, pairs=None, n_components=None, figsize=None, dpi=150, label="Flood depth [m]"):
    """Plot the first `n_components` EOF spatial patterns and their standardized PCs in the input space."""

    n_components = min(n_components or len(pca.eofs.n_component), len(pca.eofs.n_component))
    dep = dep_hr["band_data"].squeeze()

    # Default: consecutive input pairs, so each variable appears once
    columns = list(inputs.columns)
    pairs = pairs or [tuple(columns[j:j + 2]) for j in range(0, len(columns) - 1, 2)]
    n_pairs = len(pairs)
    figsize = figsize or (4 + 3 * n_pairs, 3 * n_components)

    fig, axs = plt.subplots(
        n_components, n_pairs + 1, figsize=figsize, dpi=dpi,
        gridspec_kw={"width_ratios": [1.5] + [1] * n_pairs}, squeeze=False, layout="constrained"
    )

    for i, component in enumerate(pca.eofs.n_component.values[:n_components]):
        eof = pca.eofs.sel(n_component=component)[var_to_predict]
        pc = pca.pcs.sel(n_component=component)["PCs"]
        variance = pca.explained_variance_ratio[component].item() * 100

        pc_std = pc.std().item()
        eof_plot, pc_plot = eof * pc_std, pc.values / pc_std
        vmax = abs(eof_plot).max().item()
        pc_vmax = abs(pc_plot).max()

        im = eof_plot.plot(
            ax=axs[i, 0], x="x", cmap="RdBu_r",
            vmin=-vmax, vmax=vmax, add_colorbar=False
        )
        axs[i, 0].contour(dep.x, dep.y, dep, levels=[0], colors="k", linewidths=.7)
        fig.colorbar(im, ax=axs[i, 0], label=label)
        axs[i, 0].set_title(f"EOF {component + 1} ({variance:.1f}%)", fontweight="bold")
        axs[i, 0].set_xticks([])
        axs[i, 0].set_yticks([])
        axs[i, 0].set(xlabel="", ylabel="")

        for j, (x_var, y_var) in enumerate(pairs):
            ax = axs[i, j + 1]
            sc = ax.scatter(
                inputs[x_var], inputs[y_var], c=pc_plot, cmap="RdBu_r",
                vmin=-pc_vmax, vmax=pc_vmax, s=55, edgecolor="k", linewidth=.4, zorder=5
            )
            ax.set(xlabel=x_var, ylabel=y_var)
            ax.grid(lw=.5, alpha=.5)
            if j == 0:
                ax.set_title(f"PC {component + 1}", fontweight="bold", loc="left")

        fig.colorbar(sc, ax=axs[i, 1:], label="Standardized PC")

    return fig, axs



def plot_hysfincs_forcings(waterlevel_forcing, discharge_forcing, precipitation_forcing, reference_time, ncols=2, titles=None):
    """Plot the TWL, river discharge and rainfall forcings of each HySfincs case."""

    n_cases = len(waterlevel_forcing)
    nrows = int(np.ceil(n_cases / ncols))
    reference_time = pd.Timestamp(reference_time)

    fig, axes = plt.subplots(nrows, ncols, figsize=(10, 2.0 * nrows), sharex=True, sharey=True, squeeze=False)
    axes = axes.ravel()

    c_sl, c_q, c_p = "#69A9A3", "#4C6EB1", "#C68364"
    q_max = max(q.values.max() for q in discharge_forcing)
    p_max = max(p.values.max() for p in precipitation_forcing)

    def hours(df):
        return (df.index - reference_time).total_seconds() / 3600

    for i in range(n_cases):
        ax = axes[i]
        wl, q, p = waterlevel_forcing[i], discharge_forcing[i], precipitation_forcing[i]

        ax.plot(hours(wl), wl.values.squeeze(), c=c_sl, lw=1.5)
        ax.set_ylabel("TWL [m]", color=c_sl, fontweight="bold")
        ax.tick_params(axis="y", colors=c_sl)

        # Rainfall (bars from the top) and discharge on a shared right axis
        ax2 = ax.twinx()
        ax2.plot(hours(q), q.values.squeeze(), c=c_q, lw=1.5)
        ax2.set_ylim(0, 1.1 * q_max if q_max > 0 else 1)
        ax2.set_ylabel("Q [m³/s]", color=c_q, fontweight="bold")
        ax2.tick_params(axis="y", colors=c_q)

        ax3 = ax.twinx()
        ax3.fill_between(hours(p), 0, p.values.squeeze(), color=c_p, alpha=.35, step="post")
        ax3.set_ylim(3 * p_max if p_max > 0 else 1, 0)
        ax3.set_yticks([])
        ax3.text(0.01, 0.95, f"P = {p.values[0, 0]:.1f} mm/h", transform=ax.transAxes,
                 color=c_p, fontsize=8, va="top", fontweight="bold")

        ax.set_title(titles[i] if titles is not None else f"Case {i}", fontsize=9)
        ax.grid(lw=.5)

    for ax in axes[n_cases:]:
        ax.set_visible(False)

    for ax in axes[max(n_cases - ncols, 0):n_cases]:
        ax.set_xlabel("Time [h]")

    plt.tight_layout()
    return fig, axes



def plot_comparison(maps_ref, maps_pred, dep_hr, titles, vmax=4, diff_max=0.25,
                    label="Max. water depth [m]", names=("SFINCS", "RBF")):
    """
    Compare reference and predicted maps, one row per case: reference,
    prediction and their difference (prediction - reference).
    """
    n = len(maps_ref)
    fig, axes = plt.subplots(
        n, 3, figsize=(11, 5 * n + 1), sharex=True, sharey=True, squeeze=False, layout="constrained"
    )
    dep = dep_hr["band_data"].squeeze()

    for i, (ref, pred) in enumerate(zip(maps_ref, maps_pred)):
        im = ref.plot(ax=axes[i, 0], cmap="turbo", vmin=0, vmax=vmax, add_colorbar=False)
        pred.plot(ax=axes[i, 1], cmap="turbo", vmin=0, vmax=vmax, add_colorbar=False)
        im_diff = (pred - ref).plot(ax=axes[i, 2], cmap="RdBu_r", vmin=-diff_max, vmax=diff_max, add_colorbar=False)

        for j, ax in enumerate(axes[i]):
            ax.contour(dep.x, dep.y, dep, levels=[0], colors="k", linewidths=.5)
            ax.set_xlim(float(ref.x.min()), float(ref.x.max()))
            ax.set_ylim(float(ref.y.min()), float(ref.y.max()))
            ax.set_aspect("equal")
            ax.set(xlabel="", ylabel="")
        axes[i, 0].set_title(names[0], fontsize=10)
        axes[i, 1].set_title(f"{titles[i]}\n{names[1]}", fontsize=10)
        axes[i, 2].set_title(f"{names[1]} − {names[0]}", fontsize=10)

    fig.colorbar(im, ax=axes[:, :2], location="bottom", shrink=0.6, label=label)
    fig.colorbar(im_diff, ax=axes[:, 2], location="bottom", shrink=0.9, label="Difference [m]", extend="both")

    return fig, axes
