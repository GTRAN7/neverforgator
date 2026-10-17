"""NeverForgator studio: memory palaces built inside real rooms (panoramas, photos, 3D scans).

    files.py       where room files, crops and pictures live on disk
    cache.py       "never pay twice": every Gemini result is saved under a hash of its inputs
    gemini.py      every Gemini call (the only place that uses the API key)
    placeholder.py free SVG sketch cards when there are no real pictures
    panorama.py    photo coordinates <-> 3D directions
    fill.py        notes -> ideas -> stops -> scenes (the memory-athlete workflow)
    limits.py      fair-use limits per user
    serialize.py   palaces as JSON for the frontend
    router.py      the /api/... endpoints the frontend calls
"""
