/**
 * Module: linkMath3D.ts
 * Calculates inter-satellite handshakes and outages over a 24h period
 * for a beacon satellite and all 66 Iridium satellites in 3D,
 * fully accounting for Earth curvature, antenna cones, and segment visibility.
 */

// Debug mode to relax constraints during testing
const DEBUG_MODE = false;
const EMERGENCY_MODE = false; // Disable emergency mode to use real calculations

// --- Constants ---
export const EARTH_RADIUS = 6371;                 // km
export const BEACON_HALF_ANGLE = (70 * Math.PI) / 180;   // 70° half-angle for beacon (increased from 60° for better coverage)
export const IRIDIUM_HALF_ANGLE = (60 * Math.PI) / 180;  // 60° half-angle for Iridium (increased from 45° for realistic coverage)

// Use actual cone angles, no debug relaxation
export const COS_BEACON = Math.cos(BEACON_HALF_ANGLE);
export const COS_IRIDIUM = Math.cos(IRIDIUM_HALF_ANGLE);

// Remove minimum elevation angle requirement as it's handled by cone angles
// const MIN_ELEVATION_ANGLE = (10 * Math.PI) / 180; // 10 degrees minimum elevation

// --- Types & Helpers ---
export type Vec3 = [number, number, number];

/** Dot product */
const dot = (a: Vec3, b: Vec3): number => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

/** Norm */
const norm = (v: Vec3): number => Math.sqrt(dot(v, v));

/** Cross product */
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1]*b[2] - a[2]*b[1],
  a[2]*b[0] - a[0]*b[2],
  a[0]*b[1] - a[1]*b[0]
];

/**
 * Compute shortest distance from Earth's center to the segment [r1,r2].
 * Accounts for endpoints: uses perpendicular distance if projection
 * falls within segment, else uses minimum endpoint distance.
 */
const segmentMinDistance = (r1: Vec3, r2: Vec3): number => {
  const v: Vec3 = [r2[0]-r1[0], r2[1]-r1[1], r2[2]-r1[2]];
  const vNorm2 = dot(v, v);
  if (vNorm2 === 0) return norm(r1);
  // projection parameter t = -r1·v / (v·v)
  const t = -dot(r1, v) / vNorm2;
  if (t >= 0 && t <= 1) {
    // perpendicular distance to line
    const cross_r = cross(r1, v);
    return norm(cross_r) / Math.sqrt(vNorm2);
  }
  // else, segment endpoints
  return Math.min(norm(r1), norm(r2));
};

// --- Input/Output Types ---
export interface BeaconState {
  pos: Vec3;         // ECI position
  planeNormal: Vec3; // orbital plane normal
}
export type IridiumStates = Vec3[][];
export interface LinkMetrics3D {
  handshakeCount: number;
  outageCount: number;
  outageDuration: number;
  timeline: boolean[];
}

// Debug function to log visibility statistics at a single timestep
function debugVisibilityAtTimestep(
  beaconTimeline: BeaconState[], 
  iridiumTimeline: IridiumStates, 
  timestep: number
): void {
  if (timestep >= beaconTimeline.length || timestep >= iridiumTimeline.length) {
    console.error("Invalid timestep for debugging");
    return;
  }

  const { pos: r1, planeNormal: n } = beaconTimeline[timestep];
  const r1Norm = norm(r1);
  console.log(`Beacon altitude: ${r1Norm - EARTH_RADIUS} km`);
  console.log(`Beacon position: [${r1[0].toFixed(1)}, ${r1[1].toFixed(1)}, ${r1[2].toFixed(1)}]`);
  console.log(`Plane normal: [${n[0].toFixed(3)}, ${n[1].toFixed(3)}, ${n[2].toFixed(3)}]`);
  
  // Check if normal vector is normalized
  const nMag = norm(n);
  if (Math.abs(nMag - 1.0) > 0.01) {
    console.warn(`Plane normal is not normalized! Magnitude: ${nMag.toFixed(3)}`);
  }
  
  let visibleCount = 0;
  let beaconConePassCount = 0;

  // Calculate beacon boresights
  const r1u: Vec3 = [r1[0]/r1Norm, r1[1]/r1Norm, r1[2]/r1Norm];
  console.log(`Beacon radial vector: [${r1u[0].toFixed(3)}, ${r1u[1].toFixed(3)}, ${r1u[2].toFixed(3)}]`);
  
  // Check orthogonality of r1u and n
  const dotRN = dot(r1u, n);
  console.log(`Dot product of radial and normal: ${dotRN.toFixed(3)} (should be close to 0 for orthogonality)`);
  
  // Project planeNormal to be orthogonal to r1u
  const nDotR = dot(n, r1u);
  const nPerp: Vec3 = [
    n[0] - nDotR * r1u[0],
    n[1] - nDotR * r1u[1],
    n[2] - nDotR * r1u[2],
  ];
  const nNorm = norm(nPerp);
  
  if (nNorm === 0) {
    console.log("Warning: Zero normal vector after projection!");
    return;
  }
  
  const nHat: Vec3 = [nPerp[0]/nNorm, nPerp[1]/nNorm, nPerp[2]/nNorm];
  console.log(`Orthogonalized normal: [${nHat[0].toFixed(3)}, ${nHat[1].toFixed(3)}, ${nHat[2].toFixed(3)}]`);
  
  // Verify orthogonality
  const dotRNHat = dot(r1u, nHat);
  console.log(`Dot product of radial and orthogonalized normal: ${dotRNHat.toFixed(6)} (should be very close to 0)`);
  
  // Calculate boresight velocity direction
  const velDir = cross(nHat, r1u);
  const velNorm = norm(velDir);
  
  if (velNorm === 0) {
    console.log("Warning: Zero velocity vector!");
    return;
  }
  
  const vHat: Vec3 = [velDir[0]/velNorm, velDir[1]/velNorm, velDir[2]/velNorm];
  const boresights: Vec3[] = [vHat, [-vHat[0], -vHat[1], -vHat[2]]];
  
  console.log(`Beacon boresights: `, 
               `1: [${boresights[0][0].toFixed(3)}, ${boresights[0][1].toFixed(3)}, ${boresights[0][2].toFixed(3)}]`,
               `2: [${boresights[1][0].toFixed(3)}, ${boresights[1][1].toFixed(3)}, ${boresights[1][2].toFixed(3)}]`);
               
  // Verify orthogonality of all key vectors
  console.log(`r1u·nHat = ${dot(r1u, nHat).toFixed(6)} (should be ~0)`);
  console.log(`r1u·vHat = ${dot(r1u, vHat).toFixed(6)} (should be ~0)`);
  console.log(`nHat·vHat = ${dot(nHat, vHat).toFixed(6)} (should be ~0)`);
  
  let testedCount = 0;
  
  for (const r2 of iridiumTimeline[timestep]) {
    const r2Norm = norm(r2);
    
    // Skip satellites below horizon or blocked by Earth
    if (r2Norm <= EARTH_RADIUS || segmentMinDistance(r1, r2) < EARTH_RADIUS) {
      continue;
    }
    
    visibleCount++;
    
    // Test the first few visible satellites
    if (testedCount++ >= 5) break;
    
    console.log(`\nTesting satellite ${testedCount} position: [${r2[0].toFixed(1)}, ${r2[1].toFixed(1)}, ${r2[2].toFixed(1)}]`);
    
    // Line-of-sight unit vector
    const v: Vec3 = [r2[0]-r1[0], r2[1]-r1[1], r2[2]-r1[2]];
    const vNorm = norm(v);
    const vUnit: Vec3 = [v[0]/vNorm, v[1]/vNorm, v[2]/vNorm];
    
    console.log(`Line-of-sight unit vector: [${vUnit[0].toFixed(3)}, ${vUnit[1].toFixed(3)}, ${vUnit[2].toFixed(3)}]`);
    
    // Check beacon cone alignment
    boresights.forEach((b, idx) => {
      const cosAngle = dot(b, vUnit);
      const angleDeg = Math.acos(cosAngle) * 180 / Math.PI;
      console.log(`Sat ${testedCount} ↔ boresight #${idx}: cosθ = ${cosAngle.toFixed(3)}, angle = ${angleDeg.toFixed(1)}° (needs ≥ ${COS_BEACON.toFixed(3)}, angle ≤ ${(Math.acos(COS_BEACON)*180/Math.PI).toFixed(1)}°)`);
      if (cosAngle >= COS_BEACON) {
        beaconConePassCount++;
      }
    });
  }
  
  console.log(`\nVisibility summary: ${visibleCount} satellites in line of sight, ${beaconConePassCount} within beacon cone`);
  console.log(`Using DEBUG_MODE: ${DEBUG_MODE}, with COS_BEACON = ${COS_BEACON.toFixed(4)} (${(Math.acos(COS_BEACON)*180/Math.PI).toFixed(1)}°)`);
}

/**
 * Calculate elevation angle between two points
 */
function calculateElevationAngle(from: Vec3, to: Vec3): number {
  const fromNorm = norm(from);
  const toNorm = norm(to);
  const fromUnit: Vec3 = [from[0]/fromNorm, from[1]/fromNorm, from[2]/fromNorm];
  const toUnit: Vec3 = [to[0]/toNorm, to[1]/toNorm, to[2]/toNorm];
  const dotProduct = dot(fromUnit, toUnit);
  return Math.PI/2 - Math.acos(dotProduct);
}

/**
 * Calculate the boresight vectors for a satellite based on its position and plane normal
 * Improved to handle edge cases and ensure stable boresight calculation
 */
function calculateBoresights(position: Vec3, planeNormal: Vec3): Vec3[] {
  const posNorm = norm(position);
  if (posNorm < 1e-10) return [];

  // Calculate radial unit vector (from Earth center to satellite)
  const radialUnit: Vec3 = [
    position[0]/posNorm,
    position[1]/posNorm,
    position[2]/posNorm
  ];

  // First try using the plane normal directly
  let normalUnit: Vec3 = [
    planeNormal[0],
    planeNormal[1],
    planeNormal[2]
  ];
  let normalNorm = norm(normalUnit);
  
  if (normalNorm < 1e-10) return [];
  
  // Normalize the normal vector
  normalUnit = [
    normalUnit[0]/normalNorm,
    normalUnit[1]/normalNorm,
    normalUnit[2]/normalNorm
  ];

  // Make sure normal is perpendicular to radial
  const dotRN = dot(radialUnit, normalUnit);
  if (Math.abs(dotRN) > 0.01) {
    // Project normal to be perpendicular to radial
    const normalPerp: Vec3 = [
      normalUnit[0] - dotRN * radialUnit[0],
      normalUnit[1] - dotRN * radialUnit[1],
      normalUnit[2] - dotRN * radialUnit[2]
    ];
    normalNorm = norm(normalPerp);
    
    if (normalNorm < 1e-10) {
      // If projection fails, use a default perpendicular vector
      const defaultAxis: Vec3 = Math.abs(radialUnit[0]) < Math.abs(radialUnit[1]) ? 
                             [1, 0, 0] : [0, 1, 0];
      const defaultPerp = cross(radialUnit, defaultAxis);
      normalNorm = norm(defaultPerp);
      if (normalNorm < 1e-10) return [];
      
      normalUnit = [
        defaultPerp[0]/normalNorm,
        defaultPerp[1]/normalNorm,
        defaultPerp[2]/normalNorm
      ];
    } else {
      normalUnit = [
        normalPerp[0]/normalNorm,
        normalPerp[1]/normalNorm,
        normalPerp[2]/normalNorm
      ];
    }
  }

  // Calculate velocity direction (cross product of normal and radial)
  const velDir = cross(normalUnit, radialUnit);
  const velNorm = norm(velDir);
  
  if (velNorm < 1e-10) return [];
  
  const velUnit: Vec3 = [
    velDir[0]/velNorm,
    velDir[1]/velNorm,
    velDir[2]/velNorm
  ];

  // Return both forward and backward boresight vectors
  return [velUnit, [-velUnit[0], -velUnit[1], -velUnit[2]]];
}

/**
 * Check if two satellites can establish a handshake based on their positions and orientations
 */
function checkHandshake(
  beacon: BeaconState,
  iridiumPos: Vec3,
  beaconBoresights: Vec3[],
): boolean {
  const r1Norm = norm(beacon.pos);
  const r2Norm = norm(iridiumPos);
  
  // Basic visibility checks
  if (r1Norm <= EARTH_RADIUS || r2Norm <= EARTH_RADIUS) return false;
  
  // Check for Earth blockage with a small margin to account for atmospheric effects
  const blockageMargin = 25; // km (reduced from 50km to avoid cutting contacts short)
  if (segmentMinDistance(beacon.pos, iridiumPos) < EARTH_RADIUS + blockageMargin) return false;

  // Line-of-sight unit vector from beacon to Iridium
  const v: Vec3 = [
    iridiumPos[0] - beacon.pos[0],
    iridiumPos[1] - beacon.pos[1],
    iridiumPos[2] - beacon.pos[2]
  ];
  const vNorm = norm(v);
  if (vNorm < 1e-10) return false;
  
  const vUnit: Vec3 = [v[0]/vNorm, v[1]/vNorm, v[2]/vNorm];

  // Check if Iridium is within beacon's cone (either boresight)
  let maxBeaconAngle = -1;
  for (const boresight of beaconBoresights) {
    const cosAngle = dot(boresight, vUnit);
    maxBeaconAngle = Math.max(maxBeaconAngle, cosAngle);
  }
  
  // Use a slightly relaxed beacon angle check to account for antenna side lobes
  const relaxedCosBeacon = COS_BEACON * 0.99; // Reduced relaxation to 1% for more accurate duration
  if (maxBeaconAngle < relaxedCosBeacon) return false;

  // Calculate Iridium satellite's nadir vector (points to Earth center)
  const r2u: Vec3 = [
    -iridiumPos[0]/r2Norm,
    -iridiumPos[1]/r2Norm,
    -iridiumPos[2]/r2Norm
  ];
  
  // For Iridium, check angle between nadir and line-of-sight
  // The negative vUnit is used because we want the vector from Iridium to beacon
  const cosIridiumAngle = dot(r2u, [-vUnit[0], -vUnit[1], -vUnit[2]]);
  
  // Use a slightly relaxed Iridium angle check to account for antenna side lobes
  const relaxedCosIridium = COS_IRIDIUM * 0.99; // Reduced relaxation to 1% for more accurate duration
  const okIridium = cosIridiumAngle >= relaxedCosIridium;
  
  return okIridium;
}

/**
 * Compute handshake and outage metrics using improved visibility checks
 */
export function computeLinkMetrics3D(
  beaconTimeline: BeaconState[],
  iridiumTimeline: IridiumStates
): LinkMetrics3D {
  const steps = beaconTimeline.length;
  if (iridiumTimeline.length !== steps) {
    throw new Error('Timeline length mismatch');
  }

  let handshakeCount = 0;
  let outageCount = 0;
  let outageDuration = 0;
  let inOutage = false;
  let prevLinked = false;
  const timeline: boolean[] = new Array(steps).fill(false);
  
  // For debugging - check visibility at specific timesteps
  debugVisibilityAtTimestep(beaconTimeline, iridiumTimeline, 0);  // Check at start
  debugVisibilityAtTimestep(beaconTimeline, iridiumTimeline, Math.floor(steps/2));  // Check at middle
  
  for (let i = 0; i < steps; i++) {
    const beacon = beaconTimeline[i];
    const beaconBoresights = calculateBoresights(beacon.pos, beacon.planeNormal);
    
    if (beaconBoresights.length === 0) {
      continue;
    }

    let hasLink = false;
    for (const iridiumPos of iridiumTimeline[i]) {
      if (checkHandshake(beacon, iridiumPos, beaconBoresights)) {
        hasLink = true;
        break;
      }
    }

    // Update metrics
    timeline[i] = hasLink;
    if (hasLink) {
      if (!prevLinked) {
        handshakeCount++;
      }
      if (inOutage) {
        inOutage = false;
      }
    } else {
      if (!inOutage) {
        outageCount++;
        inOutage = true;
      }
      outageDuration++;
    }
    prevLinked = hasLink;
  }

  // Post-process the timeline to ensure continuous handshakes
  // This helps catch edge cases where brief interruptions might split a handshake
  const INTERRUPTION_TOLERANCE = 2; // Allow up to 2-minute gaps
  for (let i = INTERRUPTION_TOLERANCE; i < steps - INTERRUPTION_TOLERANCE; i++) {
    if (!timeline[i] && 
        timeline[i - INTERRUPTION_TOLERANCE] && 
        timeline[i + INTERRUPTION_TOLERANCE]) {
      // Fill in small gaps in handshakes
      for (let j = i - INTERRUPTION_TOLERANCE + 1; j < i + INTERRUPTION_TOLERANCE; j++) {
        timeline[j] = true;
      }
    }
  }

  return { handshakeCount, outageCount, outageDuration, timeline };
} 