// =====================================================================
// CivicSphere Civic Operations - Core Data Models & Constants
// Karnataka State Municipal Jurisdictions & Geographic Bounds
// =====================================================================

export const DEPTS = {
  ROADS: {
    name: 'Roads & Infrastructure (BBMP / PWD Karnataka)',
    icon: '🛣️',
    color: '#0284c7',
    officers: ['Ward Junior Engineer', 'Asst. Executive Engineer (Roads)', 'Executive Engineer (PWD)', 'Chief Engineer / Commissioner']
  },
  SWM: {
    name: 'Solid Waste & Sanitation (Karnataka Municipalities)',
    icon: '🗑️',
    color: '#10b981',
    officers: ['Ward Health Inspector', 'Asst. Health Officer', 'Joint Commissioner (Sanitation)', 'Municipal Commissioner']
  },
  ELEC: {
    name: 'Karnataka Electricity ESCOMs (BESCOM / HESCOM / MESCOM / GESCOM)',
    icon: '💡',
    color: '#f59e0b',
    officers: ['Section Junior Engineer', 'Asst. Executive Engineer (Elec)', 'Executive Engineer', 'Superintending Engineer']
  },
  WATER: {
    name: 'Water Supply & Drainage (BWSSB / KUWSDB Karnataka)',
    icon: '🚰',
    color: '#06b6d4',
    officers: ['Asst. Water Inspector', 'Asst. Executive Engineer (Water)', 'Executive Engineer (KUWSDB)', 'Chief Engineer']
  },
  TRAFFIC: {
    name: 'Karnataka State Police & Traffic Control',
    icon: '🚦',
    color: '#8b5cf6',
    officers: ['Traffic Sub-Inspector', 'Traffic Police Inspector', 'Asst. Commissioner of Police (Traffic)', 'Superintendent of Police']
  },
  GREEN: {
    name: 'Karnataka Forest Dept & Urban Parks',
    icon: '🌳',
    color: '#16a34a',
    officers: ['Range Forest Officer', 'Horticulture Superintendent', 'Deputy Conservator of Forests (DCF)', 'Urban Development Officer']
  }
};

export const CATS = {
  pothole: ['ROADS', 60, 'Pothole / Road Damage', '🕳️', ['pothole', 'crater', 'road damage', 'broken road', 'gaddha', 'गड्ढा', 'ಗುಂಡಿ', 'pit on road', 'road broken', 'tar peel']],
  footpath: ['ROADS', 35, 'Broken Footpath & Slab', '🚶', ['footpath', 'sidewalk', 'pavement', 'slab broken', 'drain cover', 'फुटपाथ', 'ಪಾದಚಾರಿ', 'kerb']],
  garbage: ['SWM', 45, 'Overflowing Garbage / Dump', '🗑️', ['garbage', 'trash', 'waste', 'dump', 'bin overflowing', 'litter', 'kachra', 'कचरा', 'ಕಸ', 'rubbish', 'stink', 'plastic']],
  streetlight: ['ELEC', 40, 'Dark Streetlight / Pole', '💡', ['streetlight', 'street light', 'lamp', 'dark street', 'pole', 'light not working', 'स्ट्रीट लाइट', 'ಬೀದಿ ದೀಪ', 'flickering']],
  waterleak: ['WATER', 55, 'Pipe Burst / Water Leakage', '💧', ['water leak', 'pipe burst', 'drinking water', 'leaking pipe', 'water wasting', 'पानी की बर्बादी', 'ನೀರು ಸೋರಿಕೆ', 'pipeline']],
  drainage: ['WATER', 50, 'Open Drain / Sewage Overflow', '🌊', ['drain', 'sewage', 'gutter', 'drainage', 'manhole', 'overflow', 'सीवर', 'ಚರಂಡಿ', 'stinking drain', 'flooding']],
  animal: ['SWM', 30, 'Stray Animals / Carcass', '🐕', ['stray dog', 'dead animal', 'carcass', 'cattle', 'rabid dog', 'street dog', 'आवारा कुत्ता', 'ಬೀದಿ ನಾಯಿ', 'dead dog']],
  park: ['GREEN', 25, 'Park Maintenance', '🛝', ['park', 'garden', 'swings broken', 'playground', 'grass overgrown', 'पार्क', 'ಉದ್ಯಾನವನ', 'walking track']],
  tree: ['GREEN', 55, 'Fallen Tree / Heavy Branch', '🌳', ['fallen tree', 'branch broken', 'tree fall', 'blocking path', 'hanging branch', 'पेड़ गिर गया', 'ಮರ ಬಿದ್ದಿದೆ', 'storm damage']],
  signal: ['TRAFFIC', 65, 'Signal Blinking / Outage', '🚦', ['traffic light', 'signal not working', 'signal blink', 'junction jam', 'ट्रैफिक सिग्नल', 'ಟ್ರಾಫಿಕ್ ಸಿಗ್ನಲ್', 'timer stuck']],
  dumper: ['SWM', 50, 'Debris / Illegal C&D Waste', '🚛', ['debris', 'construction waste', 'malba', 'illegal dumping', 'building waste', 'मल्बा', 'ಕಟ್ಟಡ ತ್ಯಾಜ್ಯ', 'concrete dump']],
  spark: ['ELEC', 75, 'Transformer Spark / Dangling Wire', '⚡', ['transformer spark', 'sparking', 'live wire', 'dangling wire', 'cable hanging', 'बिजली का तार', 'ವಿದ್ಯುತ್ ತಂತಿ', 'blast', 'short circuit']]
};

export const URGENCY = {
  accident: 18, injured: 20, injury: 20, child: 12, children: 12, school: 10,
  hospital: 12, ambulance: 15, elderly: 8, fell: 12, bike: 6, night: 6,
  dangerous: 12, urgent: 8, emergency: 15, death: 25, died: 25, blocking: 8,
  deep: 8, huge: 6, smell: 4, rain: 6, fire: 20, spark: 18,
  'दुर्घटना': 18, 'बच्चे': 12, 'अस्पताल': 12, 'खतरनाक': 12,
  'ಅಪಘಾತ': 18, 'ಮಕ್ಕಳು': 12, 'ಆಸ್ಪತ್ರೆ': 12, 'ಅಪಾಯಕಾರಿ': 12
};

// Municipal Wards & Corporation Divisions Across Karnataka State
export const WARDS = [
  // Bengaluru (BBMP)
  { name: 'Koramangala, Bengaluru', zone: 'South Zone', city: 'Bengaluru', lat: 12.9352, lng: 77.6245 },
  { name: 'Indiranagar, Bengaluru', zone: 'East Zone', city: 'Bengaluru', lat: 12.9784, lng: 77.6408 },
  { name: 'Jayanagar, Bengaluru', zone: 'South Zone', city: 'Bengaluru', lat: 12.9250, lng: 77.5938 },
  { name: 'Whitefield, Bengaluru', zone: 'Mahadevapura Zone', city: 'Bengaluru', lat: 12.9698, lng: 77.7500 },
  { name: 'Malleshwaram, Bengaluru', zone: 'West Zone', city: 'Bengaluru', lat: 13.0031, lng: 77.5643 },
  { name: 'HSR Layout, Bengaluru', zone: 'Bommanahalli Zone', city: 'Bengaluru', lat: 12.9116, lng: 77.6474 },
  { name: 'BTM Layout, Bengaluru', zone: 'South Zone', city: 'Bengaluru', lat: 12.9166, lng: 77.6101 },
  { name: 'Rajajinagar, Bengaluru', zone: 'West Zone', city: 'Bengaluru', lat: 12.9915, lng: 77.5544 },
  { name: 'Yelahanka, Bengaluru', zone: 'Yelahanka Zone', city: 'Bengaluru', lat: 13.1007, lng: 77.5963 },
  { name: 'Electronic City, Bengaluru', zone: 'Bommanahalli Zone', city: 'Bengaluru', lat: 12.8452, lng: 77.6602 },
  { name: 'Hebbal, Bengaluru', zone: 'East Zone', city: 'Bengaluru', lat: 13.0358, lng: 77.5970 },
  { name: 'Basavanagudi, Bengaluru', zone: 'South Zone', city: 'Bengaluru', lat: 12.9421, lng: 77.5753 },
  { name: 'Majestic / Gandhi Nagar', zone: 'Central Zone', city: 'Bengaluru', lat: 12.9767, lng: 77.5713 },
  
  // Mysuru (MCC - Mysuru City Corporation)
  { name: 'Chamundeshwari, Mysuru', zone: 'South Division', city: 'Mysuru', lat: 12.3021, lng: 76.6534 },
  { name: 'Kuvempunagar, Mysuru', zone: 'West Division', city: 'Mysuru', lat: 12.2891, lng: 76.6276 },
  { name: 'Vijayanagar, Mysuru', zone: 'North Division', city: 'Mysuru', lat: 12.3392, lng: 76.6062 },
  
  // Mangaluru (MCC - Mangaluru City Corporation)
  { name: 'Kadri, Mangaluru', zone: 'East Division', city: 'Mangaluru', lat: 12.8756, lng: 74.8580 },
  { name: 'Hampankatta, Mangaluru', zone: 'Central Division', city: 'Mangaluru', lat: 12.8687, lng: 74.8427 },
  { name: 'Panambur, Mangaluru', zone: 'Coastal Division', city: 'Mangaluru', lat: 12.9482, lng: 74.8143 },
  
  // Hubballi-Dharwad (HDMC - Hubballi-Dharwad Municipal Corporation)
  { name: 'Vidyanagar, Hubballi', zone: 'Hubballi Central', city: 'Hubballi-Dharwad', lat: 15.3585, lng: 75.1321 },
  { name: 'Line Bazaar, Dharwad', zone: 'Dharwad Division', city: 'Hubballi-Dharwad', lat: 15.4589, lng: 75.0078 },
  
  // Belagavi (BCC - Belagavi City Corporation)
  { name: 'Tilakwadi, Belagavi', zone: 'South Division', city: 'Belagavi', lat: 15.8398, lng: 74.5089 },
  { name: 'Camp & Fort Area, Belagavi', zone: 'Central Division', city: 'Belagavi', lat: 15.8612, lng: 74.5168 },
  
  // Shivamogga (SMC - Shivamogga City Corporation)
  { name: 'Gandhi Park & Bazaar, Shivamogga', zone: 'Central Zone', city: 'Shivamogga', lat: 13.9312, lng: 75.5670 },
  
  // Kalaburagi (KMC - Kalaburagi Municipal Corporation)
  { name: 'Brahampur & Fort, Kalaburagi', zone: 'Kalyana Division', city: 'Kalaburagi', lat: 17.3340, lng: 76.8370 },
  
  // Tumakuru (TMC - Tumakuru City Corporation)
  { name: 'Siddaganga & B.H. Road, Tumakuru', zone: 'Central Zone', city: 'Tumakuru', lat: 13.3395, lng: 77.1030 },
  
  // Udupi (CMC - Udupi City Municipality)
  { name: 'Car Street & Temple, Udupi', zone: 'Coastal Zone', city: 'Udupi', lat: 13.3415, lng: 74.7505 }
];

// Sensitive Buffer Institutions across Karnataka State
export const SENSITIVE = [
  // Hospitals
  { name: 'Victoria Hospital, Bengaluru', type: 'hospital', lat: 12.9628, lng: 77.5735 },
  { name: "St. John's Medical College Hospital, Bengaluru", type: 'hospital', lat: 12.9298, lng: 77.6195 },
  { name: 'K.R. Hospital, Mysuru', type: 'hospital', lat: 12.3115, lng: 76.6508 },
  { name: 'KMC Hospital, Mangaluru', type: 'hospital', lat: 12.8710, lng: 74.8465 },
  { name: 'KIMS Hospital, Hubballi', type: 'hospital', lat: 15.3592, lng: 75.1384 },
  { name: 'BIMS Civil Hospital, Belagavi', type: 'hospital', lat: 15.8560, lng: 74.5050 },
  { name: 'GIMS Hospital, Kalaburagi', type: 'hospital', lat: 17.3380, lng: 76.8290 },
  // Schools & Universities
  { name: "Bishop Cotton Boys' School, Bengaluru", type: 'school', lat: 12.9682, lng: 77.5996 },
  { name: 'University of Mysore Campus, Mysuru', type: 'school', lat: 12.3150, lng: 76.6210 },
  { name: 'Karnatak University Campus, Dharwad', type: 'school', lat: 15.4410, lng: 74.9850 },
  // Transit
  { name: 'Majestic Kempegowda Bus Station, Bengaluru', type: 'transit', lat: 12.9778, lng: 77.5713 },
  { name: 'KSRTC Central Suburb Bus Stand, Mysuru', type: 'transit', lat: 12.3120, lng: 76.6560 },
  { name: 'Hubballi Central Junction Railway Station', type: 'transit', lat: 15.3480, lng: 75.1450 }
];

export const SLA_HOURS = {
  P1: 4,    // 4 hours (Emergency)
  P2: 24,   // 24 hours (High Priority)
  P3: 72,   // 3 days (Standard)
  P4: 168   // 7 days (Low Priority)
};

export const PRI_LABEL = {
  P1: 'Critical',
  P2: 'High',
  P3: 'Medium',
  P4: 'Low'
};

export const PRI_COLOR = {
  P1: '#ef4444',
  P2: '#f97316',
  P3: '#eab308',
  P4: '#10b981'
};

export const STATUS_LABEL = {
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed (Verified)',
  ESCALATED: 'Escalated 🚨',
  MERGED: 'Merged Duplicate'
};

export const STATUS_COLOR = {
  ASSIGNED: '#64748b',
  IN_PROGRESS: '#3b82f6',
  RESOLVED: '#10b981',
  CLOSED: '#059669',
  ESCALATED: '#dc2626',
  MERGED: '#8b5cf6'
};

export const BLR_CENTER = { lat: 12.9716, lng: 77.5946 };
export const KARNATAKA_CENTER = { lat: 14.5000, lng: 75.8000 };

export const PLACES = [
  { name: 'Vidhana Soudha & Secretariat, Bengaluru', lat: 12.9797, lng: 77.5907, kind: 'landmark' },
  { name: 'Indiranagar 100 Feet Road, Bengaluru', lat: 12.9698, lng: 77.6402, kind: 'street' },
  { name: 'Koramangala 4th Block Club, Bengaluru', lat: 12.9345, lng: 77.6258, kind: 'landmark' },
  { name: 'Whitefield ITPL Main Road, Bengaluru', lat: 12.9863, lng: 77.7289, kind: 'street' },
  { name: 'Mysuru Palace & Sayyaji Rao Road', lat: 12.3052, lng: 76.6552, kind: 'landmark' },
  { name: 'Panambur Beach Road, Mangaluru', lat: 12.9482, lng: 74.8143, kind: 'street' },
  { name: 'Chennamma Circle, Hubballi', lat: 15.3520, lng: 75.1380, kind: 'landmark' },
  { name: 'Belagavi Fort Circle', lat: 15.8612, lng: 74.5168, kind: 'landmark' },
  { name: 'Ashoka Circle, Shivamogga', lat: 13.9312, lng: 75.5670, kind: 'street' },
  { name: 'Super Market & Fort Road, Kalaburagi', lat: 17.3340, lng: 76.8370, kind: 'street' },
  { name: 'B.H. Road Junction, Tumakuru', lat: 13.3395, lng: 77.1030, kind: 'street' },
  { name: 'Krishna Temple Car Street, Udupi', lat: 13.3415, lng: 74.7505, kind: 'landmark' }
];

export const SAMPLES = [
  ['Huge pothole near the bus stop, two bikes fell yesterday', 'en'],
  ['Deep pothole in the middle of the road, dangerous at night', 'en'],
  ['Road broken after rain, many potholes near school gate', 'en'],
  ['ಮುಖ್ಯ ರಸ್ತೆಯಲ್ಲಿ ದೊಡ್ಡ ಗುಂಡಿ ಇದೆ, ವಾಹನಗಳಿಗೆ ತೊಂದರೆ', 'kn'],
  ['सड़क पर बड़ा गड्ढा है, रात को दुर्घटना हो सकती है', 'hi'],
  ['Garbage not collected for 4 days, bin overflowing and stink everywhere', 'en'],
  ['People dumping waste on the empty plot, trash burning', 'en'],
  ['ಕಸ ಸಂಗ್ರಹಣೆ ಆಗಿಲ್ಲ, ರಸ್ತೆಯಲ್ಲೆಲ್ಲಾ ಕೊಳೆತ ವಾಸನೆ ಬರುತ್ತಿದೆ', 'kn'],
  ['कूड़ेदान भर गया है और बदबू आ रही है', 'hi'],
  ['Streetlight dead for 2 weeks, pitch dark stretch, unsafe for women walking home', 'en'],
  ['Blinking street lamp pole, sparks seen during drizzle', 'en'],
  ['ಬೀದಿ ದೀಪ ಕೆಲಸ ಮಾಡುತ್ತಿಲ್ಲ, ರಾತ್ರಿ ಕತ್ತಲು', 'kn'],
  ['Drinking water pipe burst, thousands of litres wasting on road', 'en'],
  ['Sewage overflowing from manhole right outside hospital gate', 'en'],
  ['ಹೊಲಸು ನೀರು ರಸ್ತೆಯಲ್ಲಿ ಹರಿಯುತ್ತಿದೆ, ಮ್ಯಾನ್‌ಹೋಲ್ ಬ್ಲಾಕ್ ಆಗಿದೆ', 'kn'],
  ['Big branch snapped in storm, hanging on electrical wire', 'en'],
  ['Traffic signal completely dark at main 4-way junction, massive gridlock', 'en'],
  ['Open drain slab missing on footpath, pedestrian tripped and got hurt', 'en'],
  ['Dangling live electric cable touching pedestrian fence', 'en']
];

// =====================================================================
// Karnataka State Geographic Boundaries & Municipal Jurisdictions
// =====================================================================
export const KARNATAKA_BOUNDS = [
  [11.50, 74.00], // Southwest
  [18.50, 78.65]  // Northeast
];

export const KARNATAKA_BORDER_COORDS = [
  [18.45, 77.20], [18.25, 77.58], [17.80, 77.50], [17.30, 77.40],
  [16.85, 77.30], [16.50, 77.45], [15.90, 77.35], [15.30, 77.00],
  [15.10, 76.90], [14.60, 76.85], [14.00, 76.90], [13.60, 77.80],
  [13.20, 78.58], [12.80, 78.35], [12.60, 77.80], [12.00, 77.20],
  [11.75, 76.80], [11.55, 76.50], [11.80, 75.90], [12.20, 75.60],
  [12.50, 75.10], [12.85, 74.85], [13.40, 74.70], [14.00, 74.50],
  [14.50, 74.30], [14.90, 74.15], [15.20, 74.10], [15.60, 74.20],
  [15.85, 74.50], [16.20, 74.80], [16.70, 75.30], [17.00, 75.70],
  [17.50, 76.50], [17.90, 76.90], [18.45, 77.20]
];

export const KARNATAKA_CITIES = [
  { name: 'Bengaluru (BBMP)', lat: 12.9716, lng: 77.5946, zone: 'Capital Division', icon: '🏙️' },
  { name: 'Mysuru (MCC)', lat: 12.2958, lng: 76.6394, zone: 'Southern Division', icon: '🏰' },
  { name: 'Mangaluru (MCC)', lat: 12.9141, lng: 74.8560, zone: 'Coastal Division', icon: '🏖️' },
  { name: 'Hubballi-Dharwad (HDMC)', lat: 15.3647, lng: 75.1240, zone: 'North Karnataka', icon: '🚂' },
  { name: 'Belagavi (BCC)', lat: 15.8497, lng: 74.4977, zone: 'North Western Division', icon: '⛰️' },
  { name: 'Shivamogga (SMC)', lat: 13.9299, lng: 75.5681, zone: 'Malnad Division', icon: '🌿' },
  { name: 'Tumakuru (TMC)', lat: 13.3379, lng: 77.1010, zone: 'Central Division', icon: '🌾' },
  { name: 'Kalaburagi (KMC)', lat: 17.3297, lng: 76.8343, zone: 'Kalyana Karnataka', icon: '🏛️' },
  { name: 'Udupi (CMC)', lat: 13.3409, lng: 74.7421, zone: 'Coastal Division', icon: '🌊' }
];

export function isWithinKarnataka(lat, lng) {
  return lat >= 11.45 && lat <= 18.55 && lng >= 74.00 && lng <= 78.65;
}
