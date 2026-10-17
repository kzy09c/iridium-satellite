import type { Position } from '../types';

/**
 * Convert Earth-Centered Inertial (ECI) coordinates to latitude and longitude
 * This is a simplified conversion that doesn't account for Earth's rotation
 * For more accurate results, we would need to use a proper coordinate transformation library
 */
export function eciToLatLon(position: Position, time: Date): { latitude: number; longitude: number } {
  const x = position.x;
  const y = position.y;
  const z = position.z;
  
  // Calculate the radius
  const r = Math.sqrt(x * x + y * y + z * z);
  
  // Calculate latitude (declination)
  const latitude = Math.asin(z / r) * 180 / Math.PI;
  
  // Calculate longitude, accounting for Earth's rotation
  const gmst = getGMST(time);
  let longitude = (Math.atan2(y, x) * 180 / Math.PI) - gmst;
  
  // Normalize longitude to [-180, 180]
  longitude = ((longitude + 180) % 360) - 180;
  
  return { latitude, longitude };
}

/**
 * Calculate Greenwich Mean Sidereal Time (GMST)
 * This is a simplified calculation that gives approximate results
 */
function getGMST(time: Date): number {
  // Get the Julian Date
  const jd = getJulianDate(time);
  
  // Calculate the number of centuries since J2000.0
  const t = (jd - 2451545.0) / 36525.0;
  
  // Calculate GMST in degrees
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) +
    0.000387933 * t * t - t * t * t / 38710000.0;
  
  // Normalize to [0, 360]
  gmst = gmst % 360;
  if (gmst < 0) {
    gmst += 360;
  }
  
  return gmst;
}

/**
 * Calculate Julian Date from a JavaScript Date object
 */
function getJulianDate(time: Date): number {
  const year = time.getUTCFullYear();
  const month = time.getUTCMonth() + 1;
  const day = time.getUTCDate();
  const hour = time.getUTCHours();
  const minute = time.getUTCMinutes();
  const second = time.getUTCSeconds();
  
  let jd = 367 * year -
    Math.floor(7 * (year + Math.floor((month + 9) / 12)) / 4) +
    Math.floor(275 * month / 9) +
    day + 1721013.5 +
    ((hour + minute / 60 + second / 3600) / 24);
    
  return jd;
} 