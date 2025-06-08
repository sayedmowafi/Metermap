import proj4 from 'proj4';

// Define the UTM zone 40N projection (Al Ain, UAE is in zone 40N)
const utmProjection = '+proj=utm +zone=40 +datum=WGS84 +units=m +no_defs';
const wgs84Projection = '+proj=longlat +datum=WGS84 +no_defs';

// UTM to Lat/Long conversion
function utmToLatLong(x, y, zone = 40) {
  if (!x || !y) return { longitude: null, latitude: null, mapsLink: null };

  try {
    // Constants for WGS84
    const a = 6378137; // equatorial radius in meters
    const f = 1 / 298.257223563; // flattening
    const e = Math.sqrt(2 * f - f * f); // eccentricity

    // Simplified conversion for UTM Zone 40 (Al Ain region)
    const hemisphere = 'N';
    const falseEasting = 500000;
    const falseNorthing = (hemisphere === 'N') ? 0 : 10000000;

    // Remove false easting and northing
    const xp = x - falseEasting;
    const yp = y - falseNorthing;

    // Calculate longitude
    const longitude = (zone * 6 - 183) + (xp / (a * 0.9996)) * (180 / Math.PI);

    // Simplified latitude calculation
    const latitude = (yp / (a * 0.9996)) * (180 / Math.PI);

    return {
      longitude: longitude,
      latitude: latitude,
      mapsLink: `https://www.google.com/maps?q=${latitude},${longitude}`
    };
  } catch (error) {
    return { longitude: null, latitude: null, mapsLink: null };
  }
}

export function convertCoordinates(x, y) {
  if (!x || !y) return { longitude: null, latitude: null };

  try {
    // Convert from UTM to WGS84 (longitude/latitude)
    const [longitude, latitude] = proj4(utmProjection, wgs84Projection, [Number(x), Number(y)]);
    return { longitude, latitude };
  } catch (error) {
    return { longitude: null, latitude: null };
  }
}

export function extractCoordinatesFromInput(input) {
  // Check if input is a MyLand URL
  if (input.includes('myland.dmt.gov.ae')) {
    try {
      const url = new URL(input);
      const x = url.searchParams.get('x');
      const y = url.searchParams.get('y');
      if (x && y) {
        return {
          latitude: parseFloat(y),
          longitude: parseFloat(x)
        };
      }
    } catch (error) {
      return null;
    }
  }
  
  // Handle manual coordinate input (Y,X format)
  try {
    const [y, x] = input.split(',').map(coord => parseFloat(coord.trim()));
    if (!isNaN(y) && !isNaN(x)) {
      return {
        latitude: y,
        longitude: x
      };
    }
  } catch (error) {
    return null;
  }
  
  return null;
}

export function processAndSortData(data) {
  return data.sort((a, b) => {
    if (!a['رقم اللاصق'] || !b['رقم اللاصق']) return 0;
    return String(a['رقم اللاصق']).localeCompare(String(b['رقم اللاصق']));
  });
}

// Add default export
export default {
  convertCoordinates,
  extractCoordinatesFromInput
}; 