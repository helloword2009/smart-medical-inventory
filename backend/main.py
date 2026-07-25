import datetime
import os
from typing import Optional, Generator
import sqlite3
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Header, Query, Depends, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .database import get_db_connection, init_all_dbs, get_db_filename

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize all isolated SQLite databases (tha_ruea.db & ruampat.db) and seed tables on startup
    init_all_dbs()
    yield

app = FastAPI(
    title="Smart Medical Inventory API",
    description="Multi-hospital tenant isolated backend API for inventory, expiry alerts, and cold chain telemetry.",
    version="2.5.0",
    lifespan=lifespan
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files directory
app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")

@app.get("/")
def read_root():
    return FileResponse(os.path.join("frontend", "index.html"))

# Pydantic schema for adding a medicine
class MedicineCreate(BaseModel):
    name: str = Field(..., min_length=1, description="Name of the medicine")
    batch_number: str = Field(..., min_length=1, description="Unique batch number")
    quantity: int = Field(..., ge=0, description="Quantity in stock")
    expiry_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="Expiry date in YYYY-MM-DD format")
    storage_status: str = Field(..., min_length=1, description="Storage condition status (e.g. Room Temp, Refrigerator)")
    price_per_unit: float = Field(..., ge=0.0, description="Price per unit in Thai Baht (฿)")

# ============================================================================
# MULTI-HOSPITAL DEPENDENCY INJECTION & TENANT ISOLATION
# ============================================================================

def get_hospital_id_from_request(
    x_hospital_id: Optional[str] = Header(None, alias="X-Hospital-ID"),
    hospital_scope: Optional[str] = Header(None, alias="Hospital-Scope"),
    hospital_id: Optional[str] = Query(None)
) -> str:
    """
    Extracts the active hospital scope from request headers or query parameter.
    Defaults to 'HOSP-A' (Tha Ruea Hospital) if unspecified.
    """
    scope = x_hospital_id or hospital_scope or hospital_id or "HOSP-A"
    return scope.strip()

def get_db(
    hospital_id: str = Depends(get_hospital_id_from_request)
) -> Generator[sqlite3.Connection, None, None]:
    """
    FastAPI dependency that yields an isolated SQLite database connection
    corresponding strictly to the requested hospital's database file (tha_ruea.db vs ruampat.db).
    """
    conn = get_db_connection(hospital_id)
    try:
        yield conn
    finally:
        conn.close()

# ============================================================================
# API ENDPOINTS (DATA ISOLATED BY HOSPITAL DATABASE FILE)
# ============================================================================

@app.get("/api/medicines")
def get_medicines(
    search: Optional[str] = None,
    db: sqlite3.Connection = Depends(get_db)
):
    """
    Fetch medicines sorted by FEFO (First-Expired, First-Out)
    from the target hospital's isolated database file.
    """
    cursor = db.cursor()
    if search:
        cursor.execute(
            "SELECT * FROM medicines WHERE name LIKE ? ORDER BY expiry_date ASC",
            (f"%{search}%",)
        )
    else:
        cursor.execute("SELECT * FROM medicines ORDER BY expiry_date ASC")
    
    rows = cursor.fetchall()
    return [dict(row) for row in rows]

@app.get("/api/alerts")
def get_alerts(
    db: sqlite3.Connection = Depends(get_db)
):
    """
    Fetch critical alerts and warnings from the target hospital's isolated database file:
    - Expired / Out of Stock: Expiry date past or Qty == 0 (Red status)
    - Near Expiry: Expiry date within 90 days and Qty > 0 (Yellow status)
    - Low Stock: Quantity < 10 and Qty > 0 (Yellow status)
    """
    cursor = db.cursor()
    today = datetime.date.today()
    today_str = today.isoformat()
    near_expiry_limit = (today + datetime.timedelta(days=90)).isoformat()
    
    # 1. Expired or 0 Qty Out of Stock
    cursor.execute(
        "SELECT * FROM medicines WHERE expiry_date <= ? OR quantity = 0 ORDER BY expiry_date ASC",
        (today_str,)
    )
    expired = [dict(row) for row in cursor.fetchall()]
    
    # 2. Near Expiry (within 90 days, not expired, in stock)
    cursor.execute(
        "SELECT * FROM medicines WHERE expiry_date > ? AND expiry_date <= ? AND quantity > 0 ORDER BY expiry_date ASC",
        (today_str, near_expiry_limit)
    )
    near_expiry = [dict(row) for row in cursor.fetchall()]
    
    # 3. Low Stock (quantity < 10, not expired, in stock)
    cursor.execute(
        "SELECT * FROM medicines WHERE quantity < ? AND quantity > 0 AND expiry_date > ? ORDER BY quantity ASC",
        (10, today_str)
    )
    low_stock = [dict(row) for row in cursor.fetchall()]
    
    return {
        "expired": expired,
        "near_expiry": near_expiry,
        "low_stock": low_stock
    }

@app.get("/api/dashboard-summary")
def get_dashboard_summary(
    db: sqlite3.Connection = Depends(get_db)
):
    """
    Aggregated dashboard summary statistics computed from the target hospital's isolated database.
    """
    cursor = db.cursor()
    today = datetime.date.today()
    today_str = today.isoformat()
    near_expiry_limit = (today + datetime.timedelta(days=90)).isoformat()

    cursor.execute("SELECT COUNT(DISTINCT name) FROM medicines")
    total_items = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM medicines WHERE expiry_date < ? OR quantity = 0", (today_str,))
    critical_alerts = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM medicines WHERE expiry_date >= ? AND expiry_date <= ? AND quantity > 0", (today_str, near_expiry_limit))
    near_expiry = cursor.fetchone()[0]

    cursor.execute("SELECT COALESCE(SUM(quantity * price_per_unit), 0) FROM medicines WHERE expiry_date >= ? AND expiry_date <= ? AND quantity > 0", (today_str, near_expiry_limit))
    prevented_loss_value = round(cursor.fetchone()[0], 2)

    return {
        "total_items": total_items,
        "critical_alerts": critical_alerts,
        "near_expiry": near_expiry,
        "prevented_loss_value": prevented_loss_value
    }

@app.get("/api/usage-trends")
def get_usage_trends(
    db: sqlite3.Connection = Depends(get_db)
):
    """
    Dynamic 6-month usage trends queried from the target hospital's isolated database.
    """
    today = datetime.date.today()
    months = []
    for i in range(5, -1, -1):
        year = today.year
        month = today.month - i
        if month <= 0:
            month += 12
            year -= 1
        months.append((year, month))
        
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    labels = [month_names[m - 1] for y, m in months]
    
    data = []
    cursor = db.cursor()
    
    for year, month in months:
        prefix = f"{year:04d}-{month:02d}%"
        cursor.execute(
            "SELECT COALESCE(SUM(quantity_used), 0) FROM medicine_usage WHERE usage_date LIKE ?",
            (prefix,)
        )
        total = cursor.fetchone()[0]
        data.append(total)
        
    return {"labels": labels, "data": data}

@app.post("/api/medicines", status_code=201)
def add_medicine(
    med: MedicineCreate,
    db: sqlite3.Connection = Depends(get_db),
    hospital_id: str = Depends(get_hospital_id_from_request)
):
    """
    Insert a new medicine into the active hospital's isolated database file.
    """
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO medicines (hospital_id, name, batch_number, quantity, expiry_date, storage_status, price_per_unit)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (hospital_id, med.name, med.batch_number, med.quantity, med.expiry_date, med.storage_status, med.price_per_unit)
        )
        db.commit()
        new_id = cursor.lastrowid
        
        # Write audit log
        cursor.execute(
            "INSERT INTO audit_logs (action, details, timestamp) VALUES (?, ?, DATETIME('now'))",
            ("ADD_MEDICINE", f"Added medicine '{med.name}' (Batch: {med.batch_number}) to hospital scope {hospital_id}")
        )
        db.commit()

        return {
            "id": new_id,
            "message": "Medicine added successfully to target hospital database",
            "hospital_id": hospital_id,
            "data": {
                "id": new_id,
                "hospital_id": hospital_id,
                "name": med.name,
                "batch_number": med.batch_number,
                "quantity": med.quantity,
                "expiry_date": med.expiry_date,
                "storage_status": med.storage_status,
                "price_per_unit": med.price_per_unit
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")

# Cold Chain Simulation State
tracking_state = {
    "step": 0,
    "max_steps": 50,
    "start_lat": 13.7563,
    "start_lng": 100.5018,
    "end_lat": 15.7047,
    "end_lng": 100.1372
}

@app.get("/api/tracking")
def get_tracking():
    """
    Simulated cold chain tracking endpoint.
    """
    import random
    
    step = tracking_state["step"]
    max_steps = tracking_state["max_steps"]
    fraction = step / max_steps
    
    lat = tracking_state["start_lat"] + fraction * (tracking_state["end_lat"] - tracking_state["start_lat"])
    lng = tracking_state["start_lng"] + fraction * (tracking_state["end_lng"] - tracking_state["start_lng"])
    
    temperature = round(4.0 + random.uniform(-0.5, 0.5), 1)
    humidity = round(50.0 + random.uniform(-2.0, 2.0), 1)
    
    if step == 0:
        status = "In Transit (Departed Bangkok Warehouse)"
    elif step < max_steps:
        status = "In Transit"
    else:
        status = "Delivered (Destination Facility)"
        
    if tracking_state["step"] < max_steps:
        tracking_state["step"] += 1
    else:
        tracking_state["step"] = 0
        
    return {
        "status": status,
        "telemetry": {
            "temperature": temperature,
            "humidity": humidity
        },
        "location": {
            "latitude": round(lat, 5),
            "longitude": round(lng, 5)
        },
        "progress": round(fraction * 100, 1)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
