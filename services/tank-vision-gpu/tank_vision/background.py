"""Be a polite background job on the house PC.

Measured 2026-09-16: three indexers at normal priority plus label propagation
made POWER stutter while the Tank stack (MediaMTX transcodes, camera bridges,
the live detector) and the operator's own apps were running. Offline work must
always lose to live work.
"""

from __future__ import annotations

import os
import sys


def make_polite(cpu_threads: int = 2) -> None:
    """Below-normal OS priority and a small thread budget for numeric libraries."""
    if sys.platform == "win32":
        import ctypes

        BELOW_NORMAL_PRIORITY_CLASS = 0x00004000
        handle = ctypes.windll.kernel32.GetCurrentProcess()
        ctypes.windll.kernel32.SetPriorityClass(handle, BELOW_NORMAL_PRIORITY_CLASS)
    else:
        try:
            os.nice(10)
        except OSError:
            pass
    try:
        import cv2

        cv2.setNumThreads(1)
    except ImportError:
        pass
    try:
        import torch

        torch.set_num_threads(cpu_threads)
    except ImportError:
        pass
