"""
CivicSphere Karnataka - Local Development Server (Zero External Dependencies)
Runs the backend API locally using Python standard library (http.server).
Endpoints match FastAPI main.py exactly for 100% parity.
"""

import sys
import os
import json
import math
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timezone, timedelta
from pathlib import Path

PORT = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else 8000))
DATA_DIR = Path(__file__).parent / "data"
COMPLAINTS_FILE = DATA_DIR / "complaints.json"
SEED_FILE = DATA_DIR / "seed_complaints.json"

complaints_db = {}

def load_data():
    global complaints_db
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    target = COMPLAINTS_FILE if COMPLAINTS_FILE.exists() else SEED_FILE
    if target.exists():
        try:
            with open(target, "r", encoding="utf-8") as f:
                items = json.load(f)
                complaints_db = {item["id"]: item for item in items}
                print(f"[CivicSphere Local API] Loaded {len(complaints_db)} complaints from {target.name}")
        except Exception as e:
            print(f"[CivicSphere Local API] Error reading {target}: {e}")

def save_data():
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(COMPLAINTS_FILE, "w", encoding="utf-8") as f:
            json.dump(list(complaints_db.values()), f, indent=2)
    except Exception as e:
        print(f"[CivicSphere Local API] Error saving data: {e}")

def haversine_meters(lat1, lon1, lat2, lon2):
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

CATEGORY_METADATA = {
    "pothole": {"dept": "ROADS", "deptName": "Roads & Infrastructure (BBMP / PWD Karnataka)", "icon": "🕳️", "title": "Pothole / Road Damage", "pri": "P1", "hours": 4},
    "footpath": {"dept": "ROADS", "deptName": "Roads & Infrastructure (BBMP / PWD Karnataka)", "icon": "🚶", "title": "Broken Footpath & Slab", "pri": "P3", "hours": 72},
    "garbage": {"dept": "SWM", "deptName": "Solid Waste & Sanitation (Karnataka Municipalities)", "icon": "🗑️", "title": "Overflowing Garbage / Dump", "pri": "P2", "hours": 24},
    "streetlight": {"dept": "ELEC", "deptName": "Karnataka Electricity ESCOMs (BESCOM / HESCOM / MESCOM)", "icon": "💡", "title": "Dark Streetlight / Pole", "pri": "P3", "hours": 72},
    "waterleak": {"dept": "WATER", "deptName": "Water Supply & Drainage (BWSSB / KUWSDB Karnataka)", "icon": "🚰", "title": "Pipe Burst / Water Leakage", "pri": "P1", "hours": 4},
    "tree": {"dept": "GREEN", "deptName": "Karnataka Forest Dept & Urban Parks", "icon": "🌳", "title": "Fallen Tree / Dangerous Branch", "pri": "P2", "hours": 24},
    "signal": {"dept": "TRAFFIC", "deptName": "Karnataka State Police & Traffic Control", "icon": "🚦", "title": "Broken Traffic Signal", "pri": "P1", "hours": 4}
}

class ApiHandler(BaseHTTPRequestHandler):
    def send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors()
        self.end_headers()

    def send_json(self, data, status_code=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        path = u.path.rstrip("/")
        params = parse_qs(u.query)

        if path in ["", "/api/health"]:
            return self.send_json({
                "status": "healthy",
                "service": "CivicSphere Karnataka API (Local Engine)",
                "complaints_loaded": len(complaints_db),
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

        if path == "/api/complaints":
            results = list(complaints_db.values())
            dept = params.get("department", [None])[0]
            status = params.get("status", [None])[0]
            q = params.get("q", [None])[0]
            if dept:
                results = [c for c in results if c.get("department") == dept]
            if status:
                results = [c for c in results if c.get("status") == status]
            if q:
                qs = q.lower()
                results = [c for c in results if qs in c.get("id", "").lower() or qs in c.get("work_order_id", "").lower() or qs in c.get("title", "").lower() or any(qs in r.get("phone", "") for r in c.get("reporters", []))]
            results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
            return self.send_json(results[:100])

        if path.startswith("/api/complaints/"):
            cid = path.split("/")[-1].strip()
            cid_norm = cid.replace("-", "").lower()
            if cid in complaints_db:
                return self.send_json(complaints_db[cid])
            for k, c in complaints_db.items():
                if k.lower() == cid.lower() or k.replace("-", "").lower() == cid_norm:
                    return self.send_json(c)
                if c.get("work_order_id", "").lower() == cid.lower() or c.get("work_order_id", "").replace("-", "").lower() == cid_norm:
                    return self.send_json(c)
                if any(r.get("phone") == cid or (len(cid) >= 6 and cid in r.get("phone", "")) for r in c.get("reporters", [])):
                    return self.send_json(c)
            return self.send_json({"error": "Incident not found"}, 404)

        if path == "/api/analytics":
            all_cases = list(complaints_db.values())
            total = len(all_cases)
            open_cases = [c for c in all_cases if c.get("status") in ["ASSIGNED", "IN_PROGRESS", "ESCALATED"]]
            resolved_cases = [c for c in all_cases if c.get("status") in ["RESOLVED", "CLOSED"]]
            now = datetime.now(timezone.utc)
            overdue = []
            for c in open_cases:
                try:
                    dl = datetime.fromisoformat(c.get("sla_deadline", "").replace("Z", "+00:00"))
                    if dl < now:
                        overdue.append(c)
                except Exception:
                    pass
            dept_counts = {}
            for c in all_cases:
                d = c.get("department", "OTHER")
                dept_counts[d] = dept_counts.get(d, 0) + 1
            pri_counts = {}
            for c in all_cases:
                p = c.get("priority", "P3")
                pri_counts[p] = pri_counts.get(p, 0) + 1
            return self.send_json({
                "total": total,
                "open": len(open_cases),
                "in_progress": len([c for c in all_cases if c.get("status") == "IN_PROGRESS"]),
                "resolved": len(resolved_cases),
                "overdue": len(overdue),
                "sla_compliance_percent": round(100.0 - (len(overdue) / max(total, 1) * 100.0), 1),
                "merged_duplicates_prevented": sum(len(c.get("reporters", [])) - 1 for c in all_cases if len(c.get("reporters", [])) > 1),
                "departments": dept_counts,
                "priorities": pri_counts
            })

        self.send_json({"error": "Not Found"}, 404)

    def do_POST(self):
        u = urlparse(self.path)
        path = u.path.rstrip("/")
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            payload = json.loads(body)
        except Exception:
            payload = {}

        if path == "/api/complaints":
            lat = float(payload.get("lat", 0))
            lng = float(payload.get("lng", 0))
            if not (11.45 <= lat <= 18.55 and 74.00 <= lng <= 78.65):
                return self.send_json({
                    "status": "outside_karnataka",
                    "message": "Currently service is not available outside Karnataka. We will reach you soon!"
                })

            cat_key = payload.get("category", "pothole")
            meta = CATEGORY_METADATA.get(cat_key, CATEGORY_METADATA["pothole"])
            now = datetime.now(timezone.utc)

            # Deduplication
            for c in complaints_db.values():
                if c.get("status") in ["ASSIGNED", "IN_PROGRESS", "ESCALATED"] and c.get("category") == cat_key:
                    dist = haversine_meters(lat, lng, c.get("lat", 0), c.get("lng", 0))
                    if dist <= 35.0:
                        c.setdefault("reporters", []).append({
                            "name": payload.get("reporter_name", "Karnataka Resident"),
                            "phone": payload.get("reporter_phone", "9876543210"),
                            "channel": payload.get("channel", "Web Portal"),
                            "reported_at": now.isoformat(),
                            "description": payload.get("description", "")
                        })
                        c["supporters"] = c.get("supporters", 1) + 1
                        c["merged_count"] = len(c["reporters"])
                        save_data()
                        return self.send_json({
                            "status": "merged",
                            "message": "Merged into existing Master Work Order within 35m spatial cluster",
                            "work_order_id": c.get("work_order_id"),
                            "complaint": c
                        })

            next_idx = len(complaints_db) + 1001
            c_id = f"CMP-{next_idx}"
            wo_id = f"WO-{next_idx}"
            sla_deadline = now + timedelta(hours=meta["hours"])

            new_c = {
                "id": c_id,
                "work_order_id": wo_id,
                "title": meta["title"],
                "category": cat_key,
                "categoryIcon": meta["icon"],
                "department": meta["dept"],
                "departmentName": meta["deptName"],
                "description": payload.get("description", "Civic issue reported"),
                "priority": meta["pri"],
                "status": "ASSIGNED",
                "lat": lat,
                "lng": lng,
                "city": payload.get("city", "Bengaluru"),
                "ward": payload.get("ward", "151"),
                "zone": "Central Division",
                "created_at": now.isoformat(),
                "sla_deadline": sla_deadline.isoformat(),
                "assigned_team": f"Ward {payload.get('ward', '151')} Rapid Response Unit",
                "officer": "Ward Junior Engineer",
                "reporters": [{
                    "name": payload.get("reporter_name", "Karnataka Resident"),
                    "phone": payload.get("reporter_phone", "9876543210"),
                    "channel": payload.get("channel", "Web Portal"),
                    "reported_at": now.isoformat(),
                    "description": payload.get("description", "")
                }],
                "channel": payload.get("channel", "Web Portal"),
                "supporters": 1,
                "duplicate_of": None,
                "merged_count": 1
            }
            complaints_db[c_id] = new_c
            save_data()
            return self.send_json({
                "status": "created",
                "message": "Incident triaged and dispatched",
                "complaint_id": c_id,
                "work_order_id": wo_id,
                "complaint": new_c
            })

        if path == "/api/voice/intent":
            q = payload.get("query", "").lower()
            resp = "I am listening. Ask to report an issue, track status, or show the map."
            tab = "home"
            if any(k in q for k in ["report", "pothole", "garbage", "leak", "ದೂರು", "शिकायत"]):
                resp = "Opening Incident Ingestion."
                tab = "report"
            elif any(k in q for k in ["track", "status", "cmp-", "wo-"]):
                resp = "Opening Live Tracking."
                tab = "track"
            elif any(k in q for k in ["map", "radar", "ನಕ್ಷೆ"]):
                resp = "Opening Karnataka State Live Radar."
                tab = "map"
            elif any(k in q for k in ["officer", "dispatch"]):
                resp = "Opening Officer Work Queue."
                tab = "officer"
            return self.send_json({"intent": tab, "target_tab": tab, "response_text": resp})

        self.send_json({"error": "Not Found"}, 404)

    def do_PATCH(self):
        u = urlparse(self.path)
        path = u.path.rstrip("/")
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            payload = json.loads(body)
        except Exception:
            payload = {}

        if path.startswith("/api/complaints/") and path.endswith("/status"):
            parts = path.split("/")
            cid = parts[-2]
            target_c = complaints_db.get(cid)
            if not target_c:
                for k, v in complaints_db.items():
                    if k.lower() == cid.lower() or v.get("work_order_id", "").lower() == cid.lower() or k.replace("-", "").lower() == cid.replace("-", "").lower():
                        target_c = v
                        cid = k
                        break
            if target_c:
                target_c["status"] = payload.get("status", target_c.get("status", "RESOLVED"))
                if payload.get("officer"):
                    target_c["officer"] = payload["officer"]
                if payload.get("resolution_note") or target_c["status"] == "RESOLVED":
                    target_c["resolution"] = {
                        "note": payload.get("resolution_note", "Field repairs completed and certified."),
                        "officer": payload.get("officer", target_c.get("officer")),
                        "resolved_at": datetime.now(timezone.utc).isoformat(),
                        "within_sla": True
                    }
                save_data()
                return self.send_json({"status": "updated", "complaint": target_c})
            return self.send_json({"error": "Not Found"}, 404)

        self.send_json({"error": "Not Found"}, 404)

if __name__ == "__main__":
    load_data()
    server = HTTPServer(("0.0.0.0", PORT), ApiHandler)
    print(f"[CivicSphere API] Server listening on http://0.0.0.0:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[CivicSphere API] Stopped.")
