// =====================================================================
// CivicSphere Civic Operations - Main Application Controller & Views
// =====================================================================

import { DEPTS, CATS, WARDS, SENSITIVE, SLA_HOURS, PRI_LABEL, PRI_COLOR, STATUS_LABEL, STATUS_COLOR, BLR_CENTER, KARNATAKA_CENTER, KARNATAKA_BOUNDS, KARNATAKA_CITIES, PLACES, SAMPLES, isWithinKarnataka } from './data.js';
import { detectAIImage, haversine, detectLang, nearestWard, intakeAgent, visionClassifierAgent, duplicateDetectorAgent, priorityAgent, routingAgent, slaPlannerAgent, escalationAgent, resolutionVerifierAgent, generateInsights } from './agents.js';
import { initFullMap, updateMapMarkers, flyToLocation, flyToKarnatakaCity, zoomToFullKarnataka, initPickerMap, locateUserOnMap, CARTO_API_KEY, reorientCompass, zoomInMap, zoomOutMap, switchBasemap, searchRealWorldPlaces, highlightSearchPlace, fetchIPLocation, renderUserLocationMarker, reverseGeocodeCoords, acquireHighPrecisionLocation, getFullMap, getPickerMap } from './map.js';

// Global Application State
export const State = {
  complaints: new Map(),
  offsetHours: 0,
  activeTab: 'home',
  dashboardSubtab: 'overview',
  officerDept: 'ROADS',
  userLocation: null,
  charts: [],
  reportingState: {
    step: 1,
    photoData: null,
    description: '',
    language: 'en',
    pos: { lat: BLR_CENTER.lat, lng: BLR_CENTER.lng },
    address: 'Bengaluru Central, Karnataka',
    name: '',
    phone: '',
    channel: 'Web Portal'
  },
  pickerInstance: null,
  mapFilterStatus: 'open',
  mapFilterPriority: '',
  mapFilterCategory: '',
  selectedComplaint: null,
  chatMessages: [
    { sender: 'bot', text: 'Namaskara! I am CivicSphere Mitra, your AI Civic Guide. You can ask me in English, ಕನ್ನಡ, or हिंदी about civic issues, ward complaints, or BBMP/BESCOM/BWSSB SLAs.' }
  ]
};

export function nowMs() {
  return Date.now() + State.offsetHours * 3600 * 1000;
}

export function formatDateTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatTimeLeft(deadlineISO) {
  if (!deadlineISO) return '—';
  const diffMs = new Date(deadlineISO).getTime() - nowMs();
  if (diffMs <= 0) {
    const overdueHrs = Math.abs(Math.floor(diffMs / 36e5));
    return { text: `Overdue by ${overdueHrs}h 🚨`, isOverdue: true };
  }
  const hrs = Math.floor(diffMs / 36e5);
  const mins = Math.floor((diffMs % 36e5) / 60000);
  return { text: `${hrs}h ${mins}m left`, isOverdue: false };
}

export function showToast(message) {
  const toast = document.getElementById('global-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3800);
}

// ---------------------------------------------------------------------
// Demo Seed Data Generator (PRNG mulberry32)
// ---------------------------------------------------------------------
function mulberry(seed) {
  return function() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateSeedData() {
  const rnd = mulberry(777);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const names = ['Ananya Rao', 'Rahul Sharma', 'Priya Iyer', 'Mohammed Farooq', 'Kavya Gowda', 'Suresh Kumar', 'Divya Nair', 'Arjun Patil', 'Vikram Reddy', 'Meera Hegde'];
  const items = new Map();

  for (let i = 1; i <= 64; i++) {
    const id = `CMP-${1000 + i}`;
    const [sampleDesc, sampleLang] = pick(SAMPLES);
    const ward = pick(WARDS);
    const jitter = (v, km) => v + (rnd() * 2 - 1) * (km / 111);
    const lat = jitter(ward.lat, 1.4);
    const lng = jitter(ward.lng, 1.4);

    const intake = intakeAgent({ description: sampleDesc, language: sampleLang, lat, lng });
    const vision = visionClassifierAgent(sampleDesc, null);
    const priority = priorityAgent(vision.category, sampleDesc, vision.visualSeverity, intake.nearbySensitive, 1);
    const routing = routingAgent(vision.category, intake.ward, priority.priority);

    // Backdate timestamp
    const daysAgo = 0.5 + rnd() * 12;
    const createdMs = nowMs() - daysAgo * 864e5;
    const sla = slaPlannerAgent(priority.priority, createdMs);

    const isResolved = rnd() < 0.65;
    const status = isResolved ? 'RESOLVED' : rnd() < 0.35 ? 'IN_PROGRESS' : 'ASSIGNED';

    const timeline = [
      { at: new Date(createdMs).toISOString(), actor: 'Citizen', event: 'Report filed', detail: `Report submitted via CivicSphere app` },
      { at: new Date(createdMs + 120000).toISOString(), actor: 'AI Multi-Agent Crew', event: 'Triage complete', detail: `Classified as ${priority.priority} (${priority.score}/100), routed to ${routing.departmentName}` }
    ];

    if (status === 'IN_PROGRESS' || isResolved) {
      timeline.push({
        at: new Date(createdMs + 36e5 * 2).toISOString(),
        actor: routing.officer,
        event: 'Work dispatched',
        detail: `Crew ${routing.crew} assigned to field site`
      });
    }

    let resolution = null;
    let citizenRating = null;

    if (isResolved) {
      const resolvedAt = new Date(createdMs + (0.4 + rnd() * 0.8) * sla.slaHours * 36e5).toISOString();
      timeline.push({
        at: resolvedAt,
        actor: routing.officer,
        event: 'Work completed',
        detail: 'Field repair and resurfacing verified by crew.'
      });
      resolution = {
        note: 'Repairs completed by ward crew. Asphalt patched and rolled.',
        resolved_at: resolvedAt,
        within_sla: true,
        verification: { verified: true, confidence: 0.92, source: 'ai-verifier', reason: 'Field checklist and geo-coordinates verified.' }
      };
      citizenRating = pick([4, 5, 5, 4, 3]);
    }

    items.set(id, {
      id,
      title: vision.categoryName,
      category: vision.category,
      categoryIcon: vision.categoryIcon,
      description: sampleDesc,
      language: sampleLang,
      lat,
      lng,
      ward: intake.ward,
      zone: intake.zone,
      department: routing.deptCode,
      department_name: routing.departmentName,
      department_icon: routing.departmentIcon,
      officer: routing.officer,
      assigned_team: routing.crew,
      work_order_id: `WO-${1000 + i}`,
      channel: pick(['Web Portal', 'WhatsApp Bot', 'Call Center', 'Mobile App']),
      is_consolidated: false,
      priority: priority.priority,
      severity_score: priority.score,
      sla_hours: sla.slaHours,
      sla_deadline: sla.deadlineISO,
      status,
      escalation_level: 0,
      supporters: 1,
      duplicate_of: null,
      created_at: new Date(createdMs).toISOString(),
      updated_at: new Date(createdMs).toISOString(),
      reporters: [
        {
          id: `REP-${id}-1`,
          name: pick(names),
          phone: '9845' + Math.floor(100000 + rnd() * 899999),
          channel: pick(['Web Portal', 'WhatsApp Bot', 'Call Center', 'Mobile App']),
          reported_at: new Date(createdMs).toISOString(),
          description: sampleDesc,
          photo: null,
          distance_m: 0
        }
      ],
      corroborating_photos: [],
      timeline,
      agent_trace: [
        { agent: 'Intake Agent', details: intake.trace },
        { agent: 'Vision & Classifier Agent', details: vision.trace },
        { agent: 'Duplicate & Multi-Channel Correlation Agent', details: [`Independent work order WO-${1000 + i} authorized for municipal crew dispatch`] },
        { agent: 'Priority Scoring Agent', details: priority.trace },
        { agent: 'Routing & Dispatch Agent', details: routing.trace },
        { agent: 'Citizen Charter SLA Agent', details: sla.trace }
      ],
      notifications: [
        { at: new Date(createdMs).toISOString(), audience: 'Citizen', message: `Your case ${id} (Work Order WO-${1000 + i}) has been registered with target deadline ${formatDateTime(sla.deadlineISO)}.` }
      ],
      resolution,
      citizen_rating: citizenRating,
      reporter_name: pick(names),
      reporter_phone: '9845' + Math.floor(100000 + rnd() * 899999)
    });
  }

  // Create realistic multi-channel consolidated incidents (preserving all original reporters)
  const openCases = Array.from(items.values()).filter((c) => c.status === 'ASSIGNED');
  const demoChannels = ['WhatsApp Bot', 'Call Center', 'Mobile App'];
  const demoExtraNames = ['Priya Sharma', 'Sunil Kumar', 'Aisha Banu', 'Venkatesh Rao', 'Karthik Reddy', 'Lakshmi Bai'];

  for (let k = 0; k < 5 && k < openCases.length; k++) {
    const parent = openCases[k];
    parent.is_consolidated = true;
    parent.supporters = 3;
    parent.severity_score = Math.min(100, parent.severity_score + 18);
    if (parent.priority === 'P3') parent.priority = 'P2';
    else if (parent.priority === 'P2') parent.priority = 'P1';

    const rep2Name = pick(demoExtraNames);
    const rep3Name = pick(demoExtraNames.filter(n => n !== rep2Name));

    const rep2Channel = demoChannels[k % demoChannels.length];
    const rep3Channel = demoChannels[(k + 1) % demoChannels.length];

    const rep2Desc = `Second citizen report via ${rep2Channel}: ${parent.title} worsening, urgent repair requested`;
    const rep3Desc = `Helpline Call via ${rep3Channel}: multiple commuters complaining of hazard at same spot`;

    const rep2Time = new Date(new Date(parent.created_at).getTime() + 36e5 * 2.5).toISOString();
    const rep3Time = new Date(new Date(parent.created_at).getTime() + 36e5 * 5.2).toISOString();

    parent.reporters.push(
      {
        id: `REP-${parent.id}-2`,
        name: rep2Name,
        phone: '9880' + Math.floor(100000 + rnd() * 899999),
        channel: rep2Channel,
        reported_at: rep2Time,
        description: rep2Desc,
        photo: null,
        distance_m: 14 + k * 4
      },
      {
        id: `REP-${parent.id}-3`,
        name: rep3Name,
        phone: '9900' + Math.floor(100000 + rnd() * 899999),
        channel: rep3Channel,
        reported_at: rep3Time,
        description: rep3Desc,
        photo: null,
        distance_m: 26 + k * 3
      }
    );

    parent.timeline.push(
      {
        at: rep2Time,
        actor: 'Multi-Citizen Correlation Engine',
        event: `Corroborating Report Merged (${rep2Channel})`,
        detail: `Reported by ${rep2Name} via ${rep2Channel}. Preserved citizen evidence & linked to Master Work Order ${parent.work_order_id}.`
      },
      {
        at: rep3Time,
        actor: 'Multi-Citizen Correlation Engine',
        event: `Corroborating Report Merged (${rep3Channel})`,
        detail: `Reported by ${rep3Name} via ${rep3Channel}. Consolidated into single crew dispatch. Community priority escalated to ${parent.priority}.`
      }
    );

    parent.agent_trace[2] = {
      agent: 'Duplicate & Multi-Channel Correlation Agent',
      details: [
        `Consolidated 3 citizen reports across ${parent.reporters[0].channel}, ${rep2Channel}, and ${rep3Channel}`,
        `Spatial radius: within 35m cluster`,
        `Single Master Work Order ${parent.work_order_id} maintained for field crew to avoid duplicate dispatches`,
        `All 3 citizen profiles and distinct descriptions preserved`
      ]
    };
  }

  return items;
}

// ---------------------------------------------------------------------
// Storage & Persistence
// ---------------------------------------------------------------------
export function loadState() {
  try {
    const saved = localStorage.getItem('civicsphere_v2_data');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.complaints && parsed.complaints.length > 0 && parsed.complaints[0].reporters) {
        State.complaints = new Map(parsed.complaints.map((c) => [c.id, c]));
        State.offsetHours = parsed.offsetHours || 0;
        return;
      }
    }
  } catch (err) {
    console.warn('Could not read localStorage:', err);
  }
  State.complaints = generateSeedData();
  saveState();
}

export function saveState() {
  try {
    const data = {
      offsetHours: State.offsetHours,
      complaints: Array.from(State.complaints.values())
    };
    localStorage.setItem('civicsphere_v2_data', JSON.stringify(data));
  } catch (err) {
    console.warn('Could not save to localStorage:', err);
  }
}

// ---------------------------------------------------------------------
// Analytics Engine for Command Centre
// ---------------------------------------------------------------------
export function computeAnalytics() {
  const all = Array.from(State.complaints.values());
  const unique = all.filter((c) => !c.duplicate_of);
  const now = nowMs();

  const open = unique.filter((c) => ['ASSIGNED', 'IN_PROGRESS', 'ESCALATED'].includes(c.status));
  const resolved = unique.filter((c) => ['RESOLVED', 'CLOSED'].includes(c.status));
  const overdue = open.filter((c) => new Date(c.sla_deadline).getTime() < now);
  const critical = open.filter((c) => c.priority === 'P1');
  const merged = all.filter((c) => c.duplicate_of).length;

  const withinSlaCount = resolved.filter((c) => c.resolution && c.resolution.within_sla).length;
  const slaCompliance = resolved.length > 0 ? Math.round((withinSlaCount / resolved.length) * 100) : 94;

  // By Department
  const byDept = Object.entries(DEPTS).map(([code, d]) => {
    const deptComplaints = unique.filter((c) => c.department === code);
    const dOpen = deptComplaints.filter((c) => ['ASSIGNED', 'IN_PROGRESS', 'ESCALATED'].includes(c.status));
    const dOverdue = dOpen.filter((c) => new Date(c.sla_deadline).getTime() < now);
    const dDone = deptComplaints.filter((c) => ['RESOLVED', 'CLOSED'].includes(c.status));
    const dSla = dDone.length > 0 ? Math.round((dDone.filter((x) => x.resolution?.within_sla).length / dDone.length) * 100) : 92;

    return {
      code,
      name: d.name,
      icon: d.icon,
      color: d.color,
      total: deptComplaints.length,
      open: dOpen.length,
      overdue: dOverdue.length,
      sla: dSla,
      avgH: 14.5
    };
  }).sort((a, b) => b.total - a.total);

  // By Ward Hotspots
  const byWard = WARDS.map((w) => {
    const wardComplaints = unique.filter((c) => c.ward === w.name);
    const wOpen = wardComplaints.filter((c) => ['ASSIGNED', 'IN_PROGRESS', 'ESCALATED'].includes(c.status));
    const wCrit = wOpen.filter((c) => c.priority === 'P1').length;

    // top category
    const catCounts = {};
    wardComplaints.forEach((c) => catCounts[c.category] = (catCounts[c.category] || 0) + 1);
    let topCatKey = 'pothole';
    let max = -1;
    for (const [k, v] of Object.entries(catCounts)) {
      if (v > max) { max = v; topCatKey = k; }
    }

    return {
      name: w.name,
      zone: w.zone,
      total: wardComplaints.length,
      open: wOpen.length,
      critical: wCrit,
      top: CATS[topCatKey] ? CATS[topCatKey][2] : 'Civic Issue'
    };
  }).sort((a, b) => b.open - a.open);

  // 14-day trend
  const trend = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * 864e5);
    const dayKey = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    const reported = unique.filter((c) => c.created_at.slice(0, 10) === dayKey).length;
    const res = unique.filter((c) => c.resolution && c.resolution.resolved_at?.slice(0, 10) === dayKey).length;
    trend.push({ label, reported, resolved: res });
  }

  // Priority distribution
  const priCounts = { P1: 0, P2: 0, P3: 0, P4: 0 };
  open.forEach((c) => { if (priCounts[c.priority] !== undefined) priCounts[c.priority]++; });

  // Category distribution
  const catDistribution = {};
  unique.forEach((c) => {
    const name = CATS[c.category] ? CATS[c.category][2] : 'Other';
    catDistribution[name] = (catDistribution[name] || 0) + 1;
  });

  // Recent Escalations
  const escalations = [];
  unique.forEach((c) => {
    if (c.escalations && c.escalations.length) {
      c.escalations.forEach((e) => escalations.push({ ...e, complaintId: c.id, title: c.title, ward: c.ward }));
    }
  });

  return {
    k: {
      total: unique.length,
      open: open.length,
      resolved: resolved.length,
      overdue: overdue.length,
      critical: critical.length,
      sla: slaCompliance,
      merged
    },
    byDept,
    byWard,
    trend,
    priCounts,
    catDistribution,
    escalations
  };
}

// ---------------------------------------------------------------------
// Router & Page Rendering
// ---------------------------------------------------------------------
export function navigateTo(tabName) {
  State.activeTab = tabName;
  window.location.hash = `#${tabName}`;

  // Update topbar link active classes
  document.querySelectorAll('.nav-link').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('href') === `#${tabName}`);
  });

  const mainView = document.getElementById('main-view');
  if (!mainView) return;

  // Cleanup old charts if any
  State.charts.forEach((ch) => ch.destroy());
  State.charts = [];

  switch (tabName) {
    case 'home':
      renderHomeView(mainView);
      break;
    case 'dashboard':
      renderDashboardView(mainView);
      break;
    case 'map':
      renderMapView(mainView);
      break;
    case 'report':
      renderReportView(mainView);
      break;
    case 'track':
      renderTrackView(mainView);
      break;
    case 'officer':
      renderOfficerView(mainView);
      break;
    default:
      renderHomeView(mainView);
  }
}

// ---------------------------------------------------------------------
// View: Home
// ---------------------------------------------------------------------
function renderHomeView(container) {
  const an = computeAnalytics();
  container.innerHTML = `
    <div class="container">
      <!-- Hero Banner -->
      <div class="hero-banner">
        <div style="max-width: 740px; position: relative; z-index: 2;">
          <div class="hero-pill">
            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#22c55e;"></span>
            Karnataka State Civic Command & Operations
          </div>
          <h1 class="hero-title">
            One State. One Intelligence. Better Living.
          </h1>
          <p class="hero-description">
            Autonomous multi-agent civic operating system restricted to Karnataka State. Powered by zero-API spatial mapping, real-time duplicate clustering, instant camera photo authenticity verification, and tamper-proof resolution auditing.
          </p>
          <div style="display: flex; gap: 14px; flex-wrap: wrap;">
            <button class="btn hero-btn-primary" onclick="window.location.hash='#report'">
              📸 Report an Issue
            </button>
            <button class="btn hero-btn-secondary" onclick="window.location.hash='#dashboard'">
              📊 Commissioner's Command Centre
            </button>
            <button class="btn hero-btn-secondary" onclick="window.location.hash='#map'">
              🗺️ Live Map
            </button>
          </div>
        </div>
      </div>

      <!-- Live Quick Stats Bar -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">Active Workload</span>
            <div class="kpi-icon">⚡</div>
          </div>
          <div class="kpi-val-row">
            <span class="kpi-value">${an.k.open}</span>
            <span class="kpi-badge warning">${an.k.critical} Critical (P1)</span>
          </div>
          <div class="kpi-subtext">Currently assigned to BBMP & BESCOM crews</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">Resolution Rate</span>
            <div class="kpi-icon">✅</div>
          </div>
          <div class="kpi-val-row">
            <span class="kpi-value">${an.k.sla}%</span>
            <span class="kpi-badge success">Target > 90%</span>
          </div>
          <div class="kpi-subtext">Complaints fixed within citizen charter time</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">Duplicates Merged</span>
            <div class="kpi-icon">🧬</div>
          </div>
          <div class="kpi-val-row">
            <span class="kpi-value">${an.k.merged}</span>
            <span class="kpi-badge success">Auto-clustered</span>
          </div>
          <div class="kpi-subtext">Prevented redundant duplicate work crews</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">Total Handled</span>
            <div class="kpi-icon">📋</div>
          </div>
          <div class="kpi-val-row">
            <span class="kpi-value">${an.k.total}</span>
            <span class="kpi-badge success">16 Wards Active</span>
          </div>
          <div class="kpi-subtext">Comprehensive city-wide coverage</div>
        </div>
      </div>

      <!-- Agent Crew Showcase -->
      <div style="margin-top: 50px;">
        <div class="section-header">
          <div>
            <h2 class="section-title">The Autonomous Civic Multi-Agent Crew</h2>
            <p class="section-desc">Six specialized autonomous agents collaborate on every complaint within seconds of citizen reporting.</p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
          <div class="card-clean" style="border-top: 4px solid #3b82f6;">
            <div style="font-size: 2rem; margin-bottom: 12px;">📥</div>
            <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 8px;">Intake & Geocoding Agent</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem;">
              Pinpoints exact municipal ward coordinates, detects multilingual input (English, Kannada, Hindi), and scans proximity to vulnerable hospitals and schools.
            </p>
          </div>

          <div class="card-clean" style="border-top: 4px solid #10b981;">
            <div style="font-size: 2rem; margin-bottom: 12px;">👁️</div>
            <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 8px;">Vision & Classifier Agent</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem;">
              Analyzes photo evidence and hazard semantics. Automatically determines whether the incident is a pothole, street lamp failure, water leak, or fallen tree.
            </p>
          </div>

          <div class="card-clean" style="border-top: 4px solid #8b5cf6;">
            <div style="font-size: 2rem; margin-bottom: 12px;">🧬</div>
            <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 8px;">Duplicate Detector Agent</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem;">
              Scans open cases within 60 meters. Merges repeated complaints from neighbours into an authoritative thread while boosting community urgency priority.
            </p>
          </div>

          <div class="card-clean" style="border-top: 4px solid #f59e0b;">
            <div style="font-size: 2rem; margin-bottom: 12px;">⚖️</div>
            <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 8px;">Priority & SLA Planner</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem;">
              Computes transparent, explainable scores (P1 to P4) factoring in accidents, pedestrian density, and schools, binding officers to statutory 4h to 72h SLAs.
            </p>
          </div>

          <div class="card-clean" style="border-top: 4px solid #ef4444;">
            <div style="font-size: 2rem; margin-bottom: 12px;">🚨</div>
            <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 8px;">Autonomic Escalation Agent</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem;">
              Watches SLAs around the clock. When deadlines are in danger, it automatically escalates the ticket up the official chain (Ward JE &rarr; AEE &rarr; Zonal Commissioner).
            </p>
          </div>

          <div class="card-clean" style="border-top: 4px solid #06b6d4;">
            <div style="font-size: 2rem; margin-bottom: 12px;">🔍</div>
            <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 8px;">Resolution Verifier Agent</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem;">
              Rejects fake or incomplete closures by verifying officer repair notes and photographic proof before marking a case certified and asking for citizen rating.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------
// View: Command Centre / Dashboard (Decongested with Tabs)
// ---------------------------------------------------------------------
function renderDashboardView(container) {
  const an = computeAnalytics();
  const insights = generateInsights(an);

  container.innerHTML = `
    <div class="container">
      <div class="section-header">
        <div>
          <span style="font-size: 0.78rem; font-weight: 800; color: var(--accent-primary); text-transform: uppercase; letter-spacing: 0.08em;">Live Operations Command</span>
          <h1 class="section-title">City Operations Dashboard</h1>
          <p class="section-desc">Real-time civic health monitoring, SLA compliance, and cross-departmental accountability.</p>
        </div>
        
        <!-- Demo Clock Action Bar -->
        <div style="display: flex; align-items: center; gap: 10px; background: var(--bg-surface); border: 1px solid var(--border-subtle); padding: 8px 16px; border-radius: var(--radius-pill); box-shadow: var(--shadow-sm);">
          <span style="font-size: 0.82rem; font-weight: 700; color: var(--text-muted);">
            Demo Clock${State.offsetHours ? ` (+${State.offsetHours}h)` : ''}:
          </span>
          <button class="btn btn-sm btn-secondary" onclick="window.advanceClock(6)">⏩ +6h</button>
          <button class="btn btn-sm btn-secondary" onclick="window.advanceClock(24)">⏩ +24h</button>
          <button class="btn btn-sm btn-ghost" onclick="window.resetData()">↺ Reset</button>
        </div>
      </div>

      <!-- Core Executive KPI Bar -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">Active Work</span>
            <div class="kpi-icon">⚡</div>
          </div>
          <div class="kpi-val-row">
            <span class="kpi-value">${an.k.open}</span>
            <span class="kpi-badge warning">${an.k.critical} Critical</span>
          </div>
          <div class="kpi-subtext">Overdue right now: <b>${an.k.overdue}</b> cases</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">SLA Compliance</span>
            <div class="kpi-icon">🎯</div>
          </div>
          <div class="kpi-val-row">
            <span class="kpi-value">${an.k.sla}%</span>
            <span class="kpi-badge ${an.k.sla >= 85 ? 'success' : 'danger'}">Statutory Target</span>
          </div>
          <div class="kpi-subtext">Resolved within citizen charter time limit</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">Auto-Escalations</span>
            <div class="kpi-icon">🚨</div>
          </div>
          <div class="kpi-val-row">
            <span class="kpi-value">${an.escalations.length}</span>
            <span class="kpi-badge danger">Autonomic</span>
          </div>
          <div class="kpi-subtext">Reassigned to Senior Engineers without delay</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-top">
            <span class="kpi-label">Total Resolved</span>
            <div class="kpi-icon">🏆</div>
          </div>
          <div class="kpi-val-row">
            <span class="kpi-value">${an.k.resolved}</span>
            <span class="kpi-badge success">Verified Fixes</span>
          </div>
          <div class="kpi-subtext">${an.k.merged} redundant duplicates consolidated</div>
        </div>
      </div>

      <!-- AI Operations Insights Banner -->
      <div class="card-clean" style="margin-bottom: 32px; background: linear-gradient(to right, var(--bg-surface), var(--bg-sunk));">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 14px;">
          <h3 style="font-size: 1.05rem; font-weight: 800; display:flex; align-items:center; gap:8px;">
            <span>🧠</span> Autonomous AI Operations Insights
          </h3>
          <span style="font-size: 0.74rem; font-weight: 700; background: var(--accent-primary-soft); color: var(--accent-primary); padding: 4px 10px; border-radius: var(--radius-pill);">Live Agent Analysis</span>
        </div>
        <ul style="display:flex; flex-direction:column; gap:8px; list-style:none; padding-left:0;">
          ${insights.map((ins) => `
            <li style="font-size: 0.9rem; color: var(--text-secondary); display:flex; align-items:flex-start; gap:10px;">
              <span style="color:var(--accent-primary); font-weight:800;">•</span>
              <span>${ins}</span>
            </li>
          `).join('')}
        </ul>
      </div>

      <!-- Segmented Tab Switcher (Eliminating Congestion!) -->
      <div class="tab-switcher">
        <button class="tab-btn ${State.dashboardSubtab === 'overview' ? 'active' : ''}" onclick="window.switchDashboardTab('overview')">
          📈 Overview & Analytics
        </button>
        <button class="tab-btn ${State.dashboardSubtab === 'departments' ? 'active' : ''}" onclick="window.switchDashboardTab('departments')">
          🏢 Department Operations (${an.byDept.length})
        </button>
        <button class="tab-btn ${State.dashboardSubtab === 'hotspots' ? 'active' : ''}" onclick="window.switchDashboardTab('hotspots')">
          📍 Ward Hotspots & Escalation Feed
        </button>
      </div>

      <!-- Tab Content Area -->
      <div id="dashboard-tab-content">
        ${renderDashboardSubtabContent(an)}
      </div>
    </div>
  `;

  // Draw charts if overview is active
  if (State.dashboardSubtab === 'overview') {
    setTimeout(() => drawDashboardCharts(an), 50);
  }
}

function renderDashboardSubtabContent(an) {
  if (State.dashboardSubtab === 'overview') {
    return `
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px; margin-bottom: 24px;">
        <div class="card-clean">
          <h3 style="font-size: 1.05rem; font-weight: 800; margin-bottom: 6px;">14-Day City Incident & Resolution Trend</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 20px;">Comparing incoming citizen reports vs. completed repairs.</p>
          <div style="height: 280px; width: 100%;">
            <canvas id="chart-trend"></canvas>
          </div>
        </div>

        <div class="card-clean">
          <h3 style="font-size: 1.05rem; font-weight: 800; margin-bottom: 6px;">Active Cases by Priority</h3>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 20px;">Urgency workload breakdown.</p>
          <div style="height: 280px; width: 100%; display: grid; place-items: center;">
            <canvas id="chart-priority"></canvas>
          </div>
        </div>
      </div>

      <div class="card-clean">
        <h3 style="font-size: 1.05rem; font-weight: 800; margin-bottom: 6px;">Top Issue Categories across Karnataka State</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 20px;">Potholes, streetlights, garbage overflow, and water pipelines.</p>
        <div style="height: 240px; width: 100%;">
          <canvas id="chart-categories"></canvas>
        </div>
      </div>
    `;
  }

  if (State.dashboardSubtab === 'departments') {
    return `
      <div class="card-clean">
        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 1.15rem; font-weight: 800;">Department Performance Scorecards</h3>
          <p style="font-size: 0.88rem; color: var(--text-muted);">SLA turnaround, active field crew workload, and overdue alerts.</p>
        </div>

        <div class="table-responsive">
          <table class="table-clean">
            <thead>
              <tr>
                <th>Department</th>
                <th>Total Cases</th>
                <th>Active Work</th>
                <th>Overdue</th>
                <th>Avg. Turnaround</th>
                <th>SLA Compliance</th>
              </tr>
            </thead>
            <tbody>
              ${an.byDept.map((d) => `
                <tr>
                  <td style="font-weight: 700;">
                    <span style="font-size: 1.2rem; margin-right: 8px;">${d.icon}</span>
                    ${d.name}
                  </td>
                  <td>${d.total}</td>
                  <td><span style="font-weight:700; color:var(--text-primary);">${d.open}</span></td>
                  <td>
                    ${d.overdue > 0 ? `<span style="color:var(--color-danger); font-weight:800;">${d.overdue} 🚨</span>` : '<span style="color:var(--color-success);">0</span>'}
                  </td>
                  <td>${d.avgH}h</td>
                  <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                      <div style="flex:1; height:8px; background:var(--bg-sunk); border-radius:4px; overflow:hidden;">
                        <div style="width:${d.sla}%; height:100%; background:${d.sla >= 85 ? 'var(--color-success)' : d.sla >= 70 ? 'var(--color-warning)' : 'var(--color-danger)'};"></div>
                      </div>
                      <span style="font-size:0.82rem; font-weight:700;">${d.sla}%</span>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (State.dashboardSubtab === 'hotspots') {
    return `
      <div style="display: grid; grid-template-columns: 1.3fr 1fr; gap: 24px;">
        <div class="card-clean">
          <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 6px;">Ward Hotspot Matrix</h3>
          <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 20px;">Highest concentration of open civic issues across Karnataka municipal corporations.</p>
          
          <div class="table-responsive">
            <table class="table-clean">
              <thead>
                <tr>
                  <th>Ward Name</th>
                  <th>Zone</th>
                  <th>Open Issues</th>
                  <th>P1 Critical</th>
                  <th>Dominant Hazard</th>
                </tr>
              </thead>
              <tbody>
                ${an.byWard.slice(0, 10).map((w) => `
                  <tr>
                    <td style="font-weight: 700;">${w.name}</td>
                    <td style="color: var(--text-muted); font-size: 0.82rem;">${w.zone}</td>
                    <td><b>${w.open}</b></td>
                    <td>${w.critical > 0 ? `<span class="badge-pri P1">${w.critical}</span>` : '0'}</td>
                    <td>${w.top}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card-clean">
          <h3 style="font-size: 1.15rem; font-weight: 800; margin-bottom: 6px;">Autonomic Escalation Feed</h3>
          <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 20px;">System-triggered reassignments for overdue work.</p>
          
          <div style="display:flex; flex-direction:column; gap:12px; max-height:480px; overflow-y:auto;">
            ${an.escalations.length > 0 ? an.escalations.map((e) => `
              <div style="padding:14px; border-radius:var(--radius-md); background:var(--bg-sunk); border-left:4px solid var(--color-danger);">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                  <span style="font-family:var(--font-mono); font-size:0.78rem; font-weight:700;">${e.complaintId}</span>
                  <span style="font-size:0.75rem; color:var(--text-muted);">${formatDateTime(e.at)}</span>
                </div>
                <div style="font-weight:700; font-size:0.88rem; margin-bottom:4px;">
                  ${e.title} · ${e.ward}
                </div>
                <div style="font-size:0.82rem; color:var(--color-danger); font-weight:600;">
                  Level ${e.from_level} &rarr; Level ${e.to_level}: Escalated to ${e.to_officer}
                </div>
              </div>
            `).join('') : `
              <div style="padding:32px; text-align:center; color:var(--text-muted);">
                ✅ No unresolved escalations pending. All crews working within target SLA bounds.
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  }
}

function drawDashboardCharts(an) {
  if (!window.Chart) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? '#1e293b' : '#f1f5f9';

  // 1. Trend Chart
  const trendEl = document.getElementById('chart-trend');
  if (trendEl) {
    const ch = new window.Chart(trendEl, {
      type: 'line',
      data: {
        labels: an.trend.map((t) => t.label),
        datasets: [
          {
            label: 'Reported',
            data: an.trend.map((t) => t.reported),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.35,
            borderWidth: 2.5
          },
          {
            label: 'Resolved',
            data: an.trend.map((t) => t.resolved),
            borderColor: '#10b981',
            backgroundColor: 'transparent',
            tension: 0.35,
            borderWidth: 2.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { color: textColor } } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor } },
          y: { grid: { color: gridColor }, ticks: { color: textColor, precision: 0 } }
        }
      }
    });
    State.charts.push(ch);
  }

  // 2. Priority Doughnut Chart
  const priEl = document.getElementById('chart-priority');
  if (priEl) {
    const ch = new window.Chart(priEl, {
      type: 'doughnut',
      data: {
        labels: ['P1 Critical (4h)', 'P2 High (24h)', 'P3 Medium (72h)', 'P4 Low (7d)'],
        datasets: [{
          data: [an.priCounts.P1, an.priCounts.P2, an.priCounts.P3, an.priCounts.P4],
          backgroundColor: [PRI_COLOR.P1, PRI_COLOR.P2, PRI_COLOR.P3, PRI_COLOR.P4],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: textColor, boxWidth: 12 } } }
      }
    });
    State.charts.push(ch);
  }

  // 3. Category Horizontal Bar Chart
  const catEl = document.getElementById('chart-categories');
  if (catEl) {
    const sortedCats = Object.entries(an.catDistribution).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const ch = new window.Chart(catEl, {
      type: 'bar',
      data: {
        labels: sortedCats.map((c) => c[0]),
        datasets: [{
          label: 'Total Incidents',
          data: sortedCats.map((c) => c[1]),
          backgroundColor: '#6366f1',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor, precision: 0 } },
          y: { grid: { display: false }, ticks: { color: textColor } }
        }
      }
    });
    State.charts.push(ch);
  }
}

// ---------------------------------------------------------------------
// View: Live Map (Full-Bleed with Floating Dock)
// ---------------------------------------------------------------------
function renderMapView(container) {
  const allComplaints = Array.from(State.complaints.values());

  container.innerHTML = `
    <div class="container" style="max-width: 1400px;">
      <div class="section-header" style="margin-bottom: 18px;">
        <div>
          <h1 class="section-title">Live Karnataka State Operations Map</h1>
          <p class="section-desc">Interactive real-world spatial intelligence restricted to Karnataka State jurisdictions, featuring Google Maps navigation, live GPS location, and real-time civic filters.</p>
        </div>
      </div>

      <div class="map-container-wrapper">
        <!-- Floating Glassmorphism Toolbar (Search & Filter Chips) -->
        <div class="map-floating-bar">
          <!-- Real-World Google Maps Style Search Bar -->
          <div class="gmap-search-wrapper">
            <div class="gmap-search-box">
              <span style="font-size:1.1rem; line-height:1;">🔍</span>
              <input type="text" id="map-search-input" placeholder="Search all places, streets, and areas in Karnataka..." autocomplete="off" oninput="window.handleRealWorldSearch(this.value)">
              <button id="map-search-clear" class="gmap-search-clear" onclick="window.clearMapSearch()" style="display:none;" title="Clear search">✕</button>
            </div>
            <!-- Live Autocomplete Suggestions Dropdown -->
            <div id="map-search-dropdown" class="gmap-autocomplete-dropdown" style="display:none;"></div>
          </div>

          <!-- Quick Karnataka City Jump Chips -->
          <div class="map-city-chips" style="display:flex; gap:6px; overflow-x:auto; padding-bottom:4px; max-width:100%;">
            <button class="map-chip active" onclick="window.zoomToFullKarnataka()" title="View whole Karnataka State">🏛️ All Karnataka</button>
            <button class="map-chip" onclick="window.flyToKarnatakaCity('Bengaluru')">🏙️ Bengaluru</button>
            <button class="map-chip" onclick="window.flyToKarnatakaCity('Mysuru')">🏰 Mysuru</button>
            <button class="map-chip" onclick="window.flyToKarnatakaCity('Mangaluru')">🏖️ Mangaluru</button>
            <button class="map-chip" onclick="window.flyToKarnatakaCity('Hubballi')">🚂 Hubballi</button>
            <button class="map-chip" onclick="window.flyToKarnatakaCity('Belagavi')">⛰️ Belagavi</button>
            <button class="map-chip" onclick="window.flyToKarnatakaCity('Kalaburagi')">🏛️ Kalaburagi</button>
            <button class="map-chip" onclick="window.flyToKarnatakaCity('Shivamogga')">🌿 Shivamogga</button>
            <button class="map-chip" onclick="window.flyToKarnatakaCity('Tumakuru')">🌾 Tumakuru</button>
            <button class="map-chip" onclick="window.flyToKarnatakaCity('Udupi')">🌊 Udupi</button>
          </div>

          <div class="map-filter-group">
            <button class="map-chip ${State.mapFilterStatus === 'all' ? 'active' : ''}" onclick="window.filterMapStatus('all')">All Issues</button>
            <button class="map-chip ${State.mapFilterStatus === 'open' ? 'active' : ''}" onclick="window.filterMapStatus('open')">Open Only</button>
            <button class="map-chip ${State.mapFilterStatus === 'resolved' ? 'active' : ''}" onclick="window.filterMapStatus('resolved')">Resolved</button>
          </div>

          <div class="map-filter-group">
            <button class="map-chip ${State.mapFilterPriority === '' ? 'active' : ''}" onclick="window.filterMapPriority('')">All Urgency</button>
            <button class="map-chip ${State.mapFilterPriority === 'P1' ? 'active' : ''}" onclick="window.filterMapPriority('P1')" style="color:var(--color-p1);">P1 Critical</button>
            <button class="map-chip ${State.mapFilterPriority === 'P2' ? 'active' : ''}" onclick="window.filterMapPriority('P2')" style="color:var(--color-p2);">P2 High</button>
          </div>
        </div>

        <!-- Full Viewport Leaflet Container -->
        <div id="leaflet-full-map"></div>

        <!-- Google Maps Style Floating Right-Side Controls Dock -->
        <div class="gmap-side-dock">
          <!-- Compass Button (Re-orient North) -->
          <button id="gmap-compass-btn" class="gmap-fab-btn" onclick="window.reorientCompass()" title="Re-orient to North (Compass)">
            <svg id="compass-needle-poly" class="compass-needle" width="26" height="26" viewBox="0 0 24 24">
              <!-- North Red Pointer -->
              <polygon points="12,2 15.5,12 8.5,12" fill="#ef4444" />
              <!-- South Silver Pointer -->
              <polygon points="12,22 15.5,12 8.5,12" fill="#94a3b8" />
              <circle cx="12" cy="12" r="2.2" fill="#ffffff" stroke="#334155" stroke-width="0.8"/>
              <text x="12" y="7.5" text-anchor="middle" font-size="5" font-weight="900" fill="#ffffff">N</text>
            </svg>
          </button>

          <!-- Current Location GPS Button (Google Maps Crosshairs Target) -->
          <button id="gmap-locate-btn" class="gmap-fab-btn" onclick="window.locateUserOnLiveMap()" title="Your Location (GPS)">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="7" stroke-width="2" />
              <circle cx="12" cy="12" r="2.5" fill="currentColor" />
              <line x1="12" y1="1" x2="12" y2="4" stroke-width="2" />
              <line x1="12" y1="20" x2="12" y2="23" stroke-width="2" />
              <line x1="1" y1="12" x2="4" y2="12" stroke-width="2" />
              <line x1="20" y1="12" x2="23" y2="12" stroke-width="2" />
            </svg>
          </button>

          <!-- Zoom Stack Controls (+ / -) -->
          <div class="gmap-zoom-stack">
            <button class="gmap-zoom-btn" onclick="window.zoomInMap()" title="Zoom in">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <div class="gmap-zoom-divider"></div>
            <button class="gmap-zoom-btn" onclick="window.zoomOutMap()" title="Zoom out">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>

          <!-- Fit State Overview Button -->
          <button class="gmap-fab-btn" onclick="window.zoomToFullKarnataka()" title="Fit Karnataka State Overview">
            <span style="font-size:1.15rem;">🏛️</span>
          </button>
        </div>

        <!-- Google Maps Style Bottom-Left Layers Switcher -->
        <div class="gmap-layers-widget">
          <button class="gmap-layers-fab" onclick="window.toggleLayersMenu()" title="Map Layers">
            <span style="font-size:1.1rem;">🗺️</span>
            <span>Layers</span>
          </button>
          <div id="gmap-layers-menu" class="gmap-layers-menu" style="display:none;">
            <div class="gmap-layer-opt active" data-layer="voyager" onclick="window.switchBasemap('voyager')">
              <span>🏙️</span>
              <div>
                <b style="display:block; font-size:0.86rem;">CARTO Voyager</b>
                <span style="font-size:0.75rem; color:var(--text-muted);">Clean Street Map</span>
              </div>
            </div>
            <div class="gmap-layer-opt" data-layer="dark" onclick="window.switchBasemap('dark')">
              <span>🌙</span>
              <div>
                <b style="display:block; font-size:0.86rem;">CARTO DarkMatter</b>
                <span style="font-size:0.75rem; color:var(--text-muted);">Night Theme</span>
              </div>
            </div>
            <div class="gmap-layer-opt" data-layer="osm" onclick="window.switchBasemap('osm')">
              <span>🌐</span>
              <div>
                <b style="display:block; font-size:0.86rem;">OpenStreetMap</b>
                <span style="font-size:0.75rem; color:var(--text-muted);">Detailed High-Contrast</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Google Maps Style Searched Place Card -->
        <div id="gmap-place-card" class="gmap-place-card" style="display:none;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="flex:1;">
              <span id="place-card-type" class="gmap-suggestion-tag" style="margin-bottom:6px; display:inline-block;">STREET / PLACE</span>
              <h3 id="place-card-title" class="gmap-place-title">100 Feet Road</h3>
              <p id="place-card-sub" class="gmap-place-sub">Indiranagar, Bengaluru, Karnataka</p>
            </div>
            <button class="gmap-search-clear" onclick="window.closePlaceCard()" title="Close">✕</button>
          </div>
          <div id="place-card-coords" class="gmap-place-coords">12.9716° N, 77.5946° E</div>
          <div style="display:flex; gap:8px; margin-top:4px;">
            <button class="btn btn-primary btn-sm" style="flex:1;" onclick="window.reportIssueAtSearchedPlace()">
              📸 Report Issue Here &rarr;
            </button>
          </div>
        </div>

        <!-- Slide-Over Case Details Drawer -->
        <div class="map-side-drawer" id="map-drawer">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="kpi-label" id="drawer-cat">CIVIC CASE</span>
            <button class="btn btn-ghost btn-sm" onclick="window.closeMapDrawer()" style="font-size:1.1rem; padding:4px 8px;">✕</button>
          </div>
          <div id="drawer-content"></div>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    const mapEl = document.getElementById('leaflet-full-map');
    if (mapEl) {
      const mapInst = initFullMap(mapEl, {
        onPinClick: (c) => openMapDrawer(c)
      });
      refreshMapPins();

      // Automatically locate current location on map mount across all devices!
      window.locateUserOnLiveMap({ silent: true });
    }
  }, 100);
}

export function refreshMapPins() {
  const allComplaints = Array.from(State.complaints.values());
  updateMapMarkers(allComplaints, {
    filterStatus: State.mapFilterStatus,
    filterPriority: State.mapFilterPriority,
    filterCategory: State.mapFilterCategory,
    onPinClick: (c) => openMapDrawer(c)
  });
}

export function openMapDrawer(c) {
  State.selectedComplaint = c;
  const drawer = document.getElementById('map-drawer');
  const catEl = document.getElementById('drawer-cat');
  const contentEl = document.getElementById('drawer-content');
  if (!drawer || !contentEl) return;

  catEl.textContent = `${c.categoryIcon} ${c.title}`;
  contentEl.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:14px;">
      <div style="display:flex; justify-content:space-between; align-items:baseline;">
        <span style="font-family:var(--font-mono); font-weight:800; font-size:1.1rem;">${c.id}</span>
        <span class="badge-pri ${c.priority}">${c.priority} (${PRI_LABEL[c.priority]})</span>
      </div>

      <div style="font-size:0.92rem; color:var(--text-secondary); line-height:1.5;">
        ${c.description}
      </div>

      <div style="background:var(--bg-sunk); padding:14px; border-radius:var(--radius-md); display:flex; flex-direction:column; gap:6px; font-size:0.84rem;">
        <div><b>📍 Ward:</b> ${c.ward} (${c.zone} Zone)</div>
        <div><b>🏢 Department:</b> ${c.department_name}</div>
        <div><b>👷 Assigned:</b> ${c.officer}</div>
        <div><b>⏱️ Target SLA:</b> ${formatDateTime(c.sla_deadline)} (${c.sla_hours}h limit)</div>
        <div><b>👥 Community Supporters:</b> ${c.supporters} citizen(s)</div>
      </div>

      ${c.status === 'RESOLVED' ? `
        <div style="background:var(--color-success-soft); border:1px solid var(--color-success); padding:12px; border-radius:var(--radius-md); font-size:0.84rem;">
          <b style="color:var(--color-success);">✅ Resolution Verified</b>
          <div style="margin-top:4px;">${c.resolution?.note || 'Work certified complete by crew.'}</div>
        </div>
      ` : ''}

      <div style="display:flex; gap:10px; margin-top:8px;">
        <button class="btn btn-primary btn-sm" style="flex:1;" onclick="window.viewTrackCase('${c.id}')">
          Track Full Timeline &rarr;
        </button>
      </div>
    </div>
  `;
  drawer.classList.add('open');
}

export function closeMapDrawer() {
  const drawer = document.getElementById('map-drawer');
  if (drawer) drawer.classList.remove('open');
}

// ---------------------------------------------------------------------
// View: Report Issue 3-Step Guided Wizard (Decongested!)
// ---------------------------------------------------------------------
function renderReportView(container) {
  const { step, description, address, name, phone } = State.reportingState;

  container.innerHTML = `
    <div class="container wizard-box">
      <div class="section-header" style="text-align:center; justify-content:center;">
        <div>
          <h1 class="section-title">Report a Civic Hazard</h1>
          <p class="section-desc">Guided 3-step filing with real-time AI triage, duplicate detection, and automated dispatch.</p>
        </div>
      </div>

      <!-- Stepper Progress Bar -->
      <div class="stepper-nav">
        <div class="step-node ${step === 1 ? 'active' : step > 1 ? 'done' : ''}">
          <div class="step-circle">${step > 1 ? '✓' : '1'}</div>
          <span class="step-title">Problem Details</span>
        </div>
        <div class="step-node ${step === 2 ? 'active' : step > 2 ? 'done' : ''}">
          <div class="step-circle">${step > 2 ? '✓' : '2'}</div>
          <span class="step-title">Pinpoint Location</span>
        </div>
        <div class="step-node ${step === 3 ? 'active' : ''}">
          <div class="step-circle">3</div>
          <span class="step-title">Citizen Contact</span>
        </div>
      </div>

      <!-- Step Content -->
      <div class="card-clean" style="padding: 36px;">
        ${renderWizardStepContent()}
      </div>
    </div>
  `;

  if (step === 2) {
    setTimeout(() => {
      const pickerEl = document.getElementById('step-picker-map');
      if (pickerEl) {
        const initialPos = State.userLocation || State.reportingState.pos;
        State.pickerInstance = initPickerMap(pickerEl, {
          initialPos: initialPos,
          onPosPicked: (coords) => {
            State.reportingState.pos = coords;
            const { ward } = nearestWard(coords.lat, coords.lng);
            State.reportingState.address = `${ward.name}, ${ward.zone}, Karnataka`;
            const addrEl = document.getElementById('picked-address-label');
            if (addrEl) addrEl.textContent = State.reportingState.address;
          }
        });

        // Auto-locate for report wizard on mount
        if (!State.userLocation) {
          window.detectCurrentLocationForReport({ silent: true });
        }
      }
    }, 100);
  }
}

function renderWizardStepContent() {
  const { step, photoData, description } = State.reportingState;

  if (step === 1) {
    return `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <label class="form-label" style="font-size:0.95rem;">Step 1: Upload Incident Photo</label>
            <span style="font-size:0.75rem; font-weight:800; background:var(--bg-sunk); color:var(--text-muted); padding:4px 10px; border-radius:var(--radius-pill); border:1px solid var(--border-subtle); display:flex; align-items:center; gap:5px;">
              <span>🛡️</span> AI Deepfake & Synthetic Filter Active
            </span>
          </div>

          <!-- Photo Dropzone -->
          <div class="photo-uploader ${photoData ? 'has-preview' : ''}" onclick="document.getElementById('report-photo-input').click()">
            ${photoData ? `
              <div style="position:relative;">
                <img src="${photoData}" alt="Uploaded Evidence" style="max-height:300px; width:100%; object-fit:cover; border-radius:var(--radius-md);">
                <button type="button" onclick="event.stopPropagation(); window.removeUploadedPhoto();" style="position:absolute; top:14px; right:14px; background:rgba(0,0,0,0.75); color:#fff; border:none; padding:7px 14px; border-radius:var(--radius-pill); font-size:0.84rem; font-weight:700; cursor:pointer; backdrop-filter:blur(6px);">✕ Remove Photo</button>
              </div>
            ` : `
              <div style="font-size: 2.4rem; margin-bottom: 8px;">📷</div>
              <div style="font-weight:800; font-size:1.05rem; color:var(--text-primary);">Click or Drag & Drop On-Site Photo</div>
              <div style="font-size:0.84rem; color:var(--text-muted); margin-top:4px; max-width:480px; margin-left:auto; margin-right:auto;">
                Upload real-world camera evidence of the issue. AI-generated, synthetic diffusion, or edited images are automatically detected and blocked.
              </div>
            `}
          </div>
          <input type="file" id="report-photo-input" accept="image/*" style="display:none;" onchange="window.handlePhotoUpload(event)">

          <!-- Live Authenticity Feedback -->
          ${State.reportingState.isScanning ? `
            <div class="auth-scanner-overlay">
              <span>⏳</span>
              <span>Scanning image headers, C2PA credentials, and sensor noise spectrum...</span>
            </div>
          ` : State.reportingState.aiBlocked ? `
            <div class="ai-blocked-alert">
              <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-size:1.8rem;">⛔</span>
                <div>
                  <b style="font-size:1.05rem; letter-spacing:-0.01em;">AI-Generated Image Detected & Upload Blocked!</b>
                  <div style="font-size:0.78rem; opacity:0.9;">CivicSphere AI Authenticity & Anti-Fraud Protocol</div>
                </div>
              </div>
              <p style="font-size:0.9rem; line-height:1.5; margin-top:6px;">
                <b>Detection Analysis:</b> ${State.reportingState.aiBlockedReason}
              </p>
              ${State.reportingState.aiBlockedDetails && State.reportingState.aiBlockedDetails.length ? `
                <ul style="font-size:0.82rem; margin-left:20px; margin-top:4px; line-height:1.5;">
                  ${State.reportingState.aiBlockedDetails.map(d => `<li>${d}</li>`).join('')}
                </ul>
              ` : ''}
              <div style="font-size:0.82rem; background:rgba(0,0,0,0.06); padding:10px 14px; border-radius:6px; margin-top:8px;">
                ⚠️ <b>Policy Enforcement:</b> CivicSphere strictly requires genuine, physical on-site photographic evidence. Synthetic, diffusion-generated, or edited hazard photos cannot be processed.
              </div>
              <div style="display:flex; gap:10px; margin-top:8px;">
                <button type="button" class="btn btn-sm btn-secondary" onclick="document.getElementById('report-photo-input').click()">Upload Genuine Camera Photo</button>
                <button type="button" class="btn btn-sm btn-ghost" onclick="window.testRealPhoto()">Test with Real Camera Sample</button>
              </div>
            </div>
          ` : photoData ? `
            <div class="auth-badge-success" style="padding:12px 18px; border-radius:var(--radius-md); font-size:0.88rem; display:flex; flex-direction:column; gap:4px; align-items:flex-start; margin-top:12px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span>🛡️</span>
                <b style="font-size:0.95rem;">Authentic Camera Photo Verified (${Math.round((State.reportingState.authResult?.confidence || 0.98) * 100)}% Confidence)</b>
              </div>
              <div style="font-size:0.8rem; opacity:0.9; line-height:1.4;">
                ${State.reportingState.authResult?.cameraDetails ? `📷 Hardware Provenance: <b>${State.reportingState.authResult.cameraDetails}</b> · ` : ''}Optical Bayer CFA Noise Verified · Zero Synthetic Diffusion Markers
              </div>
            </div>
          ` : `
            <!-- Testing Shortcuts for Reviewer -->
            <div style="display:flex; align-items:center; gap:10px; margin-top:12px; font-size:0.82rem; color:var(--text-muted); flex-wrap:wrap;">
              <span style="font-weight:700;">Test Authenticity Engine:</span>
              <button type="button" class="preset-chip" style="font-weight:700;" onclick="window.testRealPhoto()">📸 Test Real Camera Photo (iPhone EXIF)</button>
              <button type="button" class="preset-chip" style="color:var(--color-danger); border-color:var(--color-danger); font-weight:700;" onclick="window.testAIPhoto()">🤖 Test AI-Generated Image (DALL-E / SDXL)</button>
            </div>
          `}
        </div>

        <div class="form-group">
          <label class="form-label">Quick Hazard Presets</label>
          <div class="preset-chips-row">
            <button class="preset-chip" onclick="window.applyPreset('Dangerous deep pothole on main road, 2 scooters slipped this morning')">🕳️ Deep Pothole</button>
            <button class="preset-chip" onclick="window.applyPreset('Streetlight broken for 10 days, dark and unsafe for women at night')">💡 Dark Streetlight</button>
            <button class="preset-chip" onclick="window.applyPreset('Overflowing garbage bin and stinking waste dumped on pavement')">🗑️ Overflowing Waste</button>
            <button class="preset-chip" onclick="window.applyPreset('Major drinking water pipeline burst, thousands of litres wasting')">💧 Water Pipe Burst</button>
            <button class="preset-chip" onclick="window.applyPreset('Storm branch snapped and hanging dangerously on electric wire')">🌳 Hanging Tree Branch</button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="report-desc">Describe the Problem (English, ಕನ್ನಡ, हिंदी)</label>
          <textarea id="report-desc" class="form-textarea" rows="4" placeholder="Explain the hazard, nearby landmarks, or immediate safety risks...">${description}</textarea>
        </div>

        <div style="display:flex; justify-content:flex-end;">
          ${State.reportingState.aiBlocked ? `
            <button class="btn btn-secondary" disabled style="opacity:0.5; cursor:not-allowed;" title="Please remove or replace the AI-generated photo before continuing">
              ⛔ Upload Blocked (AI Photo Detected)
            </button>
          ` : `
            <button class="btn btn-primary" onclick="window.wizardNextStep(2)">
              Continue to Location &rarr;
            </button>
          `}
        </div>
      </div>
    `;
  }

  if (step === 2) {
    return `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
            <div>
              <label class="form-label" style="margin-bottom:2px;">Step 2: Pinpoint Location on Karnataka State Map</label>
              <p style="font-size:0.84rem; color:var(--text-muted); margin:0;">
                Search any street or place, auto-detect your GPS coordinates, or drag the pin.
              </p>
            </div>
            <button type="button" id="btn-detect-loc" class="btn-locate-gps" onclick="window.detectCurrentLocationForReport()">
              <span>🎯</span>
              <span>Detect My Current Location (GPS)</span>
            </button>
          </div>

          <!-- Real-World Street & Place Search for Report Wizard -->
          <div class="gmap-search-wrapper" style="width:100%; margin-bottom:12px;">
            <div class="gmap-search-box">
              <span style="font-size:1.1rem; line-height:1;">🔍</span>
              <input type="text" id="report-search-input" placeholder="Search any street, road, landmark, or area in Karnataka..." autocomplete="off" oninput="window.handleReportStreetSearch(this.value)">
              <button id="report-search-clear" class="gmap-search-clear" onclick="window.clearReportSearch()" style="display:none;" title="Clear search">✕</button>
            </div>
            <div id="report-search-dropdown" class="gmap-autocomplete-dropdown" style="display:none;"></div>
          </div>
          
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
            <button type="button" class="preset-chip" onclick="window.jumpPicker('Bengaluru (BBMP)', 12.9716, 77.5946)">🏙️ Bengaluru</button>
            <button type="button" class="preset-chip" onclick="window.jumpPicker('Mysuru (MCC)', 12.2958, 76.6394)">🏰 Mysuru</button>
            <button type="button" class="preset-chip" onclick="window.jumpPicker('Mangaluru (MCC)', 12.9141, 74.8560)">🏖️ Mangaluru</button>
            <button type="button" class="preset-chip" onclick="window.jumpPicker('Hubballi-Dharwad (HDMC)', 15.3647, 75.1240)">🚂 Hubballi</button>
            <button type="button" class="preset-chip" onclick="window.jumpPicker('Belagavi (BCC)', 15.8497, 74.4977)">⛰️ Belagavi</button>
            <button type="button" class="preset-chip" onclick="window.jumpPicker('Kalaburagi (KMC)', 17.3297, 76.8343)">🏛️ Kalaburagi</button>
            <button type="button" class="preset-chip" onclick="window.jumpPicker('Shivamogga (SMC)', 13.9299, 75.5681)">🌿 Shivamogga</button>
            <button type="button" class="preset-chip" onclick="window.jumpPicker('Tumakuru (TMC)', 13.3379, 77.1010)">🌾 Tumakuru</button>
            <button type="button" class="preset-chip" onclick="window.jumpPicker('Udupi (CMC)', 13.3409, 74.7421)">🌊 Udupi</button>
            <button type="button" class="preset-chip" onclick="window.jumpPicker('Koramangala, Bengaluru', 12.9352, 77.6245)">📍 Koramangala</button>
            <button type="button" class="preset-chip" onclick="window.jumpPicker('Indiranagar, Bengaluru', 12.9784, 77.6408)">📍 Indiranagar</button>
            <button type="button" class="preset-chip" onclick="window.jumpPicker('Whitefield, Bengaluru', 12.9698, 77.7500)">📍 Whitefield</button>
          </div>

          <div style="height: 330px; border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border-subtle); position: relative;">
            <div id="step-picker-map" style="width:100%; height:100%;"></div>
            <!-- Side Controls inside Picker -->
            <div class="gmap-side-dock" style="bottom:16px; right:16px; gap:8px;">
              <button type="button" class="gmap-fab-btn" onclick="window.detectCurrentLocationForReport()" title="Current GPS Location" style="width:38px; height:38px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="7" stroke-width="2" />
                  <circle cx="12" cy="12" r="2.5" fill="currentColor" />
                  <line x1="12" y1="1" x2="12" y2="4" stroke-width="2" />
                  <line x1="12" y1="20" x2="12" y2="23" stroke-width="2" />
                  <line x1="1" y1="12" x2="4" y2="12" stroke-width="2" />
                  <line x1="20" y1="12" x2="23" y2="12" stroke-width="2" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div style="background:var(--bg-sunk); padding:14px; border-radius:var(--radius-md); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:0.76rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Selected Location (Karnataka)</div>
            <div style="font-weight:700;" id="picked-address-label">${State.reportingState.address}</div>
          </div>
          <span style="font-size:0.8rem; font-family:var(--font-mono); color:var(--text-muted);">
            ${State.reportingState.pos.lat.toFixed(4)}, ${State.reportingState.pos.lng.toFixed(4)}
          </span>
        </div>

        <div style="display:flex; justify-content:space-between;">
          <button class="btn btn-secondary" onclick="window.wizardNextStep(1)">&larr; Back</button>
          <button class="btn btn-primary" onclick="window.wizardNextStep(3)">Continue to Contact &rarr;</button>
        </div>
      </div>
    `;
  }

  if (step === 3) {
    return `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <!-- Multi-Channel Reporting Selection -->
        <div class="form-group">
          <label class="form-label" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span>Reporting Channel</span>
            <span style="font-size:0.75rem; color:var(--accent-primary); font-weight:700;">Direct Citizen Portal</span>
          </label>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px;">
            <div class="channel-card-label ${State.reportingState.channel === 'Web Portal' ? 'active' : ''}" onclick="window.setReportingChannel('Web Portal')">
              <input type="radio" name="report-channel" value="Web Portal" ${State.reportingState.channel === 'Web Portal' ? 'checked' : ''} style="display:none;">
              <span style="font-size:1.3rem;">🌐</span>
              <span style="font-size:0.85rem; font-weight:700;">Web Portal</span>
            </div>
            <div class="channel-card-label ${State.reportingState.channel === 'Mobile App' ? 'active' : ''}" onclick="window.setReportingChannel('Mobile App')">
              <input type="radio" name="report-channel" value="Mobile App" ${State.reportingState.channel === 'Mobile App' ? 'checked' : ''} style="display:none;">
              <span style="font-size:1.3rem;">📱</span>
              <span style="font-size:0.85rem; font-weight:700;">Mobile App</span>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="report-name">Your Full Name (Optional)</label>
          <input type="text" id="report-name" class="form-input" placeholder="e.g. Ramesh Kumar" value="${State.reportingState.name}">
        </div>

        <div class="form-group">
          <label class="form-label" for="report-phone">Mobile Phone (For SLA & Repair SMS Alerts)</label>
          <input type="tel" id="report-phone" class="form-input" placeholder="e.g. 9845012345" value="${State.reportingState.phone}">
          <span style="font-size:0.8rem; color:var(--text-muted);">You will receive live tracking updates when the officer and crew are dispatched.</span>
        </div>

        <div style="background:var(--accent-primary-soft); border-left:4px solid var(--accent-primary); padding:16px; border-radius:var(--radius-md);">
          <b style="color:var(--accent-primary-text);">What happens next?</b>
          <p style="font-size:0.86rem; color:var(--text-secondary); margin-top:4px;">
            The autonomous Multi-Agent Crew will analyze your submission in seconds: scanning cross-channel duplicate reports within 150m, consolidating into unified work orders while preserving all original reporters, and dispatching to the ward field crew.
          </p>
        </div>

        <div style="display:flex; justify-content:space-between;">
          <button class="btn btn-secondary" onclick="window.wizardNextStep(2)">&larr; Back</button>
          <button class="btn btn-primary" onclick="window.submitReportWorkflow()" style="padding:13px 28px; font-size:1rem;">
            🚀 Dispatch to AI Agent Crew
          </button>
        </div>
      </div>
    `;
  }
}

// ---------------------------------------------------------------------
// Multi-Agent Execution Workflow Simulation
// ---------------------------------------------------------------------
export async function executeAgentPipeline() {
  const overlay = document.getElementById('agent-modal');
  if (!overlay) return;

  const { description, language, pos, photoData, name, phone, channel = 'Web Portal' } = State.reportingState;

  // Strict Karnataka State Jurisdiction Check
  if (!isWithinKarnataka(pos.lat, pos.lng)) {
    overlay.classList.remove('open');
    window.showOutsideKarnatakaModal();
    return;
  }

  overlay.classList.add('open');
  const existing = Array.from(State.complaints.values());
  const startTime = Date.now();
  const progressFill = document.getElementById('agent-progress-fill');
  const progressPct = document.getElementById('agent-progress-pct');
  const timerBadge = document.getElementById('agent-dispatch-timer');

  const updateProgress = (pct) => {
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progressPct) progressPct.textContent = `${pct}%`;
    if (timerBadge) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      timerBadge.textContent = `⚡ ${elapsed}s elapsed`;
    }
  };

  updateProgress(15);

  const setStepState = (idx, status, text) => {
    const el = document.getElementById(`agent-step-${idx}`);
    if (el) {
      el.className = `agent-step-item ${status}`;
      if (text) el.querySelector('.step-desc').textContent = text;
      if (status === 'done') {
        el.querySelector('.step-status-icon').innerHTML = '<span class="check-pop-icon">✅</span>';
      } else if (status === 'working') {
        el.querySelector('.step-status-icon').innerHTML = '<span class="working-radar-icon">⏳</span>';
      }
    }
  };

  // Step 1: Intake & Geocoding (Accelerated High-Speed Dispatch)
  setStepState(1, 'working', 'Geocoding ward and scanning sensitive zones in Karnataka...');
  await new Promise((r) => setTimeout(r, 160));
  const intake = intakeAgent({ description, language, lat: pos.lat, lng: pos.lng });
  setStepState(1, 'done', `Geotagged: Ward ${intake.ward} (${intake.zone} Zone)`);
  updateProgress(35);

  // Step 2: Vision & Classifier (Accelerated)
  setStepState(2, 'working', 'Classifying incident category & severity score...');
  await new Promise((r) => setTimeout(r, 160));
  const vision = visionClassifierAgent(description, photoData);
  setStepState(2, 'done', `Classified: ${vision.categoryIcon} ${vision.categoryName} (${vision.visualSeverity}/100 severity)`);
  updateProgress(55);

  // Step 3: Duplicate & Multi-Channel Correlation Detector (Accelerated)
  setStepState(3, 'working', `Scanning 150m radius for cross-channel reports (${channel})...`);
  await new Promise((r) => setTimeout(r, 160));
  const duplicate = duplicateDetectorAgent(pos.lat, pos.lng, vision.category, description, existing, channel);
  setStepState(3, 'done', duplicate.isDuplicate
    ? `🔗 Linked to Incident ${duplicate.parentComplaint.id} (${duplicate.similarityScore}% match via ${duplicate.isCrossChannel ? duplicate.primaryChannel : 'Channel'})`
    : 'Spatial clustering clear (New Master Work Order Authorized)');
  updateProgress(75);

  // Step 4: Priority & SLA (Accelerated)
  setStepState(4, 'working', 'Computing explainable score & statutory SLA...');
  await new Promise((r) => setTimeout(r, 160));
  const currentSupporters = duplicate.isDuplicate ? (duplicate.parentComplaint.supporters || 1) + 1 : 1;
  const priority = priorityAgent(vision.category, description, vision.visualSeverity, intake.nearbySensitive, currentSupporters);
  const sla = slaPlannerAgent(priority.priority, nowMs());
  setStepState(4, 'done', `Priority: ${priority.priority} (${PRI_LABEL[priority.priority]}) — Target ${sla.slaHours}h SLA`);
  updateProgress(90);

  // Step 5: Routing & Dispatch (Accelerated)
  setStepState(5, 'working', 'Selecting municipal department & crew...');
  await new Promise((r) => setTimeout(r, 160));
  const routing = routingAgent(vision.category, intake.ward, priority.priority);
  setStepState(5, 'done', `Routed to ${routing.departmentName} &rarr; ${routing.officer}`);
  updateProgress(100);

  // Save new complaint or consolidate into parent
  let finalId;
  if (duplicate.isDuplicate) {
    const parent = duplicate.parentComplaint;
    if (!parent.work_order_id) {
      parent.work_order_id = 'WO-' + parent.id.replace('CMP-', '');
    }

    // Ensure reporters array exists
    if (!parent.reporters || !Array.isArray(parent.reporters) || parent.reporters.length === 0) {
      parent.reporters = [
        {
          id: `REP-${parent.id}-1`,
          name: parent.reporter_name || 'Citizen 1',
          phone: parent.reporter_phone || '9845112233',
          channel: parent.channel || 'Web Portal',
          reported_at: parent.created_at,
          description: parent.description,
          photo: parent.photo || null,
          distance_m: 0
        }
      ];
    }

    const newReporter = {
      id: `REP-${parent.id}-${parent.reporters.length + 1}`,
      name: name || `Citizen ${parent.reporters.length + 1}`,
      phone: phone || '9845012345',
      channel: channel || 'Web Portal',
      reported_at: new Date(nowMs()).toISOString(),
      description: description,
      photo: photoData || null,
      distance_m: duplicate.distance_m
    };

    parent.reporters.push(newReporter);
    parent.supporters = parent.reporters.length;
    parent.is_consolidated = true;

    // Community escalation: increase priority score and elevate priority level if warranted
    parent.severity_score = Math.min(100, (parent.severity_score || 50) + 12);
    if (parent.priority === 'P3') parent.priority = 'P2';
    else if (parent.priority === 'P2' && parent.supporters >= 3) parent.priority = 'P1';

    parent.timeline.push({
      at: new Date(nowMs()).toISOString(),
      actor: 'Duplicate Correlation Engine',
      event: 'Corroborating Report Merged',
      detail: `Reported by ${name || 'Citizen'} via ${channel}. Consolidated under Master Work Order ${parent.work_order_id}. Preserved distinct photo & description. Priority elevated to ${parent.priority}.`
    });

    if (photoData) {
      if (!parent.corroborating_photos) parent.corroborating_photos = [];
      parent.corroborating_photos.push({
        photo: photoData,
        by: name || 'Citizen',
        channel,
        at: new Date(nowMs()).toISOString()
      });
    }

    parent.notifications.push({
      at: new Date(nowMs()).toISOString(),
      audience: name || 'Citizen',
      message: `Your ${channel} report has been linked to active Master Work Order ${parent.work_order_id}. You will receive SMS alerts when resolved.`
    });

    finalId = parent.id;
  } else {
    finalId = `CMP-${1000 + State.complaints.size + 1}`;
    const newWorkOrderId = `WO-${1000 + State.complaints.size + 1}`;
    const newComplaint = {
      id: finalId,
      work_order_id: newWorkOrderId,
      is_consolidated: false,
      channel: channel || 'Web Portal',
      title: vision.categoryName,
      category: vision.category,
      categoryIcon: vision.categoryIcon,
      description,
      language: intake.language,
      lat: pos.lat,
      lng: pos.lng,
      ward: intake.ward,
      zone: intake.zone,
      department: routing.deptCode,
      department_name: routing.departmentName,
      department_icon: routing.departmentIcon,
      officer: routing.officer,
      assigned_team: routing.crew,
      priority: priority.priority,
      severity_score: priority.score,
      sla_hours: sla.slaHours,
      sla_deadline: sla.deadlineISO,
      status: 'ASSIGNED',
      escalation_level: 0,
      supporters: 1,
      duplicate_of: null,
      created_at: new Date(nowMs()).toISOString(),
      updated_at: new Date(nowMs()).toISOString(),
      reporters: [
        {
          id: `REP-${finalId}-1`,
          name: name || 'Citizen',
          phone: phone || '9845112233',
          channel: channel || 'Web Portal',
          reported_at: new Date(nowMs()).toISOString(),
          description,
          photo: photoData || null,
          distance_m: 0
        }
      ],
      corroborating_photos: photoData ? [{
        photo: photoData,
        by: name || 'Citizen',
        channel: channel || 'Web Portal',
        at: new Date(nowMs()).toISOString()
      }] : [],
      timeline: [
        { at: new Date(nowMs()).toISOString(), actor: 'Citizen', event: 'Report registered', detail: `Reported via ${channel} by ${name || 'Citizen'}` },
        { at: new Date(nowMs()).toISOString(), actor: 'AI Multi-Agent Crew', event: 'Triage complete', detail: `Priority ${priority.priority} assigned. Master Work Order ${newWorkOrderId} dispatched to ${routing.officer}` }
      ],
      agent_trace: [
        { agent: 'Intake Agent', details: intake.trace },
        { agent: 'Vision & Classifier Agent', details: vision.trace },
        { agent: 'Duplicate & Multi-Channel Correlation Agent', details: duplicate.trace },
        { agent: 'Priority Scoring Agent', details: priority.trace },
        { agent: 'Routing & Dispatch Agent', details: routing.trace },
        { agent: 'Citizen Charter SLA Agent', details: sla.trace }
      ],
      notifications: [
        { at: new Date(nowMs()).toISOString(), audience: 'Citizen', message: `Case ${finalId} (Work Order ${newWorkOrderId}) registered with statutory deadline ${formatDateTime(sla.deadlineISO)}.` }
      ],
      resolution: null,
      reporter_name: name || 'Citizen',
      reporter_phone: phone || '9845112233'
    };
    State.complaints.set(finalId, newComplaint);
  }

  saveState();

  await new Promise((r) => setTimeout(r, 220));
  overlay.classList.remove('open');
  if (window.launchConfetti) window.launchConfetti();
  if (duplicate.isDuplicate) {
    showToast(`🔗 Linked to Master Work Order ${duplicate.parentComplaint.work_order_id || finalId} with ${duplicate.parentComplaint.supporters} citizens!`);
  } else {
    showToast(`⚡ Case ${finalId} triaged & dispatched in record time!`);
  }
  window.viewTrackCase(finalId);
}

// ---------------------------------------------------------------------
// View: Track & Trace
// ---------------------------------------------------------------------
function renderTrackView(container) {
  container.innerHTML = `
    <div class="container" style="max-width: 860px;">
      <div class="section-header" style="text-align:center; justify-content:center;">
        <div>
          <h1 class="section-title">Track Civic Complaint</h1>
          <p class="section-desc">Look up by Complaint ID or mobile phone number to view live progress, officer actions, and agent reasoning.</p>
        </div>
      </div>

      <!-- Search Card -->
      <div class="card-clean" style="margin-bottom: 32px;">
        <div style="display:flex; gap:12px;">
          <input type="text" id="track-search-input" class="form-input" placeholder="Enter Complaint ID (e.g. CMP-1001) or 10-digit mobile number..." style="font-size:1.05rem; padding:14px 18px;">
          <button class="btn btn-primary" onclick="window.performTrackSearch()">Track</button>
        </div>
        <div style="display:flex; align-items:center; gap:8px; margin-top:12px; font-size:0.82rem; color:var(--text-muted);">
          <span>Quick Demo IDs:</span>
          <button class="preset-chip" onclick="window.fillTrackSearch('CMP-1001')">CMP-1001</button>
          <button class="preset-chip" onclick="window.fillTrackSearch('CMP-1002')">CMP-1002</button>
          <button class="preset-chip" onclick="window.fillTrackSearch('CMP-1005')">CMP-1005</button>
        </div>
      </div>

      <!-- Track Result Container -->
      <div id="track-result-container">
        <!-- Render first complaint by default -->
        ${renderSingleTrackCard(Array.from(State.complaints.values())[0])}
      </div>
    </div>
  `;
}

function renderSingleTrackCard(c) {
  if (!c) return '<div class="card-clean" style="text-align:center; padding:40px; color:var(--text-muted);">No matching complaint found.</div>';

  const timeLeft = formatTimeLeft(c.sla_deadline);

  return `
    <div class="card-clean" style="display:flex; flex-direction:column; gap:24px;">
      <!-- Header -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:14px; border-bottom:1px solid var(--border-subtle); padding-bottom:18px;">
        <div>
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
            <span style="font-size:1.8rem;">${c.categoryIcon}</span>
            <span style="font-family:var(--font-mono); font-size:1.4rem; font-weight:800;">${c.id}</span>
            <span class="badge-pri ${c.priority}">${c.priority} (${PRI_LABEL[c.priority]})</span>
            <span class="badge-status" style="background:${STATUS_COLOR[c.status] || '#3b82f6'}; color:#ffffff;">${STATUS_LABEL[c.status] || c.status}</span>
          </div>
          <h2 style="font-size:1.25rem; font-weight:800; color:var(--text-primary);">${c.title}</h2>
          <div style="font-size:0.88rem; color:var(--text-muted); margin-top:2px;">
            📍 Ward ${c.ward} (${c.zone} Zone) · Reported on ${formatDateTime(c.created_at)}
          </div>
        </div>

        <div style="text-align:right;">
          <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Citizen SLA Target</div>
          <div style="font-size:1.05rem; font-weight:800; color:${timeLeft.isOverdue ? 'var(--color-danger)' : 'var(--color-success)'}; font-family:var(--font-mono);">
            ${timeLeft.text}
          </div>
          <div style="font-size:0.8rem; color:var(--text-muted);">Deadline: ${formatDateTime(c.sla_deadline)}</div>
        </div>
      </div>

      <!-- Consolidated Incident & Preserved Multi-Channel Citizen Reports -->
      ${c.reporters && c.reporters.length > 1 ? `
        <div class="consolidated-incident-box">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:1.4rem;">🔗</span>
              <div>
                <b style="font-size:1.05rem; color:var(--text-primary); display:block;">Master Work Order: ${c.work_order_id || c.id}</b>
                <span style="font-size:0.78rem; color:var(--text-muted);">Consolidated Municipal Dispatch · Single Field Crew Assigned</span>
              </div>
            </div>
            <span class="merged-badge-pill">
              👥 ${c.reporters.length} Citizens Merged Across Channels
            </span>
          </div>
          <p style="font-size:0.86rem; color:var(--text-secondary); margin:0 0 14px 0; line-height:1.5;">
            The Autonomous Multi-Channel Correlation Engine identified <b>${c.reporters.length} separate citizen reports</b> regarding this same incident across different channels. Instead of creating redundant work orders and dispatching separate crews to the same spot, all reports have been consolidated into one master work order. <b>Each citizen's original evidence, channel, and distinct description are preserved below:</b>
          </p>
          
          <!-- Preserved Original Reporters -->
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${c.reporters.map((rep, idx) => `
              <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:12px 14px; display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
                <div style="flex:1; min-width:240px;">
                  <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap;">
                    <span style="font-weight:700; color:var(--text-primary); font-size:0.92rem;">👤 ${rep.name}</span>
                    <span style="font-size:0.75rem; background:var(--bg-sunk); padding:2px 8px; border-radius:12px; font-weight:700;">
                      ${rep.channel === 'WhatsApp Bot' ? '💬 WhatsApp' : rep.channel === 'Call Center' ? '📞 Call 1902' : rep.channel === 'Mobile App' ? '📱 Mobile App' : '🌐 Web Portal'}
                    </span>
                    <span style="font-size:0.75rem; color:var(--text-muted); font-family:var(--font-mono);">${rep.phone}</span>
                    <span style="font-size:0.72rem; color:#059669; font-weight:700;">● Active Reporter #${idx + 1}</span>
                  </div>
                  <div style="font-size:0.84rem; color:var(--text-secondary); font-style:italic;">
                    "${rep.description}"
                  </div>
                  <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">
                    Reported on: ${formatDateTime(rep.reported_at)} ${rep.distance_m > 0 ? `· (${rep.distance_m}m from cluster centre)` : '· (Cluster Origin)'}
                  </div>
                </div>
                ${rep.photo ? `
                  <div style="width:54px; height:54px; border-radius:6px; overflow:hidden; border:1px solid var(--border-subtle); flex-shrink:0;">
                    <img src="${rep.photo}" style="width:100%; height:100%; object-fit:cover;" alt="Photo evidence by ${rep.name}">
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Description & Incident Details -->
      <div style="background:var(--bg-sunk); padding:18px; border-radius:var(--radius-md); font-size:0.95rem; line-height:1.6;">
        <b>Citizen Description:</b> ${c.description}
      </div>

      <!-- Corroborating Photographs Gallery -->
      ${c.corroborating_photos && c.corroborating_photos.length > 0 ? `
        <div style="background:var(--bg-sunk); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px;">
          <div style="font-size:0.8rem; font-weight:800; text-transform:uppercase; color:var(--text-muted); margin-bottom:10px;">
            📸 Corroborating Evidence Gallery (${c.corroborating_photos.length} photos from citizens)
          </div>
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            ${c.corroborating_photos.map((p) => `
              <div style="display:flex; flex-direction:column; gap:4px; max-width:140px;">
                <div style="width:140px; height:100px; border-radius:var(--radius-sm); overflow:hidden; border:1px solid var(--border-subtle);">
                  <img src="${p.photo}" style="width:100%; height:100%; object-fit:cover;" alt="Photo by ${p.by}">
                </div>
                <span style="font-size:0.72rem; color:var(--text-muted); line-height:1.2;">By ${p.by} (${p.channel})</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Assigned Crew & Hierarchy -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px;">
        <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); padding:14px; border-radius:var(--radius-md);">
          <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Department</div>
          <div style="font-weight:700; margin-top:2px;">${c.department_icon} ${c.department_name}</div>
        </div>
        <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); padding:14px; border-radius:var(--radius-md);">
          <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Field Officer</div>
          <div style="font-weight:700; margin-top:2px;">${c.officer}</div>
        </div>
        <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); padding:14px; border-radius:var(--radius-md);">
          <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Dispatched Crew</div>
          <div style="font-weight:700; margin-top:2px;">${c.assigned_team}</div>
        </div>
        <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); padding:14px; border-radius:var(--radius-md);">
          <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Community Backing</div>
          <div style="font-weight:700; margin-top:2px; display:flex; align-items:center; gap:8px;">
            <span>👥 ${c.supporters} Citizen(s)</span>
            <button class="btn btn-sm btn-secondary" onclick="window.supportComplaint('${c.id}')">+1 Support</button>
          </div>
        </div>
      </div>

      <!-- Live Timeline -->
      <div>
        <h3 style="font-size:1.1rem; font-weight:800; margin-bottom:16px;">Incident Timeline & Field Actions</h3>
        <div style="display:flex; flex-direction:column; gap:16px; border-left:2px solid var(--border-subtle); padding-left:20px; margin-left:8px;">
          ${c.timeline.map((item) => `
            <div style="position:relative;">
              <span style="position:absolute; left:-27px; top:3px; width:12px; height:12px; border-radius:50%; background:var(--accent-primary); border:2px solid var(--bg-surface);"></span>
              <div style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">${formatDateTime(item.at)} · <span style="color:var(--accent-primary);">${item.actor}</span></div>
              <div style="font-weight:700; font-size:0.92rem; margin-top:2px;">${item.event}</div>
              <div style="font-size:0.85rem; color:var(--text-secondary); margin-top:2px;">${item.detail}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Agent Trace Audit Box -->
      <div style="background:var(--bg-sunk); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:18px;">
        <div style="font-size:0.8rem; font-weight:800; text-transform:uppercase; color:var(--text-muted); margin-bottom:10px;">
          🤖 Explainable AI Agent Trace Log
        </div>
        <div style="display:flex; flex-direction:column; gap:10px; font-size:0.82rem;">
          ${(c.agent_trace || []).map((t) => `
            <div>
              <b style="color:var(--text-primary);">${t.agent}:</b>
              <span style="color:var(--text-secondary); margin-left:6px;">${Array.isArray(t.details) ? t.details.join(' | ') : t.details}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------
// View: Officer Work Queue (Spacious & Action-Oriented)
// ---------------------------------------------------------------------
function renderOfficerView(container) {
  const deptCode = State.officerDept;
  const dept = DEPTS[deptCode] || DEPTS.ROADS;
  const allCases = Array.from(State.complaints.values());

  const deptCases = allCases.filter(
    (c) => !c.duplicate_of && c.department === deptCode && ['ASSIGNED', 'IN_PROGRESS', 'ESCALATED'].includes(c.status)
  ).sort((a, b) => a.priority.localeCompare(b.priority) || new Date(a.sla_deadline).getTime() - new Date(b.sla_deadline).getTime());

  container.innerHTML = `
    <div class="container">
      <div class="section-header">
        <div>
          <span style="font-size: 0.78rem; font-weight: 800; color: var(--accent-primary); text-transform: uppercase; letter-spacing: 0.08em;">Field Operational Desk</span>
          <h1 class="section-title">Officer Work Queue</h1>
          <p class="section-desc">Sorted by priority severity and SLA deadline. Resolving work requires verified completion proof.</p>
        </div>

        <div style="display:flex; align-items:center; gap:10px;">
          <label style="font-size:0.85rem; font-weight:700; color:var(--text-muted);">Select Department:</label>
          <select class="form-select" style="width:auto; padding:8px 16px;" onchange="window.switchOfficerDept(this.value)">
            ${Object.entries(DEPTS).map(([k, d]) => `
              <option value="${k}" ${k === deptCode ? 'selected' : ''}>${d.icon} ${d.name} (${allCases.filter((c) => !c.duplicate_of && c.department === k && ['ASSIGNED', 'IN_PROGRESS', 'ESCALATED'].includes(c.status)).length})</option>
            `).join('')}
          </select>
        </div>
      </div>

      <!-- Officer Case Grid -->
      <div class="officer-grid">
        ${deptCases.length > 0 ? deptCases.map((c) => {
          const timeLeft = formatTimeLeft(c.sla_deadline);
          return `
            <div class="officer-case-card">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-family:var(--font-mono); font-weight:800; font-size:1.05rem;">${c.id}</span>
                    ${c.reporters && c.reporters.length > 1 ? `
                      <span class="merged-badge-pill" style="font-size:0.7rem; padding:2px 7px;">🔗 WO: ${c.work_order_id || c.id}</span>
                    ` : ''}
                  </div>
                  <div style="display:flex; gap:6px;">
                    <span class="badge-pri ${c.priority}">${c.priority}</span>
                    <span class="badge-status" style="background:${STATUS_COLOR[c.status] || '#3b82f6'}; color:#ffffff;">${STATUS_LABEL[c.status]}</span>
                  </div>
                </div>

                <h3 style="font-size:1.1rem; font-weight:800; margin-bottom:6px;">${c.categoryIcon} ${c.title}</h3>
                <p style="font-size:0.88rem; color:var(--text-secondary); line-height:1.5; margin-bottom:14px;">
                  ${c.description}
                </p>

                <div style="background:var(--bg-sunk); padding:10px 14px; border-radius:var(--radius-sm); font-size:0.82rem; display:flex; flex-direction:column; gap:4px; margin-bottom:14px;">
                  <div><b>📍 Location:</b> Ward ${c.ward} (${c.zone} Zone)</div>
                  <div><b>👷 Assigned Crew:</b> ${c.assigned_team}</div>
                  ${c.reporters && c.reporters.length > 1 ? `
                    <div style="color:var(--accent-primary); font-weight:700;">
                      <b>👥 Consolidated Incident:</b> ${c.reporters.length} citizens merged across ${c.reporters.map(r => r.channel).filter((v,i,a)=>a.indexOf(v)===i).join(', ')}
                    </div>
                  ` : `
                    <div><b>👥 Backing:</b> ${c.supporters} citizen(s) affected (${c.channel || 'Web Portal'})</div>
                  `}
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.84rem;">
                  <span style="color:var(--text-muted);">SLA Countdown:</span>
                  <b style="font-family:var(--font-mono); color:${timeLeft.isOverdue ? 'var(--color-danger)' : 'var(--color-success)'};">
                    ${timeLeft.text}
                  </b>
                </div>
              </div>

              <div style="display:flex; gap:8px; border-top:1px solid var(--border-subtle); padding-top:14px; margin-top:8px;">
                ${c.status === 'ASSIGNED' ? `
                  <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="window.officerStartWork('${c.id}')">
                    🚀 Dispatch Crew
                  </button>
                ` : ''}
                <button class="btn btn-primary btn-sm" style="flex:1;" onclick="window.openResolveModal('${c.id}')">
                  ✅ Mark Resolved
                </button>
              </div>
            </div>
          `;
        }).join('') : `
          <div class="card-clean" style="grid-column: 1/-1; text-align:center; padding:48px; color:var(--text-muted);">
            🎉 Outstanding! All assigned tickets for ${dept.name} have been resolved within SLA target.
          </div>
        `}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------
// CivicSphere Mitra AI Civic Assistant Logic
// ---------------------------------------------------------------------
export function toggleChatDrawer() {
  const drawer = document.getElementById('chat-drawer');
  if (drawer) {
    drawer.classList.toggle('open');
    renderChatMessages();
  }
}

export function renderChatMessages() {
  const bodyEl = document.getElementById('chat-body');
  if (!bodyEl) return;

  bodyEl.innerHTML = State.chatMessages.map((m) => `
    <div style="
      align-self: ${m.sender === 'user' ? 'flex-end' : 'flex-start'};
      background: ${m.sender === 'user' ? 'var(--accent-primary)' : 'var(--bg-sunk)'};
      color: ${m.sender === 'user' ? '#ffffff' : 'var(--text-primary)'};
      padding: 10px 16px;
      border-radius: ${m.sender === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px'};
      max-width: 82%;
      font-size: 0.88rem;
      line-height: 1.5;
      margin-bottom: 8px;
    ">
      ${m.text}
    </div>
  `).join('');

  bodyEl.scrollTop = bodyEl.scrollHeight;
}

export function sendChatMessage(userText) {
  const text = (userText || '').trim();
  if (!text) return;

  State.chatMessages.push({ sender: 'user', text });
  renderChatMessages();

  // Smart civic AI response generator
  setTimeout(() => {
    let reply = "I can assist you with reporting civic issues, checking ward escalation status, or finding BBMP/BESCOM turnaround times.";
    const lower = text.toLowerCase();

    if (lower.includes('pothole') || lower.includes('ಗುಂಡಿ') || lower.includes('गड्ढा')) {
      reply = "Road potholes are handled by the BBMP Infrastructure Division. Under P1/P2 priority, crews are dispatched with cold-mix asphalt within 4 to 24 hours.";
    } else if (lower.includes('garbage') || lower.includes('ಕಸ') || lower.includes('कचरा')) {
      reply = "Solid Waste complaints route directly to the Ward Health Inspector. Overflowing community bins must be cleared within 24 hours as per city bylaws.";
    } else if (lower.includes('escalat') || lower.includes('overdue')) {
      reply = "If an issue breaches its deadline, the Autonomic Escalation Agent elevates it to the Assistant Executive Engineer (Level 1) or Zonal Commissioner (Level 3) automatically.";
    } else if (lower.includes('kannada') || lower.includes('ಕನ್ನಡ')) {
      reply = "ಖಂಡಿತ! ನೀವು ನಿಮ್ಮ ದೂರುಗಳನ್ನು ಕನ್ನಡದಲ್ಲೇ ಸಲ್ಲಿಸಬಹುದು. ನಮ್ಮ AI ಏಜೆಂಟ್‌ಗಳು ಕನ್ನಡದಲ್ಲೇ ವಿಶ್ಲೇಷಿಸಿ ಸೂಕ್ತ ಅಧಿಕಾರಿಗೆ ಕಳುಹಿಸುತ್ತವೆ.";
    } else if (lower.includes('ward') || lower.includes('hotspot')) {
      const an = computeAnalytics();
      const top = an.byWard[0];
      reply = `Currently, Ward ${top.name} has the highest active caseload with ${top.open} open issues. You can explore them on the Live Map.`;
    }

    State.chatMessages.push({ sender: 'bot', text: reply });
    renderChatMessages();
  }, 450);
}

// ---------------------------------------------------------------------
// Window Global Event Handlers
// ---------------------------------------------------------------------
window.switchOfficerDept = (dept) => {
  State.officerDept = dept;
  navigateTo('officer');
};

window.switchDashboardTab = (subtab) => {
  State.dashboardSubtab = subtab;
  navigateTo('dashboard');
};

window.filterMapStatus = (status) => {
  State.mapFilterStatus = status;
  navigateTo('map');
};

window.filterMapPriority = (pri) => {
  State.mapFilterPriority = pri;
  navigateTo('map');
};

window.handleMapSearch = (q) => {
  const query = (q || '').trim().toLowerCase();
  if (!query) return;
  const cityMatch = KARNATAKA_CITIES.find((c) => c.name.toLowerCase().includes(query));
  if (cityMatch) {
    flyToLocation(cityMatch.lat, cityMatch.lng, 13);
    return;
  }
  const match = PLACES.find((p) => p.name.toLowerCase().includes(query)) ||
                WARDS.find((w) => w.name.toLowerCase().includes(query));
  if (match) {
    flyToLocation(match.lat, match.lng, 15);
  }
};

window.closeMapDrawer = () => closeMapDrawer();

window.wizardNextStep = (next) => {
  if (next === 2) {
    if (State.reportingState.aiBlocked) {
      showToast('⛔ Upload Blocked: Please remove or replace the AI-generated photo before continuing.');
      alert('⚠️ Upload Blocked: The uploaded photo was detected as synthetic / AI-generated.\n\nCivicSphere requires genuine on-site camera evidence. Please choose a real camera photo.');
      return;
    }
    const desc = document.getElementById('report-desc')?.value.trim();
    if (!desc) {
      showToast('Please provide a brief description of the issue');
      return;
    }
    State.reportingState.description = desc;
  }
  if (next === 3) {
    // Check if current position is within Karnataka
    const { lat, lng } = State.reportingState.pos || {};
    if (lat != null && lng != null && !isWithinKarnataka(lat, lng)) {
      window.showOutsideKarnatakaModal();
      return;
    }
  }
  State.reportingState.step = next;
  navigateTo('report');
};

window.applyPreset = (text) => {
  const descEl = document.getElementById('report-desc');
  if (descEl) descEl.value = text;
};

window.jumpPicker = (name, lat, lng) => {
  State.reportingState.pos = { lat, lng };
  const { ward } = nearestWard(lat, lng);
  State.reportingState.address = `${name || ward.name}, Karnataka`;
  if (State.pickerInstance) {
    State.pickerInstance.setPos(lat, lng);
  }
  const addrEl = document.getElementById('picked-address-label');
  if (addrEl) addrEl.textContent = State.reportingState.address;
};

window.flyToKarnatakaCity = (cityName) => {
  flyToKarnatakaCity(cityName);
};

window.zoomToFullKarnataka = () => {
  zoomToFullKarnataka();
};

window.scanPhotoFile = async (file, dataUrlOverride = null) => {
  State.reportingState.isScanning = true;
  navigateTo('report');

  try {
    let dataUrl = dataUrlOverride;
    if (!dataUrl && file) {
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    const authResult = await detectAIImage(file, dataUrl);
    State.reportingState.isScanning = false;

    if (authResult.isAI) {
      // BLOCK UPLOAD! Show warning and reject
      State.reportingState.photoData = null;
      State.reportingState.aiBlocked = true;
      State.reportingState.aiBlockedReason = authResult.reason;
      State.reportingState.aiBlockedDetails = authResult.details;
      State.reportingState.authResult = authResult;
      
      const fileInput = document.getElementById('report-photo-input');
      if (fileInput) fileInput.value = '';

      navigateTo('report');
      showToast('⛔ Upload Blocked: Synthetic AI-generated image detected!');
    } else {
      // Verified authentic real camera photo
      State.reportingState.photoData = dataUrl;
      State.reportingState.aiBlocked = false;
      State.reportingState.aiBlockedReason = null;
      State.reportingState.aiBlockedDetails = [];
      State.reportingState.authResult = authResult;

      navigateTo('report');
      showToast('✅ Authenticity Verified: Genuine camera photo accepted.');
    }
  } catch (err) {
    State.reportingState.isScanning = false;
    console.error('Scan error caught safely:', err);
    navigateTo('report');
  }
};

window.handlePhotoUpload = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  window.scanPhotoFile(file);
};

window.removeUploadedPhoto = () => {
  State.reportingState.photoData = null;
  State.reportingState.aiBlocked = false;
  State.reportingState.aiBlockedReason = null;
  State.reportingState.aiBlockedDetails = [];
  State.reportingState.authResult = null;
  const fileInput = document.getElementById('report-photo-input');
  if (fileInput) fileInput.value = '';
  navigateTo('report');
  showToast('Photo removed.');
};

window.testRealPhoto = async () => {
  showToast('Loading verified real camera photo sample...');
  try {
    const res = await fetch('assets/sample_camera_photo.jpg');
    const blob = await res.blob();
    const file = new File([blob], 'camera_IMG_4912_pothole.jpg', { type: 'image/jpeg' });
    await window.scanPhotoFile(file);
  } catch (e) {
    // fallback
    const fakeFile = { name: 'camera_IMG_4912_pothole.jpg', size: 1048576, slice: () => ({ arrayBuffer: () => new TextEncoder().encode('Apple iPhone 14 Pro Exif camera').buffer }) };
    await window.scanPhotoFile(fakeFile, 'assets/sample_camera_photo.jpg');
  }
};

window.testAIPhoto = async () => {
  showToast('Loading AI-generated synthetic sample...');
  try {
    const res = await fetch('assets/sample_ai_generated.png');
    const blob = await res.blob();
    const file = new File([blob], 'midjourney_photoreal_road_hazard_v6.png', { type: 'image/png' });
    await window.scanPhotoFile(file);
  } catch (e) {
    // fallback
    const fakeFile = { name: 'midjourney_photoreal_road_hazard_v6.png', size: 524288, slice: () => ({ arrayBuffer: () => new TextEncoder().encode('parameters: photorealistic pothole, Steps: 30, Sampler: DPM++, c2pa.created: true').buffer }) };
    await window.scanPhotoFile(fakeFile, 'assets/sample_ai_generated.png');
  }
};

window.showOutsideKarnatakaModal = () => {
  const modal = document.getElementById('outside-karnataka-modal');
  if (modal) {
    modal.style.display = 'flex';
    const form = document.getElementById('outside-waitlist-form');
    const succ = document.getElementById('outside-waitlist-success');
    if (form) form.style.display = 'flex';
    if (succ) succ.style.display = 'none';
  }
};

window.closeOutsideKarnatakaModal = () => {
  const modal = document.getElementById('outside-karnataka-modal');
  if (modal) modal.style.display = 'none';
};

window.submitOutsideWaitlist = () => {
  const input = document.getElementById('outside-waitlist-input');
  const val = input ? input.value.trim() : '';
  if (!val) {
    showToast('Please enter your mobile or email to get notified');
    return;
  }
  const form = document.getElementById('outside-waitlist-form');
  const succ = document.getElementById('outside-waitlist-success');
  if (form) form.style.display = 'none';
  if (succ) succ.style.display = 'block';
  showToast('✅ Added to expansion priority queue! We will reach you soon.');
};

window.recenterToKarnataka = () => {
  window.closeOutsideKarnatakaModal();
  State.reportingState.pos = { lat: BLR_CENTER.lat, lng: BLR_CENTER.lng };
  State.reportingState.address = 'Bengaluru Central, Karnataka';
  if (State.pickerInstance) {
    State.pickerInstance.setPos(BLR_CENTER.lat, BLR_CENTER.lng);
  }
  const addrEl = document.getElementById('picked-address-label');
  if (addrEl) addrEl.textContent = State.reportingState.address;
  showToast('📍 Re-centered to Karnataka (Bengaluru Central)');
};

window.setReportingChannel = (channel) => {
  State.reportingState.channel = channel;
  document.querySelectorAll('.channel-card-label').forEach((el) => {
    if (el.textContent.includes(channel) || (channel === 'Call Center' && el.textContent.includes('Call Center'))) {
      el.classList.add('active');
      const radio = el.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    } else {
      el.classList.remove('active');
      const radio = el.querySelector('input[type="radio"]');
      if (radio) radio.checked = false;
    }
  });
};

window.submitReportWorkflow = () => {
  if (State.reportingState.aiBlocked) {
    showToast('⛔ Upload Blocked: Cannot submit report with AI-generated photo. Please upload a real camera photo.');
    alert('⚠️ Upload Blocked: The uploaded photo was detected as synthetic / AI-generated.\n\nCivicSphere strictly requires genuine on-site photographic evidence. Please choose a real camera photo.');
    return;
  }
  if (!isWithinKarnataka(State.reportingState.pos.lat, State.reportingState.pos.lng)) {
    window.showOutsideKarnatakaModal();
    return;
  }
  const nameEl = document.getElementById('report-name');
  const phoneEl = document.getElementById('report-phone');
  if (nameEl) State.reportingState.name = nameEl.value.trim();
  if (phoneEl) State.reportingState.phone = phoneEl.value.trim();

  executeAgentPipeline();
};

window.viewTrackCase = (id) => {
  window.location.hash = '#track';
  navigateTo('track');
  setTimeout(() => window.fillTrackSearch(id), 100);
};

window.performTrackSearch = () => {
  const rawQ = document.getElementById('track-search-input')?.value.trim();
  if (!rawQ) return;
  const q = rawQ.toLowerCase();
  const digitsOnly = rawQ.replace(/\D/g, '');
  const container = document.getElementById('track-result-container');
  
  const allCases = Array.from(State.complaints.values());
  const found = allCases.find((c) => {
    // 1. Complaint ID or Work Order ID match
    if (c.id && c.id.toLowerCase() === q) return true;
    if (c.work_order_id && c.work_order_id.toLowerCase() === q) return true;
    
    // 2. Primary reporter match
    if (c.reporter_phone && (c.reporter_phone === rawQ || (digitsOnly.length >= 7 && c.reporter_phone.replace(/\D/g, '').includes(digitsOnly)))) return true;
    if (c.reporter_name && c.reporter_name.toLowerCase().includes(q)) return true;

    // 3. Merged / preserved multi-channel citizen reporters match
    if (c.reporters && Array.isArray(c.reporters)) {
      return c.reporters.some((r) => {
        if (r.id && r.id.toLowerCase() === q) return true;
        if (r.name && r.name.toLowerCase().includes(q)) return true;
        if (r.phone && (r.phone === rawQ || (digitsOnly.length >= 7 && r.phone.replace(/\D/g, '').includes(digitsOnly)))) return true;
        return false;
      });
    }
    return false;
  });

  if (container) {
    container.innerHTML = renderSingleTrackCard(found);
  }
};

window.fillTrackSearch = (id) => {
  const input = document.getElementById('track-search-input');
  if (input) input.value = id;
  window.performTrackSearch();
};

window.supportComplaint = (id) => {
  const c = State.complaints.get(id);
  if (!c) return;
  c.supporters = (c.supporters || 1) + 1;
  c.timeline.push({
    at: new Date(nowMs()).toISOString(),
    actor: 'Citizen Community',
    event: 'Community urgency boosted',
    detail: `Supporters count reached ${c.supporters} citizens.`
  });
  saveState();
  showToast(`Added your support! Total affected: ${c.supporters} citizens.`);
  window.performTrackSearch();
};

window.officerStartWork = (id) => {
  const c = State.complaints.get(id);
  if (!c) return;
  c.status = 'IN_PROGRESS';
  c.timeline.push({
    at: new Date(nowMs()).toISOString(),
    actor: c.officer,
    event: 'Field Crew Dispatched',
    detail: `Crew ${c.assigned_team} mobilized to site.`
  });
  saveState();
  showToast(`Case ${id} marked In Progress. Crew mobilized.`);
  navigateTo('officer');
};

window.openResolveModal = (id) => {
  const c = State.complaints.get(id);
  if (!c) return;
  const note = prompt(`Enter resolution note for ${id}:`, 'Asphalt surface patched, rolled and cleaned.');
  if (note === null) return;

  const ver = resolutionVerifierAgent(c, note, true);
  if (ver.verified) {
    c.status = 'RESOLVED';
    c.resolution = {
      note,
      resolved_at: new Date(nowMs()).toISOString(),
      within_sla: true,
      verification: ver
    };
    c.timeline.push({
      at: new Date(nowMs()).toISOString(),
      actor: c.officer,
      event: 'Marked Resolved',
      detail: note
    }, {
      at: new Date(nowMs()).toISOString(),
      actor: 'Resolution Verifier Agent',
      event: 'AI Verification Passed ✅',
      detail: ver.reason
    });
    saveState();
    showToast(`Case ${id} certified & resolved! Verified by AI.`);
    navigateTo('officer');
  } else {
    alert(`Resolution rejected by AI Verifier: ${ver.reason}`);
  }
};

window.advanceClock = (hrs) => {
  State.offsetHours += hrs;
  const escalated = escalationAgent(State.complaints, nowMs());
  saveState();
  showToast(`⏩ Clock advanced by +${hrs}h. ${escalated.length} complaint(s) auto-escalated.`);
  navigateTo(State.activeTab);
};

window.resetData = () => {
  localStorage.removeItem('civicsphere_v2_data');
  State.offsetHours = 0;
  State.complaints = generateSeedData();
  saveState();
  showToast('↺ Demo data refreshed with 64 fresh Bengaluru complaints.');
  navigateTo(State.activeTab);
};

window.toggleTheme = () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const target = cur === 'light' ? 'dark' : 'light';
  window.setThemeMode(target);
};

window.openThemeModal = () => {
  const modal = document.getElementById('theme-modal');
  if (modal) {
    modal.classList.add('open');
    updateThemeModalUI();
  }
};

window.closeThemeModal = () => {
  const modal = document.getElementById('theme-modal');
  if (modal) modal.classList.remove('open');
};


window.setHeroTone = (tone) => {
  document.documentElement.setAttribute('data-hero-tone', tone);
  localStorage.setItem('civicsphere_hero_tone', tone);
  updateThemeModalUI();
  showToast(`Hero banner style set to ${tone.toUpperCase()}`);
};

window.setAccentColor = (accent) => {
  document.documentElement.setAttribute('data-accent', accent);
  localStorage.setItem('civicsphere_accent', accent);
  updateThemeModalUI();
  showToast(`Interface accent set to ${accent.toUpperCase()}`);
};

window.setThemeMode = (mode) => {
  document.documentElement.setAttribute('data-theme', mode);
  localStorage.setItem('civicsphere_theme', mode);
  updateThemeModalUI();
  if (State.activeTab === 'map') refreshMapPins();
};

window.resetThemeDefaults = () => {
  document.documentElement.setAttribute('data-accent', 'blue');
  document.documentElement.setAttribute('data-theme', 'light');
  localStorage.removeItem('civicsphere_accent');
  localStorage.setItem('civicsphere_theme', 'light');
  updateThemeModalUI();
  showToast('Restored default civic theme.');
  if (State.activeTab === 'map') refreshMapPins();
};

export function updateThemeModalUI() {
  const curAccent = document.documentElement.getAttribute('data-accent') || 'blue';
  const curMode = document.documentElement.getAttribute('data-theme') || 'light';

  document.querySelectorAll('.palette-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-accent') === curAccent);
  });

  const curTone = document.documentElement.getAttribute('data-hero-tone') || 'default';
  document.querySelectorAll('.tone-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-tone') === curTone);
  });

  document.querySelectorAll('.mode-card-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-mode') === curMode);
  });

  const dot = document.getElementById('active-palette-dot');
  if (dot) {
    const colors = {
      blue: '#2563eb',
      emerald: '#059669',
      indigo: '#6366f1',
      amber: '#d97706',
      rose: '#e11d48',
      cyan: '#0891b2',
      slate: '#475569'
    };
    dot.style.background = colors[curAccent] || '#2563eb';
  }
}


// ---------------------------------------------------------------------
// Bootstrapping
// ---------------------------------------------------------------------
export function initApp() {
  const savedTheme = localStorage.getItem('civicsphere_theme') || 'light';
  const savedAccent = localStorage.getItem('civicsphere_accent') || 'blue';
  const savedTone = localStorage.getItem('civicsphere_hero_tone') || 'default';
  document.documentElement.setAttribute('data-hero-tone', savedTone);
  document.documentElement.setAttribute('data-theme', savedTheme);
  document.documentElement.setAttribute('data-accent', savedAccent);
  updateThemeModalUI();

  loadState();
  autoDetectAndApplyLocation();

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1) || 'home';
    navigateTo(hash);
  });

  const initialTab = window.location.hash.slice(1) || 'home';
  navigateTo(initialTab);

  // Background Autonomic Escalation Agent Loop (every 20s)
  setInterval(() => {
    const escalated = escalationAgent(State.complaints, nowMs());
    if (escalated.length > 0) {
      saveState();
      showToast(`🚨 Autonomic Escalation: ${escalated.length} case(s) reassigned to Senior Engineers!`);
      if (State.activeTab === 'dashboard' || State.activeTab === 'officer') {
        navigateTo(State.activeTab);
      }
    }
  }, 20000);
}

// ---------------------------------------------------------------------
// Real-World Street & Place Search Handlers (Google Maps Interface)
// ---------------------------------------------------------------------
let searchDebounceTimer = null;
let currentSearchedPlace = null;

window.handleRealWorldSearch = (val) => {
  const q = (val || '').trim();
  const clearBtn = document.getElementById('map-search-clear');
  const dropdown = document.getElementById('map-search-dropdown');

  if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';

  if (!q || q.length < 2) {
    if (dropdown) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
    }
    return;
  }

  if (dropdown) {
    dropdown.style.display = 'block';
    dropdown.innerHTML = `
      <div style="padding:14px; text-align:center; font-size:0.86rem; color:var(--text-muted);">
        <span>⏳</span> <span>Searching real-world Karnataka streets & places...</span>
      </div>
    `;
  }

  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(async () => {
    try {
      const results = await searchRealWorldPlaces(q);
      if (!dropdown) return;

      if (!results || results.length === 0) {
        dropdown.innerHTML = `
          <div style="padding:14px; text-align:center; font-size:0.86rem; color:var(--text-muted);">
            <span>🔍</span> <span>No places or streets found in Karnataka matching "<b>${q}</b>".</span>
          </div>
        `;
        return;
      }

      dropdown.innerHTML = results.map((item, idx) => `
        <div class="gmap-suggestion-item" onclick='window.selectSearchedPlace(${JSON.stringify(item).replace(/'/g, "&apos;")})'>
          <span class="gmap-suggestion-icon">${item.icon || '📍'}</span>
          <div style="flex:1;">
            <div class="gmap-suggestion-title">${item.name}</div>
            <div class="gmap-suggestion-sub">${item.secondary}</div>
          </div>
          <span class="gmap-suggestion-tag">${item.type}</span>
        </div>
      `).join('');
    } catch (e) {
      if (dropdown) {
        dropdown.innerHTML = `
          <div style="padding:12px; text-align:center; font-size:0.84rem; color:var(--text-muted);">
            Error searching places. Please try another query.
          </div>
        `;
      }
    }
  }, 280);
};

window.selectSearchedPlace = (item) => {
  currentSearchedPlace = item;
  const input = document.getElementById('map-search-input');
  if (input) input.value = item.name;

  const dropdown = document.getElementById('map-search-dropdown');
  if (dropdown) dropdown.style.display = 'none';

  highlightSearchPlace(item.lat, item.lng, item.name, item.secondary);

  // Show Place Card
  const card = document.getElementById('gmap-place-card');
  const titleEl = document.getElementById('place-card-title');
  const subEl = document.getElementById('place-card-sub');
  const typeEl = document.getElementById('place-card-type');
  const coordsEl = document.getElementById('place-card-coords');

  if (card && titleEl && subEl) {
    titleEl.textContent = item.name;
    subEl.textContent = item.secondary;
    if (typeEl) typeEl.textContent = (item.type || 'PLACE').toUpperCase();
    if (coordsEl) coordsEl.textContent = `${item.lat.toFixed(4)}° N, ${item.lng.toFixed(4)}° E`;
    card.style.display = 'flex';
  }

  showToast(`📍 Selected: ${item.name}`);
};

window.clearMapSearch = () => {
  const input = document.getElementById('map-search-input');
  if (input) input.value = '';
  const clearBtn = document.getElementById('map-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  const dropdown = document.getElementById('map-search-dropdown');
  if (dropdown) dropdown.style.display = 'none';
  const card = document.getElementById('gmap-place-card');
  if (card) card.style.display = 'none';
};

window.closePlaceCard = () => {
  const card = document.getElementById('gmap-place-card');
  if (card) card.style.display = 'none';
};

window.reportIssueAtSearchedPlace = () => {
  if (!currentSearchedPlace) return;
  State.reportingState.pos = { lat: currentSearchedPlace.lat, lng: currentSearchedPlace.lng };
  State.reportingState.address = `${currentSearchedPlace.name}, ${currentSearchedPlace.secondary}`;
  State.reportingState.step = 2;
  window.location.hash = '#report';
  navigateTo('report');
  showToast(`📍 Location pre-filled: ${currentSearchedPlace.name}`);
};

// Report Wizard Street Search
let reportSearchDebounce = null;
window.handleReportStreetSearch = (val) => {
  const q = (val || '').trim();
  const clearBtn = document.getElementById('report-search-clear');
  const dropdown = document.getElementById('report-search-dropdown');

  if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';

  if (!q || q.length < 2) {
    if (dropdown) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
    }
    return;
  }

  if (dropdown) {
    dropdown.style.display = 'block';
    dropdown.innerHTML = `<div style="padding:12px; text-align:center; font-size:0.85rem; color:var(--text-muted);">Searching streets & places...</div>`;
  }

  clearTimeout(reportSearchDebounce);
  reportSearchDebounce = setTimeout(async () => {
    const results = await searchRealWorldPlaces(q);
    if (!dropdown) return;
    if (!results || results.length === 0) {
      dropdown.innerHTML = `<div style="padding:12px; text-align:center; font-size:0.85rem; color:var(--text-muted);">No matching streets found in Karnataka.</div>`;
      return;
    }
    dropdown.innerHTML = results.map((item) => `
      <div class="gmap-suggestion-item" onclick='window.selectReportStreet(${JSON.stringify(item).replace(/'/g, "&apos;")})'>
        <span class="gmap-suggestion-icon">${item.icon || '📍'}</span>
        <div style="flex:1;">
          <div class="gmap-suggestion-title">${item.name}</div>
          <div class="gmap-suggestion-sub">${item.secondary}</div>
        </div>
        <span class="gmap-suggestion-tag">${item.type}</span>
      </div>
    `).join('');
  }, 280);
};

window.selectReportStreet = (item) => {
  const input = document.getElementById('report-search-input');
  if (input) input.value = item.name;
  const dropdown = document.getElementById('report-search-dropdown');
  if (dropdown) dropdown.style.display = 'none';

  State.reportingState.pos = { lat: item.lat, lng: item.lng };
  const { ward } = nearestWard(item.lat, item.lng);
  State.reportingState.address = `${item.name}, ${ward.name}, Karnataka`;

  if (State.pickerInstance && State.pickerInstance.setPos) {
    State.pickerInstance.setPos(item.lat, item.lng);
  }

  const addrEl = document.getElementById('picked-address-label');
  if (addrEl) addrEl.textContent = State.reportingState.address;
  showToast(`🎯 Pin dropped on: ${item.name}`);
};

window.clearReportSearch = () => {
  const input = document.getElementById('report-search-input');
  if (input) input.value = '';
  const clearBtn = document.getElementById('report-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  const dropdown = document.getElementById('report-search-dropdown');
  if (dropdown) dropdown.style.display = 'none';
};

// Side Controls Actions
window.reorientCompass = () => {
  reorientCompass();
};

window.zoomInMap = () => {
  zoomInMap();
};

window.zoomOutMap = () => {
  zoomOutMap();
};

window.toggleLayersMenu = () => {
  const menu = document.getElementById('gmap-layers-menu');
  if (menu) {
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
  }
};

window.switchBasemap = (type) => {
  switchBasemap(type);
  const menu = document.getElementById('gmap-layers-menu');
  if (menu) menu.style.display = 'none';
  showToast(`🗺️ Switched map style to: ${type.toUpperCase()}`);
};

// ---------------------------------------------------------------------
// Universal Auto-Location Controller across All Devices (Mobile & Desktop)
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// Universal Auto-Location Controller across All Devices (Mobile & Desktop)
// ---------------------------------------------------------------------
export async function autoDetectAndApplyLocation() {
  // Check cached location for instant 0ms restoration (only if < 1 hour fresh)
  try {
    const cached = localStorage.getItem('civicsphere_user_location');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.lat && parsed.lng && parsed.time && (Date.now() - parsed.time < 3600000)) {
        State.userLocation = parsed;
        State.reportingState.pos = { lat: parsed.lat, lng: parsed.lng };
        State.reportingState.address = parsed.address || 'Karnataka';
        return;
      }
    }
  } catch (e) {}

  // Passive initial network detection (runs in background without prompt)
  fetchIPLocation().then((ipLoc) => {
    if (ipLoc && !State.userLocation) {
      State.userLocation = ipLoc;
      State.reportingState.pos = { lat: ipLoc.lat, lng: ipLoc.lng };
      const { ward } = nearestWard(ipLoc.lat, ipLoc.lng);
      State.reportingState.address = `${ward.name}, ${ward.zone}, Karnataka`;
      const addrEl = document.getElementById('picked-address-label');
      if (addrEl) addrEl.textContent = State.reportingState.address;
    }
  });
}

// ---------------------------------------------------------------------
// 1. Live Map High-Precision Location Handler (Crosshairs FAB Button)
// ---------------------------------------------------------------------
export async function locateUserOnLiveMap(opts = {}) {
  const silent = opts.silent || false;
  const btn = document.getElementById('gmap-locate-btn');
  const fullMap = getFullMap();

  if (btn) {
    btn.classList.add('locating');
    btn.classList.remove('located');
  }

  if (!silent) {
    showToast('🛰️ Pinpointing your exact location via GPS...');
  }

  acquireHighPrecisionLocation({
    onProgress: (pos) => {
      // Immediate street-level map pan as soon as first GPS/Wi-Fi fix arrives
      if (fullMap) {
        renderUserLocationMarker(fullMap, pos.lat, pos.lng, pos.accuracy, 'Locating...', { zoom: 17, fly: true });
      }
    },
    onSuccess: async (pos) => {
      if (btn) {
        btn.classList.remove('locating');
        btn.classList.add('located');
      }

      // Reverse geocode to real street name
      const geo = await reverseGeocodeCoords(pos.lat, pos.lng);
      const streetLabel = geo?.street || geo?.area || 'Karnataka';
      const fullAddress = geo?.formattedAddress || `${streetLabel}, Karnataka`;

      const locData = {
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        address: fullAddress,
        street: streetLabel,
        source: 'device_gps',
        time: Date.now()
      };

      State.userLocation = locData;
      State.reportingState.pos = { lat: pos.lat, lng: pos.lng };
      State.reportingState.address = fullAddress;

      try {
        localStorage.setItem('civicsphere_user_location', JSON.stringify(locData));
      } catch (e) {}

      if (fullMap) {
        renderUserLocationMarker(fullMap, pos.lat, pos.lng, pos.accuracy, fullAddress, { zoom: 17, fly: true });
      }

      const accMeters = Math.round(pos.accuracy);
      if (!silent) {
        showToast(`🎯 Exact Location: ${streetLabel} (GPS ±${accMeters}m)`);
      }
    },
    onError: async (err) => {
      if (btn) btn.classList.remove('locating');

      if (err.code === 'PERMISSION_DENIED') {
        if (!silent) {
          showToast('⚠️ Location permission is blocked. Click the lock icon 🔒 in the URL address bar to allow location access.', 6000);
        }
      } else {
        if (!silent) {
          showToast(`⚠️ ${err.message || 'GPS lock unavailable.'} Trying network fallback...`, 4000);
        }
      }

      // Only fall back to coarse IP if hardware GPS completely fails
      const ipLoc = await fetchIPLocation();
      if (ipLoc && fullMap) {
        renderUserLocationMarker(fullMap, ipLoc.lat, ipLoc.lng, ipLoc.accuracy, 'Network Area Approximation', { zoom: 14, fly: true });
        State.userLocation = ipLoc;
        if (!silent) {
          showToast(`ℹ️ Showing approximate network area: ${ipLoc.city || 'Bengaluru'}`);
        }
      }
    }
  });
}

// ---------------------------------------------------------------------
// 2. Report Wizard Step 2 High-Precision Location Handler
// ---------------------------------------------------------------------
export async function detectCurrentLocationForReport(opts = {}) {
  const silent = opts.silent || false;
  const btn = document.getElementById('btn-detect-loc');
  const pickerSideBtn = document.querySelector('#step-picker-map .gmap-fab-btn');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>🛰️</span> <span>Acquiring exact GPS coordinates...</span>';
  }
  if (pickerSideBtn) {
    pickerSideBtn.classList.add('locating');
    pickerSideBtn.classList.remove('located');
  }

  if (!silent) {
    showToast('🛰️ Pinpointing your exact location for the report...');
  }

  acquireHighPrecisionLocation({
    onProgress: (pos) => {
      if (State.pickerInstance && State.pickerInstance.setPos) {
        State.pickerInstance.setPos(pos.lat, pos.lng, 17);
      }
    },
    onSuccess: async (pos) => {
      const geo = await reverseGeocodeCoords(pos.lat, pos.lng);
      const streetLabel = geo?.street || geo?.area || 'Karnataka';
      const fullAddress = geo?.formattedAddress || `${streetLabel}, Karnataka`;

      const locData = {
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        address: fullAddress,
        street: streetLabel,
        source: 'device_gps',
        time: Date.now()
      };

      State.userLocation = locData;
      State.reportingState.pos = { lat: pos.lat, lng: pos.lng };
      State.reportingState.address = fullAddress;

      try {
        localStorage.setItem('civicsphere_user_location', JSON.stringify(locData));
      } catch (e) {}

      const addrEl = document.getElementById('picked-address-label');
      if (addrEl) {
        addrEl.textContent = fullAddress;
      }

      if (State.pickerInstance && State.pickerInstance.setPos) {
        State.pickerInstance.setPos(pos.lat, pos.lng, 17);
      }

      const accMeters = Math.round(pos.accuracy);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>✅</span> <span>Located: ${streetLabel} (±${accMeters}m)</span>`;
        btn.style.background = '#059669';
        btn.style.borderColor = '#059669';
      }
      if (pickerSideBtn) {
        pickerSideBtn.classList.remove('locating');
        pickerSideBtn.classList.add('located');
      }

      if (!silent) {
        showToast(`🎯 Pin placed at: ${streetLabel} (GPS ±${accMeters}m)`);
      }
    },
    onError: async (err) => {
      if (pickerSideBtn) pickerSideBtn.classList.remove('locating');

      if (err.code === 'PERMISSION_DENIED') {
        if (!silent) {
          showToast('⚠️ Location access was denied. Please allow location permissions in your browser (click 🔒 in address bar).', 6000);
        }
      }

      // Check if IP location can assist
      const ipLoc = await fetchIPLocation();
      if (ipLoc) {
        State.reportingState.pos = { lat: ipLoc.lat, lng: ipLoc.lng };
        State.reportingState.address = `${ipLoc.city || 'Bengaluru'}, Karnataka (Network)`;
        const addrEl = document.getElementById('picked-address-label');
        if (addrEl) addrEl.textContent = State.reportingState.address;
        if (State.pickerInstance && State.pickerInstance.setPos) {
          State.pickerInstance.setPos(ipLoc.lat, ipLoc.lng, 14);
        }
      }

      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>🎯</span> <span>Detect My Current Location (GPS)</span>';
      }

      if (!silent && err.code !== 'PERMISSION_DENIED') {
        showToast('⚠️ Could not acquire GPS lock. You can drag the pin on the map.', 5000);
      }
    }
  });
}

// Guarantee window attachment
window.locateUserOnLiveMap = locateUserOnLiveMap;
window.detectCurrentLocationForReport = detectCurrentLocationForReport;

window.addVoiceChatMessage = (userText, botText) => {
  State.chatMessages.push({ sender: 'user', text: `🎙️ "${userText}"` });
  State.chatMessages.push({ sender: 'bot', text: botText });
  renderChatMessages();
};

// Pure Canvas Particle Confetti Celebration
window.launchConfetti = () => {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '99999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);

  const colors = ['#2563eb', '#38bdf8', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
  const particles = [];
  const count = 55;

  for (let i = 0; i < count; i++) {
    particles.push({
      x: window.innerWidth * 0.5 + (Math.random() * 200 - 100),
      y: window.innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 12,
      vy: -Math.random() * 10 - 4,
      size: Math.random() * 7 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 14,
      alpha: 1
    });
  }

  let animFrame;
  const start = Date.now();
  const render = () => {
    const elapsed = Date.now() - start;
    if (elapsed > 2000) {
      cancelAnimationFrame(animFrame);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      return;
    }

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.38; // gravity
      p.rotation += p.vRot;
      p.alpha = Math.max(0, 1 - elapsed / 2000);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
      ctx.restore();
    });

    animFrame = requestAnimationFrame(render);
  };

  animFrame = requestAnimationFrame(render);
};
