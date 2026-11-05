"""
CivicSphere Karnataka - Backend API Service
Production FastAPI server ready for Render deployment.
"""

import os
import json
import math
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------
# App Initialization & CORS
# ---------------------------------------------------------------------
app = FastAPI(
    title="CivicSphere Karnataka API",
    description="Autonomous Multi-Agent Civic Operations Platform REST API for Karnataka State",
    version="2.0.0"
)

cors_origins_env = os.getenv("CORS_ORIGINS", "*")
origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent / "data"
COMPLAINTS_FILE = DATA_DIR / "complaints.json"
SEED_FILE = DATA_DIR / "seed_complaints.json"

# In-memory storage for active complaints
complaints_db: Dict[str, Dict[str, Any]] = {}

# ---------------------------------------------------------------------
# Data Persistence Utilities
# ---------------------------------------------------------------------
def load_data():
    global complaints_db
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    target = COMPLAINTS_FILE if COMPLAINTS_FILE.exists() else SEED_FILE
    if target.exists():
        try:
            with open(target, "r", encoding="utf-8") as f:
                items = json.load(f)
                complaints_db = {item["id"]: item for item in items}
                print(f"[CivicSphere API] Loaded {len(complaints_db)} complaints from {target.name}")
        except Exception as e:
            print(f"[CivicSphere API] Error reading {target}: {e}")
            complaints_db = {}
    else:
        complaints_db = {}

def save_data():
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(COMPLAINTS_FILE, "w", encoding="utf-8") as f:
            json.dump(list(complaints_db.values()), f, indent=2)
    except Exception as e:
        print(f"[CivicSphere API] Error saving data: {e}")

@app.on_event("startup")
def startup_event():
    load_data()

# ---------------------------------------------------------------------
# Helper Functions: Boundary, Haversine, SLA
# ---------------------------------------------------------------------
def is_within_karnataka(lat: float, lng: float) -> bool:
    """Bounding box check for Karnataka State."""
    return 11.45 <= lat <= 18.55 and 74.00 <= lng <= 78.65

def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

SLA_HOURS = {
    "P1": 4,
    "P2": 24,
    "P3": 72,
    "P4": 168
}

CATEGORY_METADATA = {
    "pothole": {"dept": "ROADS", "deptName": "Roads & Infrastructure (BBMP / PWD Karnataka)", "icon": "🕳️", "title": "Pothole / Road Damage", "pri": "P1"},
    "footpath": {"dept": "ROADS", "deptName": "Roads & Infrastructure (BBMP / PWD Karnataka)", "icon": "🚶", "title": "Broken Footpath & Slab", "pri": "P3"},
    "garbage": {"dept": "SWM", "deptName": "Solid Waste & Sanitation (Karnataka Municipalities)", "icon": "🗑️", "title": "Overflowing Garbage / Dump", "pri": "P2"},
    "streetlight": {"dept": "ELEC", "deptName": "Karnataka Electricity ESCOMs (BESCOM / HESCOM / MESCOM)", "icon": "💡", "title": "Dark Streetlight / Pole", "pri": "P3"},
    "waterleak": {"dept": "WATER", "deptName": "Water Supply & Drainage (BWSSB / KUWSDB Karnataka)", "icon": "🚰", "title": "Pipe Burst / Water Leakage", "pri": "P1"},
    "tree": {"dept": "GREEN", "deptName": "Karnataka Forest Dept & Urban Parks", "icon": "🌳", "title": "Fallen Tree / Dangerous Branch", "pri": "P2"},
    "signal": {"dept": "TRAFFIC", "deptName": "Karnataka State Police & Traffic Control", "icon": "🚦", "title": "Broken Traffic Signal", "pri": "P1"}
}

# ---------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------
class ComplaintCreateRequest(BaseModel):
    description: str
    lat: float
    lng: float
    category: Optional[str] = "pothole"
    ward: Optional[str] = "151"
    city: Optional[str] = "Bengaluru"
    reporter_name: Optional[str] = "Karnataka Resident"
    reporter_phone: Optional[str] = "9876543210"
    channel: Optional[str] = "Web Portal"
    image_url: Optional[str] = None

class StatusUpdateRequest(BaseModel):
    status: str
    resolution_note: Optional[str] = None
    officer: Optional[str] = None

class VoiceIntentRequest(BaseModel):
    query: str
    language: Optional[str] = "en-IN"

# ---------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------
@app.get("/")
@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "CivicSphere Karnataka API",
        "jurisdiction": "Karnataka State",
        "complaints_loaded": len(complaints_db),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.get("/api/complaints")
def list_complaints(
    department: Optional[str] = None,
    status: Optional[str] = None,
    city: Optional[str] = None,
    priority: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 100
):
    results = list(complaints_db.values())

    if department:
        results = [c for c in results if c.get("department") == department]
    if status:
        results = [c for c in results if c.get("status") == status]
    if city:
        results = [c for c in results if c.get("city", "").lower() == city.lower()]
    if priority:
        results = [c for c in results if c.get("priority") == priority]
    if q:
        query_str = q.lower()
        results = [
            c for c in results
            if query_str in c.get("id", "").lower()
            or query_str in c.get("work_order_id", "").lower()
            or query_str in c.get("title", "").lower()
            or query_str in c.get("description", "").lower()
            or any(query_str in r.get("phone", "") or query_str in r.get("name", "").lower() for r in c.get("reporters", []))
        ]

    # Sort by created_at descending
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return results[:limit]

@app.get("/api/complaints/{complaint_id}")
def get_complaint(complaint_id: str):
    # Match by ID or work_order_id
    item = complaints_db.get(complaint_id)
    if not item:
        for c in complaints_db.values():
            if c.get("work_order_id") == complaint_id:
                return c
            for r in c.get("reporters", []):
                if r.get("phone") == complaint_id:
                    return c
        raise HTTPException(status_code=404, detail="Incident or Master Work Order not found")
    return item

@app.post("/api/complaints")
def create_complaint(req: ComplaintCreateRequest):
    # 1. Karnataka Boundary Verification
    if not is_within_karnataka(req.lat, req.lng):
        return {
            "status": "outside_karnataka",
            "message": "Currently service is not available outside Karnataka. We will reach you soon!",
            "bounds": {"min_lat": 11.45, "max_lat": 18.55, "min_lng": 74.00, "max_lng": 78.65}
        }

    now = datetime.now(timezone.utc)
    cat_key = req.category if req.category in CATEGORY_METADATA else "pothole"
    meta = CATEGORY_METADATA[cat_key]

    # 2. Multi-Channel Deduplication Engine (35-meter cluster radius)
    for c in complaints_db.values():
        if c.get("status") in ["ASSIGNED", "IN_PROGRESS", "ESCALATED"] and c.get("category") == cat_key:
            dist = haversine_meters(req.lat, req.lng, c.get("lat", 0), c.get("lng", 0))
            if dist <= 35.0:
                # Merge duplicate into existing Master Work Order
                new_reporter = {
                    "name": req.reporter_name or "Karnataka Resident",
                    "phone": req.reporter_phone or "9876543210",
                    "channel": req.channel or "Web Portal",
                    "reported_at": now.isoformat(),
                    "description": req.description
                }
                c.setdefault("reporters", []).append(new_reporter)
                c["supporters"] = c.get("supporters", 1) + 1
                c["merged_count"] = len(c["reporters"])
                save_data()
                return {
                    "status": "merged",
                    "message": "Merged into existing Master Work Order within 35m spatial cluster",
                    "work_order_id": c.get("work_order_id"),
                    "master_complaint_id": c["id"],
                    "complaint": c
                }

    # 3. Create Fresh Incident
    next_idx = len(complaints_db) + 1001
    c_id = f"CMP-{next_idx}"
    wo_id = f"WO-{next_idx}"

    sla_h = SLA_HOURS.get(meta["pri"], 24)
    sla_deadline = now + timedelta(hours=sla_h)

    new_comp = {
        "id": c_id,
        "work_order_id": wo_id,
        "title": meta["title"],
        "category": cat_key,
        "categoryIcon": meta["icon"],
        "department": meta["dept"],
        "departmentName": meta["deptName"],
        "description": req.description,
        "priority": meta["pri"],
        "status": "ASSIGNED",
        "lat": req.lat,
        "lng": req.lng,
        "city": req.city or "Bengaluru",
        "ward": req.ward or "151",
        "zone": "Central Division",
        "created_at": now.isoformat(),
        "sla_deadline": sla_deadline.isoformat(),
        "assigned_team": f"{req.ward or 'Ward'} Rapid Response Unit",
        "officer": "Ward Junior Engineer",
        "reporters": [{
            "name": req.reporter_name or "Karnataka Resident",
            "phone": req.reporter_phone or "9876543210",
            "channel": req.channel or "Web Portal",
            "reported_at": now.isoformat(),
            "description": req.description
        }],
        "channel": req.channel or "Web Portal",
        "supporters": 1,
        "duplicate_of": None,
        "merged_count": 1
    }

    complaints_db[c_id] = new_comp
    save_data()

    return {
        "status": "created",
        "message": "Incident triaged and dispatched to municipal crew",
        "complaint_id": c_id,
        "work_order_id": wo_id,
        "complaint": new_comp
    }

@app.patch("/api/complaints/{complaint_id}/status")
def update_status(complaint_id: str, req: StatusUpdateRequest):
    item = complaints_db.get(complaint_id)
    if not item:
        raise HTTPException(status_code=404, detail="Incident not found")

    item["status"] = req.status
    if req.resolution_note:
        item["resolution"] = {
            "note": req.resolution_note,
            "resolved_at": datetime.now(timezone.utc).isoformat(),
            "officer": req.officer or item.get("officer")
        }
    save_data()
    return {"status": "updated", "complaint": item}

@app.get("/api/analytics")
def get_analytics():
    all_cases = list(complaints_db.values())
    total = len(all_cases)
    open_cases = [c for c in all_cases if c.get("status") in ["ASSIGNED", "IN_PROGRESS", "ESCALATED"]]
    resolved_cases = [c for c in all_cases if c.get("status") in ["RESOLVED", "CLOSED"]]

    now = datetime.now(timezone.utc)
    overdue_cases = []
    for c in open_cases:
        try:
            deadline = datetime.fromisoformat(c.get("sla_deadline", "").replace("Z", "+00:00"))
            if deadline < now:
                overdue_cases.append(c)
        except Exception:
            pass

    sla_compliance = round(100.0 - (len(overdue_cases) / max(total, 1) * 100.0), 1)
    merged_total = sum(len(c.get("reporters", [])) - 1 for c in all_cases if len(c.get("reporters", [])) > 1)

    dept_counts: Dict[str, int] = {}
    for c in all_cases:
        d = c.get("department", "OTHER")
        dept_counts[d] = dept_counts.get(d, 0) + 1

    pri_counts: Dict[str, int] = {}
    for c in all_cases:
        p = c.get("priority", "P3")
        pri_counts[p] = pri_counts.get(p, 0) + 1

    return {
        "total": total,
        "open": len(open_cases),
        "in_progress": len([c for c in all_cases if c.get("status") == "IN_PROGRESS"]),
        "resolved": len(resolved_cases),
        "overdue": len(overdue_cases),
        "sla_compliance_percent": sla_compliance,
        "merged_duplicates_prevented": merged_total,
        "departments": dept_counts,
        "priorities": pri_counts
    }

@app.post("/api/voice/intent")
def resolve_voice_intent(req: VoiceIntentRequest):
    q = req.query.lower()
    intent = "unknown"
    target_tab = "home"
    response_text = "I did not quite understand that. You can ask me to report a pothole, track a complaint, or show the live map."

    if any(k in q for k in ["report", "pothole", "garbage", "leak", "light", "complaint", "ದೂರು", "शिकायत"]):
        intent = "report"
        target_tab = "report"
        response_text = "Opening Incident Ingestion. Please provide details and pinpoint location."
    elif any(k in q for k in ["track", "status", "cmp-", "wo-", "ಟ್ರ್ಯಾಕ್", "ट्रैक"]):
        intent = "track"
        target_tab = "track"
        response_text = "Opening Live Tracking. Searching your work order status."
    elif any(k in q for k in ["map", "radar", "radar", "ನಕ್ಷೆ", "नक्शा", "मैप"]):
        intent = "map"
        target_tab = "map"
        response_text = "Opening Karnataka State Live Radar map."
    elif any(k in q for k in ["officer", "dispatch", "desk", "queue"]):
        intent = "officer"
        target_tab = "officer"
        response_text = "Opening Officer Work Queue and Crew Dispatch Desk."
    elif any(k in q for k in ["helpline", "phone", "number", "bbmp 1902"]):
        intent = "helpline"
        target_tab = "home"
        response_text = "Karnataka 24/7 Municipal Helplines: BBMP 1902, BESCOM 1912, BWSSB 1916, Police & Emergency 112."

    return {
        "intent": intent,
        "target_tab": target_tab,
        "response_text": response_text
    }
