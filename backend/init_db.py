"""
Standalone Database Initialization Script for Multi-Tenant Medical Inventory
Generates two separate SQLite database files inside the backend/ directory:
1. backend/tha_ruea.db (Tha Ruea Hospital)
2. backend/ruampat.db  (Ruampat Hospital)
"""

import os
import sys

# Ensure backend directory is in python search path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from database import init_all_dbs, get_db_path

# Optional SQLAlchemy Base definition for ORM compatibility
try:
    from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey
    from sqlalchemy.orm import declarative_base

    Base = declarative_base()

    class Medicine(Base):
        __tablename__ = "medicines"
        id = Column(Integer, primary_key=True, autoincrement=True)
        hospital_id = Column(String, nullable=False)
        name = Column(String, nullable=False)
        batch_number = Column(String, nullable=False)
        quantity = Column(Integer, nullable=False)
        expiry_date = Column(String, nullable=False)
        storage_status = Column(String, nullable=False)
        price_per_unit = Column(Float, nullable=False, default=0.0)

    class MedicineUsage(Base):
        __tablename__ = "medicine_usage"
        id = Column(Integer, primary_key=True, autoincrement=True)
        medicine_id = Column(Integer, ForeignKey("medicines.id"), nullable=False)
        quantity_used = Column(Integer, nullable=False)
        usage_date = Column(String, nullable=False)

    class LogisticsShipment(Base):
        __tablename__ = "logistics_shipments"
        id = Column(Integer, primary_key=True, autoincrement=True)
        tracking_number = Column(String, unique=True, nullable=False)
        origin = Column(String, nullable=False)
        destination = Column(String, nullable=False)
        status = Column(String, nullable=False)
        temperature = Column(Float, nullable=False)
        humidity = Column(Float, nullable=False)
        progress = Column(Integer, default=0)
        created_at = Column(String, nullable=False)

    class AuditLog(Base):
        __tablename__ = "audit_logs"
        id = Column(Integer, primary_key=True, autoincrement=True)
        action = Column(String, nullable=False)
        details = Column(String, nullable=False)
        timestamp = Column(String, nullable=False)

    HAS_SQLALCHEMY = True
except ImportError:
    HAS_SQLALCHEMY = False
    Base = None

def run_init():
    print("=" * 65)
    print("Initializing Multi-Tenant Hospital SQLite Databases...")
    print("=" * 65)

    path_a = get_db_path("HOSP-A")
    path_b = get_db_path("HOSP-B")

    print(f"Hospital 1 (Tha Ruea): {path_a}")
    print(f"Hospital 2 (Ruampat) : {path_b}")
    print("-" * 65)

    if HAS_SQLALCHEMY and Base:
        try:
            engine_a = create_engine(f"sqlite:///{path_a}")
            engine_b = create_engine(f"sqlite:///{path_b}")
            Base.metadata.create_all(bind=engine_a)
            Base.metadata.create_all(bind=engine_b)
            print("[SQLAlchemy Engine] Executed Base.metadata.create_all() for both database engines.")
        except Exception as e:
            print(f"[SQLAlchemy Warning] {e}")

    # Create tables & insert initial mock seed data
    init_all_dbs()

    print("=" * 65)
    print("SUCCESS: Both SQLite database files have been generated successfully!")
    print(f"  1. tha_ruea.db -> {path_a}")
    print(f"  2. ruampat.db  -> {path_b}")
    print("=" * 65)

if __name__ == "__main__":
    run_init()
