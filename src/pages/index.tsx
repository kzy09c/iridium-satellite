import React, { useState, useEffect, useRef } from 'react';
import OrbitForm from '../components/OrbitForm';
import OrbitViewer from '../components/OrbitViewer';
import ResultsPanel from '../components/ResultsPanel';
import SatelliteDataTable from '../components/SatelliteDataTable';
import TimelineScrollBar from '../components/TimelineScrollBar';
import { simulationEngine } from '../lib/simulate';
import { fetchIridiumTLEs, processTLEs } from '../lib/tleService';
import type { SimulationParams, SimulationResult } from '../types';
import type { SatelliteInfo } from '../lib/tleService';
import '../styles/main.css';

const IndexPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [simulationTime, setSimulationTime] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [animationPaused, setAnimationPaused] = useState<boolean>(false);
  const [timeMultiplier, setTimeMultiplier] = useState<number>(5);
  
  // New state for satellite data
  const [satellites, setSatellites] = useState<SatelliteInfo[]>([]);
  const [isLoadingSatellites, setIsLoadingSatellites] = useState<boolean>(false);
  const [satelliteError, setSatelliteError] = useState<string | null>(null);
  
  // Load satellite data on component mount
  useEffect(() => {
    const loadSatellites = async () => {
      setIsLoadingSatellites(true);
      setSatelliteError(null);
      
      try {
        const tles = await fetchIridiumTLEs();
        const processedSatellites = processTLEs(tles);
        setSatellites(processedSatellites);
      } catch (error) {
        console.error('Failed to load satellite data:', error);
        setSatelliteError('Failed to load satellite data. Using fallback data.');
        
        // Create fallback data
        const fallbackSatellites: SatelliteInfo[] = Array.from({ length: 66 }, (_, i) => ({
          id: i + 1,
          name: `IRIDIUM ${i + 1}`,
          altitude: 781,
          inclination: 86.4,
          raan: (Math.ceil((i + 1) / 11) - 1) * 31.6,
          satrec: null as any,
          tle: { name: '', line1: '', line2: '' },
          initialPhase: Math.random() * 2 * Math.PI
        }));
        
        setSatellites(fallbackSatellites);
      } finally {
        setIsLoadingSatellites(false);
      }
    };
    
    loadSatellites();
  }, []);
  
  // Refs for animation
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  
  // Animation loop for the 3D view
  useEffect(() => {
    if (!result || animationPaused) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }
    
    const duration = result.contactFlags.length; // Minutes in the simulation
    const speed = timeMultiplier; // Speed multiplier
    
    let lastTimestamp = 0;
    let accumulatedTime = 0;
    
    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      
      // Calculate delta time for smoother animation
      const deltaTime = lastTimestamp ? (timestamp - lastTimestamp) / 1000 : 0;
      lastTimestamp = timestamp;
      
      // Accumulate time to avoid jumpy animation
      accumulatedTime += deltaTime * speed;
      
      // Calculate the current simulation time (loop through duration)
      const simTime = Math.floor(accumulatedTime) % duration;
      setSimulationTime(simTime);
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [result, animationPaused, timeMultiplier]);
  
  // Handle pause/resume of animation
  const toggleAnimation = () => {
    if (animationPaused) {
      // Reset start time when resuming
      startTimeRef.current = null;
    }
    setAnimationPaused(!animationPaused);
  };
  
  // Handle manual time slider change
  const handleTimeChange = (time: number) => {
    setSimulationTime(time);
    // Pause animation when manually setting time
    setAnimationPaused(true);
  };
  
  // Handle time multiplier change
  const handleMultiplierChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = parseInt(event.target.value, 10);
    setTimeMultiplier(value);
    // Reset animation timing
    startTimeRef.current = null;
  };
  
  // Cleanup simulation engine on unmount
  useEffect(() => {
    return () => {
      simulationEngine.dispose();
    };
  }, []);
  
  const handleSubmit = async (params: SimulationParams) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await simulationEngine.runSimulation(params);
      setResult(result);
      // Reset animation state
      setAnimationPaused(false);
      startTimeRef.current = null;
      setSimulationTime(0);
    } catch (err) {
      setError((err as Error).message);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Satellite Communication Simulator</h1>
        <p>
          Simulate 24-hour satellite communication between a Beacon and the Iridium constellation
        </p>
      </header>
      
      <main className="app-content">
        <div className="left-panel">
          <OrbitForm onSubmit={handleSubmit} isLoading={isLoading} />
          
          {error && (
            <div className="error-message">
              <h3>Error</h3>
              <p>{error}</p>
            </div>
          )}
        </div>
        
        <div className="right-panel">
          <div className="viewer-container">
            <OrbitViewer result={result} currentTime={simulationTime} />
            
            {result && (
              <div className="timeline-controls">
                <button 
                  className="control-button"
                  onClick={toggleAnimation}
                  type="button"
                >
                  {animationPaused ? 'Resume' : 'Pause'}
                </button>
                
                <TimelineScrollBar
                  currentTime={simulationTime}
                  duration={result.contactFlags.length - 1}
                  onTimeChange={handleTimeChange}
                  isPaused={animationPaused}
                />
                
                <div className="multiplier-control">
                  <label htmlFor="time-multiplier">Speed:</label>
                  <select 
                    id="time-multiplier" 
                    value={timeMultiplier}
                    onChange={handleMultiplierChange}
                  >
                    <option value="1">1x</option>
                    <option value="5">5x</option>
                    <option value="10">10x</option>
                    <option value="30">30x</option>
                    <option value="60">60x</option>
                    <option value="120">120x</option>
                  </select>
                </div>
              </div>
            )}
          </div>
          
          <div className="results-container">
            <ResultsPanel result={result} currentTime={simulationTime} />
          </div>
          
          <SatelliteDataTable 
            satellites={satellites}
            isLoading={isLoadingSatellites}
            error={satelliteError}
          />
        </div>
      </main>
      
      <footer className="app-footer">
        <p>
          Created with React, TypeScript, and Three.js
        </p>
      </footer>
    </div>
  );
};

export default IndexPage;