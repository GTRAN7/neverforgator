import copy

from tests.conftest import SAMPLE_PALACE, as_user


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_locations_are_public_and_in_route_order(client):
    r = client.get("/locations")
    assert r.status_code == 200
    orders = [loc["route_order"] for loc in r.json()]
    assert orders == sorted(orders)
    assert len(orders) >= 2


def test_me_creates_user_once(client):
    a = client.get("/me", headers=as_user("alice")).json()
    b = client.get("/me", headers=as_user("alice")).json()
    assert a["id"] == b["id"]
    assert a["auth0_sub"] == "dev|alice"


def test_create_open_list_delete(client):
    alice = as_user("alice")
    r = client.post("/palaces", json=SAMPLE_PALACE, headers=alice)
    assert r.status_code == 201, r.text
    pid = r.json()["id"]

    palace = client.get(f"/palaces/{pid}", headers=alice).json()
    assert palace["title"] == "Bio 101: Cells"
    assert [s["stop_order"] for s in palace["stops"]] == [1, 2]
    # Auto-placement: concept 1 goes to route stop 1, concept 2 to route stop 2.
    route = client.get("/locations").json()
    assert palace["stops"][0]["location"]["name"] == route[0]["name"]
    assert palace["stops"][1]["location"]["name"] == route[1]["name"]
    assert len(palace["stops"][0]["questions"]) == 2
    assert palace["stops"][0]["questions"][1]["choices"][0] == "Library West"

    listing = client.get("/palaces", headers=alice).json()
    assert listing == [
        {"id": pid, "title": "Bio 101: Cells", "created_at": listing[0]["created_at"], "stop_count": 2}
    ]

    assert client.delete(f"/palaces/{pid}", headers=alice).status_code == 204
    assert client.get(f"/palaces/{pid}", headers=alice).status_code == 404
    assert client.get("/palaces", headers=alice).json() == []


def test_users_cannot_see_each_others_palaces(client):
    pid = client.post("/palaces", json=SAMPLE_PALACE, headers=as_user("alice")).json()["id"]
    bob = as_user("bob")
    assert client.get(f"/palaces/{pid}", headers=bob).status_code == 404
    assert client.delete(f"/palaces/{pid}", headers=bob).status_code == 404
    assert client.get("/palaces", headers=bob).json() == []
    assert client.post(f"/palaces/{pid}/attempts", json={"score": 1, "total": 2}, headers=bob).status_code == 404
    # Alice's palace is still there.
    assert client.get(f"/palaces/{pid}", headers=as_user("alice")).status_code == 200


def test_bad_input_is_rejected(client):
    alice = as_user("alice")
    no_stops = {"title": "Empty", "stops": []}
    assert client.post("/palaces", json=no_stops, headers=alice).status_code == 422

    bad_mc = copy.deepcopy(SAMPLE_PALACE)
    bad_mc["stops"][0]["questions"][1]["answer"] = "Not a choice"
    assert client.post("/palaces", json=bad_mc, headers=alice).status_code == 422

    bad_location = copy.deepcopy(SAMPLE_PALACE)
    bad_location["stops"][0]["location_id"] = 99999
    assert client.post("/palaces", json=bad_location, headers=alice).status_code == 400

    too_many = {"title": "Huge", "stops": [{"concept": f"c{i}", "association": "x"} for i in range(500)]}
    assert client.post("/palaces", json=too_many, headers=alice).status_code == 400

    # Nothing half-saved by the failed requests.
    assert client.get("/palaces", headers=alice).json() == []


def test_quiz_attempts(client):
    alice = as_user("alice")
    pid = client.post("/palaces", json=SAMPLE_PALACE, headers=alice).json()["id"]
    assert client.post(f"/palaces/{pid}/attempts", json={"score": 2, "total": 3}, headers=alice).status_code == 201
    assert client.post(f"/palaces/{pid}/attempts", json={"score": 3, "total": 3}, headers=alice).status_code == 201
    assert client.post(f"/palaces/{pid}/attempts", json={"score": 5, "total": 3}, headers=alice).status_code == 422
    history = client.get(f"/palaces/{pid}/attempts", headers=alice).json()
    assert [(a["score"], a["total"]) for a in history] == [(2, 3), (3, 3)]

    # Deleting the palace deletes its attempts too.
    client.delete(f"/palaces/{pid}", headers=alice)
    assert client.get(f"/palaces/{pid}/attempts", headers=alice).status_code == 404
