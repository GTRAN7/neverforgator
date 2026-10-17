"""Load the campus route from app/data/locations.json into the database.

Run from the backend/ folder:
    python -m app.seed

Safe to run again: existing locations (matched by name) are updated, new ones
are added. Locations you delete from the JSON are "retired": they get a
negative route_order, disappear from the route, but old palaces that used
them keep working. To change the route, edit locations.json and re-run this.
"""
import json
from pathlib import Path

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Location

DATA_FILE = Path(__file__).parent / "data" / "locations.json"


def seed_locations(db) -> int:
    rows = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    existing = {loc.name: loc for loc in db.scalars(select(Location)).all()}

    # route_order must be unique, so temporarily move existing rows out of the
    # way (negative numbers) before writing the new order.
    for loc in existing.values():
        loc.route_order = -loc.id
    db.flush()

    for row in rows:
        loc = existing.get(row["name"])
        if loc is None:
            loc = Location(name=row["name"])
            db.add(loc)
        loc.lat = row["lat"]
        loc.lng = row["lng"]
        loc.route_order = row["route_order"]
        loc.description = row.get("description")
    db.commit()
    return len(rows)


if __name__ == "__main__":
    with SessionLocal() as db:
        count = seed_locations(db)
    print(f"Seeded {count} locations.")
