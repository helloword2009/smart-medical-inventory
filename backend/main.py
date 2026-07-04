import datetime
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .database import get_db_connection, init_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize the SQLite database and seed it on startup
    init_db()
    yield

app = FastAPI(
    title="Smart Medical Inventory API",
    description="Backend API for managing medicine inventory and tracking expiry alerts.",
    version="2.0.0",
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

@app.get("/api/medicines")
def get_medicines(search: str = None):
    """
    Get medicines sorted by FEFO (First-Expired, First-Out).
    Supports searching by medicine name.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    if search:
        # Simple case-insensitive search by name
        cursor.execute(
            "SELECT * FROM medicines WHERE name LIKE ? ORDER BY expiry_date ASC",
            (f"%{search}%",)
        )
    else:
        cursor.execute("SELECT * FROM medicines ORDER BY expiry_date ASC")
    
    rows = cursor.fetchall()
    conn.close()
    
    return [dict(row) for row in rows]

@app.get("/api/alerts")
def get_alerts():
    """
    Fetch alerts:
    - Expired: Expiry date is today or in the past (Red status)
    - Near Expiry: Expiry date is within 90 days from today and not expired (Yellow status)
    - Low Stock: Quantity is less than 10 and not expired (Yellow status)
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    today = datetime.date.today()
    today_str = today.isoformat()
    near_expiry_limit = (today + datetime.timedelta(days=90)).isoformat()
    
    # 1. Expired (Critical / Red)
    cursor.execute(
        "SELECT * FROM medicines WHERE expiry_date <= ? ORDER BY expiry_date ASC",
        (today_str,)
    )
    expired = [dict(row) for row in cursor.fetchall()]
    
    # 2. Near Expiry (Yellow - within 90 days, not expired)
    cursor.execute(
        "SELECT * FROM medicines WHERE expiry_date > ? AND expiry_date <= ? ORDER BY expiry_date ASC",
        (today_str, near_expiry_limit)
    )
    near_expiry = [dict(row) for row in cursor.fetchall()]
    
    # 3. Low Stock (Yellow - quantity < 10, not expired)
    cursor.execute(
        "SELECT * FROM medicines WHERE quantity < ? AND expiry_date > ? ORDER BY quantity ASC",
        (10, today_str)
    )
    low_stock = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    return {
        "expired": expired,
        "near_expiry": near_expiry,
        "low_stock": low_stock
    }

@app.get("/api/dashboard-summary")
def get_dashboard_summary():
    """
    Dashboard summary endpoint providing aggregated statistics:
    - total_items: Count of unique medicine names.
    - critical_alerts: Count of items where expiry_date is strictly before today (expired).
    - near_expiry: Count of items where expiry_date is between 0 and 90 days from today.
    - prevented_loss_value: Sum of (quantity * price_per_unit) for all near-expiry items.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    today = datetime.date.today()
    today_str = today.isoformat()
    near_expiry_limit = (today + datetime.timedelta(days=90)).isoformat()

    # 1. Total unique medicine names
    cursor.execute("SELECT COUNT(DISTINCT name) FROM medicines")
    total_items = cursor.fetchone()[0]

    # 2. Critical alerts: expiry_date is strictly before today
    cursor.execute(
        "SELECT COUNT(*) FROM medicines WHERE expiry_date < ?",
        (today_str,)
    )
    critical_alerts = cursor.fetchone()[0]

    # 3. Near expiry: expiry_date is between today (inclusive) and today+90 days (inclusive),
    #    but NOT expired (strictly > today would miss today, so we use >= today and <= limit).
    #    Per the spec: "between 0 and 90 days from today" means not yet expired.
    cursor.execute(
        "SELECT COUNT(*) FROM medicines WHERE expiry_date >= ? AND expiry_date <= ?",
        (today_str, near_expiry_limit)
    )
    near_expiry = cursor.fetchone()[0]

    # 4. Prevented loss value: sum of quantity * price_per_unit for near-expiry items
    cursor.execute(
        "SELECT COALESCE(SUM(quantity * price_per_unit), 0) FROM medicines WHERE expiry_date >= ? AND expiry_date <= ?",
        (today_str, near_expiry_limit)
    )
    prevented_loss_value = round(cursor.fetchone()[0], 2)

    conn.close()

    return {
        "total_items": total_items,
        "critical_alerts": critical_alerts,
        "near_expiry": near_expiry,
        "prevented_loss_value": prevented_loss_value
    }

@app.get("/api/usage-trends")
def get_usage_trends():
    """
    Get dynamic usage trends representing total medicine items consumed over the last 6 months.
    """
    today = datetime.date.today()
    
    # Calculate the past 6 months dynamically (ending in the current month)
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
    conn = get_db_connection()
    cursor = conn.cursor()
    
    for year, month in months:
        # Format the query prefix for YYYY-MM
        prefix = f"{year:04d}-{month:02d}%"
        cursor.execute(
            "SELECT COALESCE(SUM(quantity_used), 0) FROM medicine_usage WHERE usage_date LIKE ?",
            (prefix,)
        )
        total = cursor.fetchone()[0]
        data.append(total)
        
    conn.close()
    
    return {"labels": labels, "data": data}

@app.post("/api/medicines", status_code=201)
def add_medicine(med: MedicineCreate):
    """
    Insert a new medicine into the inventory.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO medicines (name, batch_number, quantity, expiry_date, storage_status, price_per_unit)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (med.name, med.batch_number, med.quantity, med.expiry_date, med.storage_status, med.price_per_unit)
        )
        conn.commit()
        new_id = cursor.lastrowid
        conn.close()
        return {
            "id": new_id,
            "message": "Medicine added successfully",
            "data": {
                "id": new_id,
                "name": med.name,
                "batch_number": med.batch_number,
                "quantity": med.quantity,
                "expiry_date": med.expiry_date,
                "storage_status": med.storage_status,
                "price_per_unit": med.price_per_unit
            }
        }
    except Exception as e:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")

# In-memory tracking simulation state
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
    Get simulated shipment tracking status, telemetry, and coordinates.
    Progresses along the route from Bangkok to Nakhon Sawan with each request.
    """
    import random
    
    step = tracking_state["step"]
    max_steps = tracking_state["max_steps"]
    
    # Progress fraction
    fraction = step / max_steps
    
    # Linear interpolation of GPS coordinates
    lat = tracking_state["start_lat"] + fraction * (tracking_state["end_lat"] - tracking_state["start_lat"])
    lng = tracking_state["start_lng"] + fraction * (tracking_state["end_lng"] - tracking_state["start_lng"])
    
    # Temperature around 4°C (e.g., 3.5°C to 4.5°C) and Humidity around 50% (e.g., 48% to 52%)
    temperature = round(4.0 + random.uniform(-0.5, 0.5), 1)
    humidity = round(50.0 + random.uniform(-2.0, 2.0), 1)
    
    # Status progression
    if step == 0:
        status = "In Transit (Departed Bangkok Warehouse)"
    elif step < max_steps:
        status = "In Transit"
    else:
        status = "Delivered (Nakhon Sawan Facility)"
        
    # Increment step for next fetch, wrap around if already delivered
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

