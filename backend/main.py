# Entry point so `fastapi dev main.py` (and `uvicorn main:app`) keep working
# from the backend/ folder. The real app lives in app/main.py.
from app.main import app  # noqa: F401
