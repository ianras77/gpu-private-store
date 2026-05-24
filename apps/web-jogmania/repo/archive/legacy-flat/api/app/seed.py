from app.db import SessionLocal
from app.services.seed import seed_demo_data


def main():
    db = SessionLocal()
    try:
        seed_demo_data(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
