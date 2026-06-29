import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "medical_inventory.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Create the medicines table with the price_per_unit column included
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS medicines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            batch_number TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            expiry_date TEXT NOT NULL,
            storage_status TEXT NOT NULL,
            price_per_unit REAL NOT NULL DEFAULT 0.0
        )
    """)
    conn.commit()

    # --- Dynamic Schema Migration ---
    # If the database file already existed with an older schema (missing price_per_unit),
    # we detect it via PRAGMA table_info and dynamically ALTER the table so existing
    # user data is preserved without crashes.
    cursor.execute("PRAGMA table_info(medicines)")
    columns = [row[1] for row in cursor.fetchall()]  # row[1] is the column name

    if "price_per_unit" not in columns:
        cursor.execute("ALTER TABLE medicines ADD COLUMN price_per_unit REAL NOT NULL DEFAULT 0.0")
        conn.commit()
        print("[Migration] Added 'price_per_unit' column to existing medicines table.")

    # Check if we need to seed the medicines table
    cursor.execute("SELECT COUNT(*) FROM medicines")
    count = cursor.fetchone()[0]
    if count == 0:
        # Today is 2026-06-23. Seeding dates relative to this.
        seed_data = [
            ("Paracetamol", "PR-2024-01", 150, "2026-05-10", "Room Temp", 1.50),
            ("Amoxicillin", "AM-2024-05", 80, "2026-07-05", "Room Temp", 8.50),
            ("Ibuprofen", "IB-2024-03", 60, "2026-08-15", "Room Temp", 5.00),
            ("Insulin Glargine", "IN-2025-09", 4, "2026-11-20", "Refrigerator", 350.00),
            ("Metformin", "MT-2024-11", 120, "2027-04-10", "Room Temp", 4.50),
            ("Atorvastatin", "AT-2024-07", 8, "2026-07-30", "Room Temp", 12.00),
            ("Vitamin C", "VC-2024-02", 5, "2026-06-01", "Room Temp", 3.00),
            ("Aspirin", "AS-2025-01", 200, "2027-08-01", "Room Temp", 2.00)
        ]

        cursor.executemany("""
            INSERT INTO medicines (name, batch_number, quantity, expiry_date, storage_status, price_per_unit)
            VALUES (?, ?, ?, ?, ?, ?)
        """, seed_data)
        conn.commit()

    # Create the medicine_usage table if it does not exist using a proper Relational Foreign Key
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS medicine_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            medicine_id INTEGER NOT NULL,
            quantity_used INTEGER NOT NULL,
            usage_date TEXT NOT NULL,
            FOREIGN KEY (medicine_id) REFERENCES medicines (id) ON DELETE CASCADE
        )
    """)
    conn.commit()

    # Check if we need to seed the medicine_usage table
    cursor.execute("SELECT COUNT(*) FROM medicine_usage")
    usage_count = cursor.fetchone()[0]
    if usage_count == 0:
        cursor.execute("SELECT id FROM medicines LIMIT 1")
        row = cursor.fetchone()
        if row:
            med_id = row[0]
            # Seed usage data representing total medicine items consumed over the last 6 months relative to today (June 2026)
            # Jan: 120, Feb: 185, Mar: 140, Apr: 210, May: 175, Jun: 240
            usage_seed = [
                (med_id, 120, "2026-01-15"),
                (med_id, 185, "2026-02-15"),
                (med_id, 140, "2026-03-15"),
                (med_id, 210, "2026-04-15"),
                (med_id, 175, "2026-05-15"),
                (med_id, 240, "2026-06-15")
            ]
            cursor.executemany("""
                INSERT INTO medicine_usage (medicine_id, quantity_used, usage_date)
                VALUES (?, ?, ?)
            """, usage_seed)
            conn.commit()

    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at:", DB_PATH)
