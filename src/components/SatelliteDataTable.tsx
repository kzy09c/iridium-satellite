import React, { useState, useEffect } from 'react';
import type { SatelliteInfo } from '../lib/tleService';
import { eciToLatLon } from '../lib/coordinates';
import './SatelliteDataTable.css';

interface SatelliteDataTableProps {
  satellites: SatelliteInfo[];
  isLoading: boolean;
  error: string | null;
}

interface SatellitePosition {
  latitude: number;
  longitude: number;
}

const SatelliteDataTable: React.FC<SatelliteDataTableProps> = ({ satellites, isLoading, error }) => {
  const [positions, setPositions] = useState<Map<number, SatellitePosition>>(new Map());

  // Update positions every second
  useEffect(() => {
    const updatePositions = () => {
      const newPositions = new Map<number, SatellitePosition>();
      
      satellites.forEach(satellite => {
        if (satellite.satrec) {
          try {
            // Get current time
            const now = new Date();
            // Calculate satellite position
            const positionAndVelocity = satellite.satrec.propagate(
              now.getUTCFullYear(),
              now.getUTCMonth() + 1, // months range from 1-12, not 0-11
              now.getUTCDate(),
              now.getUTCHours(),
              now.getUTCMinutes(),
              now.getUTCSeconds()
            );
            
            if (positionAndVelocity.position) {
              const { position } = positionAndVelocity;
              const latLon = eciToLatLon({
                x: position.x * 1000, // convert to meters
                y: position.y * 1000,
                z: position.z * 1000
              }, now);
              
              newPositions.set(satellite.id, {
                latitude: latLon.latitude,
                longitude: latLon.longitude
              });
            }
          } catch (error) {
            console.error(`Error calculating position for satellite ${satellite.id}:`, error);
          }
        }
      });
      
      setPositions(newPositions);
    };

    // Update immediately and then every second
    updatePositions();
    const interval = setInterval(updatePositions, 1000);

    return () => clearInterval(interval);
  }, [satellites]);

  if (isLoading) {
    return <div className="satellite-table-loading">Loading satellite data...</div>;
  }

  if (error) {
    return <div className="satellite-table-error">Error loading satellite data: {error}</div>;
  }

  return (
    <div className="satellite-data-table-container">
      <h2>Satellite Database</h2>
      <div className="table-wrapper">
        <table className="satellite-data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Altitude (km)</th>
              <th>Inclination (°)</th>
              <th>
                <div className="header-with-tooltip">
                  RAAN (°)
                  <span className="tooltip">
                    Right Ascension of the Ascending Node (RAAN) measures where the satellite's orbit crosses the Earth's equator going from south to north. 
                    It's measured in degrees eastward from a reference direction (the vernal equinox). 
                    This value helps define the orientation of the orbital plane in space.
                  </span>
                </div>
              </th>
              <th>Current Latitude (°)</th>
              <th>Current Longitude (°)</th>
              <th>TLE Data Available</th>
            </tr>
          </thead>
          <tbody>
            {satellites.map((satellite) => {
              const position = positions.get(satellite.id);
              return (
                <tr key={satellite.id}>
                  <td>{satellite.id}</td>
                  <td>{satellite.name}</td>
                  <td>{satellite.altitude.toFixed(1)}</td>
                  <td>{satellite.inclination.toFixed(2)}</td>
                  <td>{satellite.raan?.toFixed(2) || 'N/A'}</td>
                  <td>{position ? position.latitude.toFixed(2) : 'N/A'}</td>
                  <td>{position ? position.longitude.toFixed(2) : 'N/A'}</td>
                  <td>
                    <span className={`status-indicator ${satellite.satrec ? 'available' : 'unavailable'}`}>
                      {satellite.satrec ? '✓' : '✗'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SatelliteDataTable; 