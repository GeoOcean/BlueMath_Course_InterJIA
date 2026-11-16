import numpy as np
import pandas as pd


def _time_index(reference_time, hours):
    """Convert hours relative to `reference_time` into a DatetimeIndex."""
    index = pd.Timestamp(reference_time) + pd.to_timedelta(hours, unit="h")
    index.name = "time"
    return index


def triangular_twl_minimum(twl_max, ntr_mean):
    """
    Minimum of the daily triangular TWL signal.

    The astronomical tide is assumed symmetric around the mean sea level and
    the non-tidal residual (surge + setup, NTR) constant during the day:

        TWL_max = A + NTR,   TWL_min = -A + NTR   →   TWL_min = 2·NTR − TWL_max
    """
    return 2 * ntr_mean - np.asarray(twl_max)


def build_twl_forcings(
    twl_max,
    twl_min,
    reference_time,
    duration_hours=24,
    peak_hour=12,
    dt_minutes=10,
):
    """
    Build triangular total water level (TWL) forcings for SFINCS (`sfincs.bzs`).

    The water level rises linearly from `twl_min` at t = 0 to `twl_max` at
    `peak_hour` and goes back to `twl_min` at `duration_hours`.

    Returns
    -------
    list[pd.DataFrame]
        One water-level time series per case (column 0 = boundary point 0).
    """
    hours = np.arange(0, duration_hours * 60 + dt_minutes, dt_minutes) / 60
    index = _time_index(reference_time, hours)

    # Triangle with value 0 at the start/end of the day and 1 at the peak
    shape = np.interp(hours, [0, peak_hour, duration_hours], [0, 1, 0])

    return [
        pd.DataFrame({0: low + (high - low) * shape}, index=index)
        for high, low in zip(twl_max, twl_min)
    ]


def build_precipitation_forcings(
    precipitation,
    reference_time,
    duration_hours=24,
):
    """
    Build constant-intensity rainfall forcings for SFINCS (`sfincs.precip`).

    The daily rainfall depth is spread uniformly over the day. The series
    ends at zero, since SFINCS keeps the last value until the end of the
    simulation.

    Returns
    -------
    list[pd.DataFrame]
        Rainfall intensity [mm/h] of each case.
    """
    hours = np.array([0, duration_hours - 1 / 60, duration_hours])
    index = _time_index(reference_time, hours)

    return [
        pd.DataFrame(
            {"precip": [p / duration_hours, p / duration_hours, 0.0]},
            index=index,
        )
        for p in precipitation
    ]


def random_peak_lags(n_cases, min_lag=2.0, max_lag=6.0, seed=0):
    """
    Random time lag [h] between the river and the sea peaks of each case.

    The lag is uniform in [min_lag, max_lag] with a random sign, so the river
    peak arrives before or after the TWL peak but never at the same time.
    """
    rng = np.random.default_rng(seed)
    return rng.choice([-1, 1], size=n_cases) * rng.uniform(min_lag, max_lag, size=n_cases)


def scs_hydrograph_shape(uh, time_hours, time_to_peak, peak_hour=None):
    """
    Dimensionless SCS unit hydrograph q/qp evaluated at `time_hours`.

    The hydrograph starts rising at `peak_hour - time_to_peak` (by default
    at t = 0) and peaks at `peak_hour`.
    """
    peak_hour = time_to_peak if peak_hour is None else peak_hour
    start = peak_hour - time_to_peak

    return np.interp(
        (np.asarray(time_hours) - start) / time_to_peak,
        uh["t/tp"].values,
        uh["q/qp"].values,
        left=0.0,
        right=0.0,
    )


def build_discharge_forcings(
    discharge,
    uh,
    reference_time,
    time_to_peak=12,
    peak_hours=None,
    duration_hours=24,
    dt_minutes=10,
):
    """
    Build river discharge forcings for SFINCS (`sfincs.dis`) from daily
    maximum discharges, using the SCS dimensionless unit hydrograph.

    The time axis of the unit hydrograph is scaled with `time_to_peak`, and
    the daily maximum discharge is the peak of the hydrograph, reached at
    the hour `peak_hours` of each case:

        Q(t) = Q_max · f((t - t_peak + tp) / tp)

    Parameters
    ----------
    discharge : array-like
        Daily maximum discharge of each case [m3/s].
    uh : pd.DataFrame
        SCS dimensionless unit hydrograph with columns `t/tp` and `q/qp`.
    time_to_peak : float, optional
        Rising time of the hydrograph [h].
    peak_hours : array-like, optional
        Hour of the discharge peak of each case. By default `time_to_peak`.

    Returns
    -------
    list[pd.DataFrame]
        Discharge time series [m3/s] of each case (column 1 = river source 1).
    """
    hours = np.arange(0, duration_hours * 60 + dt_minutes, dt_minutes) / 60
    index = _time_index(reference_time, hours)

    discharge = np.asarray(discharge)
    if peak_hours is None:
        peak_hours = np.full(len(discharge), time_to_peak)

    return [
        pd.DataFrame({1: q * scs_hydrograph_shape(uh, hours, time_to_peak, t_peak)}, index=index)
        for q, t_peak in zip(discharge, peak_hours)
    ]
