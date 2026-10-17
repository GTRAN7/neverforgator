"""Share a palace with everyone (or stop sharing it), e.g. a campus route the team built:

    python -m app.studio.make_template <palaceId>        everyone can see it and start their own copy
    python -m app.studio.make_template <palaceId> off    back to a normal palace

The id is in the app's URL: #/palace/<id>. Build the route in the app first (rooms + stops).
"""
import sys

from app.db import SessionLocal
from app.models import Palace

if len(sys.argv) < 2 or not sys.argv[1].isdigit():
    sys.exit(__doc__)
with SessionLocal() as db:
    palace = db.get(Palace, int(sys.argv[1]))
    if not palace:
        sys.exit(f"No palace with id {sys.argv[1]}")
    palace.template = sys.argv[2:3] != ["off"]
    db.commit()
    print(f"{palace.title} ({palace.id}) is {'now shared' if palace.template else 'no longer shared'}.")
