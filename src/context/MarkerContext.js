import React, { createContext, useState, useContext } from 'react';

const MarkerContext = createContext();

export function MarkerProvider({ children }) {
  const [markers, setMarkers] = useState([]);
  const [missingCoordinates, setMissingCoordinates] = useState([]);

  return (
    <MarkerContext.Provider value={{
      markers,
      setMarkers,
      missingCoordinates,
      setMissingCoordinates
    }}>
      {children}
    </MarkerContext.Provider>
  );
}

export function useMarkers() {
  return useContext(MarkerContext);
} 