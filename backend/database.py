"""
Multi-Hospital Database Connection & Isolation Module
Enforces strict multi-tenancy by managing separate SQLite database files (.db) for each hospital facility:
- Hospital A (Tha Ruea): "tha_ruea.db"
- Hospital B (Ruampat):  "ruampat.db"
"""

import sqlite3
import os
from typing import Generator

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Map hospital identifiers (ID, Code, Name) to isolated SQLite database files
HOSPITAL_DB_MAP = {
    "HOSP-A": "tha_ruea.db",
    "TRH": "tha_ruea.db",
    "tha_ruea": "tha_ruea.db",
    "tharuea": "tha_ruea.db",
    "HOSP-B": "ruampat.db",
    "RPH": "ruampat.db",
    "ruampat": "ruampat.db",
}

def get_db_filename(hospital_id: str = "HOSP-A") -> str:
    """Resolves the database filename for a given hospital identifier."""
    if not hospital_id:
        return "tha_ruea.db"
    cleaned_id = str(hospital_id).strip()
    return HOSPITAL_DB_MAP.get(cleaned_id, "tha_ruea.db")

def get_db_path(hospital_id: str = "HOSP-A") -> str:
    """Returns the absolute file system path for the specified hospital database."""
    db_filename = get_db_filename(hospital_id)
    return os.path.join(BASE_DIR, db_filename)

def get_db_connection(hospital_id: str = "HOSP-A") -> sqlite3.Connection:
    """
    Creates and returns a raw SQLite connection for the target hospital database file.
    Guarantees strict isolation so operations for Hospital A never touch Hospital B's .db file.
    """
    db_path = get_db_path(hospital_id)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(hospital_id: str = "HOSP-A"):
    """
    Dynamically initializes database tables and seeds mock inventory data
    for the specified hospital's isolated .db file.
    """
    conn = get_db_connection(hospital_id)
    cursor = conn.cursor()

    # 1. Inventory Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS medicines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hospital_id TEXT NOT NULL,
            name TEXT NOT NULL,
            batch_number TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            expiry_date TEXT NOT NULL,
            storage_status TEXT NOT NULL,
            price_per_unit REAL NOT NULL DEFAULT 0.0
        )
    """)

    # 2. Medicine Usage / FEFO Consumption Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS medicine_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            medicine_id INTEGER NOT NULL,
            quantity_used INTEGER NOT NULL,
            usage_date TEXT NOT NULL,
            FOREIGN KEY (medicine_id) REFERENCES medicines (id) ON DELETE CASCADE
        )
    """)

    # 3. Cold Chain Logistics Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS logistics_shipments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tracking_number TEXT NOT NULL UNIQUE,
            origin TEXT NOT NULL,
            destination TEXT NOT NULL,
            status TEXT NOT NULL,
            temperature REAL NOT NULL,
            humidity REAL NOT NULL,
            progress INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )
    """)

    # 4. Audit Log Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            details TEXT NOT NULL,
            timestamp TEXT NOT NULL
        )
    """)
    conn.commit()

    # Seed mock inventory if medicines table is empty
    cursor.execute("SELECT COUNT(*) FROM medicines")
    if cursor.fetchone()[0] == 0:
        db_filename = get_db_filename(hospital_id)
        hosp_code = "HOSP-A" if db_filename == "tha_ruea.db" else "HOSP-B"

        if db_filename == "tha_ruea.db":
            # Tha Ruea Hospital (Hospital A): Full stock including Morphine & Epinephrine
            seed_data = [
                (hosp_code, "Paracetamol 500mg", "PR-2024-01", 150, "2026-05-10", "Room Temp", 1.50),
                (hosp_code, "Amoxicillin 250mg", "AM-2024-05", 80, "2026-07-05", "Room Temp", 8.50),
                (hosp_code, "Ibuprofen 400mg", "IB-2024-03", 60, "2026-08-15", "Room Temp", 5.00),
                (hosp_code, "Insulin Glargine 100U/mL", "IN-2025-09", 25, "2026-11-20", "Refrigerator", 350.00),
                (hosp_code, "Morphine Injection 10mg/mL", "MP-2025-02", 45, "2027-03-15", "Refrigerator", 120.00),
                (hosp_code, "Epinephrine Injection 1mg/mL", "EP-2025-04", 30, "2026-12-10", "Refrigerator", 95.00),
                (hosp_code, "Metformin 500mg", "MT-2024-11", 120, "2027-04-10", "Room Temp", 4.50),
                (hosp_code, "Atorvastatin 20mg", "AT-2024-07", 8, "2026-07-30", "Room Temp", 12.00),
                (hosp_code, "Vitamin C 500mg", "VC-2024-02", 5, "2026-06-01", "Room Temp", 3.00)
            ]
        else:
            # Ruampat Hospital (Hospital B): Morphine & Epinephrine Out of Stock (0 qty)
            seed_data = [
                (hosp_code, "Paracetamol 500mg", "PR-2024-09", 90, "2026-09-12", "Room Temp", 1.50),
                (hosp_code, "Amoxicillin 250mg", "AM-2024-12", 35, "2026-10-01", "Room Temp", 8.50),
                (hosp_code, "Ibuprofen 400mg", "IB-2024-08", 40, "2027-01-20", "Room Temp", 5.00),
                (hosp_code, "Insulin Glargine 100U/mL", "IN-2025-11", 6, "2026-08-25", "Refrigerator", 350.00),
                (hosp_code, "Morphine Injection 10mg/mL", "MP-OUT-01", 0, "2026-01-01", "Refrigerator", 120.00),
                (hosp_code, "Epinephrine Injection 1mg/mL", "EP-OUT-01", 0, "2026-01-01", "Refrigerator", 95.00),
                (hosp_code, "Aspirin 81mg", "AS-2025-01", 110, "2027-08-01", "Room Temp", 2.00),
                (hosp_code, "Salbutamol Inhaler 100mcg", "SB-2025-03", 15, "2026-12-05", "Room Temp", 180.00)
            ]

        cursor.executemany("""
            INSERT INTO medicines (hospital_id, name, batch_number, quantity, expiry_date, storage_status, price_per_unit)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, seed_data)
        conn.commit()

        # Write audit log entry for initialization
        cursor.execute("""
            INSERT INTO audit_logs (action, details, timestamp)
            VALUES (?, ?, DATETIME('now'))
        """, ("DATABASE_INITIALIZED", f"Initialized isolated database: {db_filename}"))
        conn.commit()

    # Seed mock medicine usage history if medicine_usage table is empty
    cursor.execute("SELECT COUNT(*) FROM medicine_usage")
    if cursor.fetchone()[0] == 0:
        cursor.execute("SELECT id FROM medicines LIMIT 1")
        row = cursor.fetchone()
        med_id = row[0] if row else 1

        db_filename = get_db_filename(hospital_id)
        if db_filename == "tha_ruea.db":
            # Tha Ruea Hospital usage trend: [140, 210, 185, 230, 290, 310]
            usage_seed = [
                (med_id, 140, "2026-02-15"),
                (med_id, 210, "2026-03-15"),
                (med_id, 185, "2026-04-15"),
                (med_id, 230, "2026-05-15"),
                (med_id, 290, "2026-06-15"),
                (med_id, 310, "2026-07-15")
            ]
        else:
            # Ruampat Hospital usage trend: [65, 90, 80, 110, 130, 145]
            usage_seed = [
                (med_id, 65, "2026-02-15"),
                (med_id, 90, "2026-03-15"),
                (med_id, 80, "2026-04-15"),
                (med_id, 110, "2026-05-15"),
                (med_id, 130, "2026-06-15"),
                (med_id, 145, "2026-07-15")
            ]

        cursor.executemany("""
            INSERT INTO medicine_usage (medicine_id, quantity_used, usage_date)
            VALUES (?, ?, ?)
        """, usage_seed)
        conn.commit()

    conn.close()

def init_all_dbs():
    """Initializes both tha_ruea.db and ruampat.db upon backend application startup."""
    init_db("HOSP-A")
    init_db("HOSP-B")

# Auto-execute database initialization on module load so tha_ruea.db and ruampat.db are created immediately
init_all_dbs()

if __name__ == "__main__":
    init_all_dbs()
    print("All isolated hospital databases (tha_ruea.db & ruampat.db) initialized successfully.")
