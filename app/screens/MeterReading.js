import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  Modal,
  ActivityIndicator,
  FlatList,
  Dimensions,
  TextInput
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import Constants from 'expo-constants';
import { useMarkers } from '../../src/context/MarkerContext';
import { convertCoordinates } from '../../src/utils/coordinateConverter';
import { FontAwesome } from '@expo/vector-icons';

const LOCATION_TRACKING = 'location-tracking';

TaskManager.defineTask(LOCATION_TRACKING, async ({ data: { locations }, error }) => {
  if (error) {
    return;
  }
});

export default function MeterReading() {
  const { markers: originalMarkers, setMarkers } = useMarkers();
  const [currentLocation, setCurrentLocation] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [completedMeters, setCompletedMeters] = useState(new Set());
  const [showDetails, setShowDetails] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const mapRef = useRef(null);
  const [optimizedRoute, setOptimizedRoute] = useState([]);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(true);
  const [missingCoordinates, setMissingCoordinates] = useState([]);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [currentMissingIndex, setCurrentMissingIndex] = useState(0);
  const [coordinateInput, setCoordinateInput] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const hasZoomed = useRef(new Set());
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [showRecenterButton, setShowRecenterButton] = useState(false);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [isProcessingMissing, setIsProcessingMissing] = useState(false);
  const [traveledPath, setTraveledPath] = useState([]);
  const [lastUserLocation, setLastUserLocation] = useState(null);
  const [isContinuousCentering, setIsContinuousCentering] = useState(false);
  const [completedPathSegments, setCompletedPathSegments] = useState([]);

  useEffect(() => {
    checkLocationPermission();
  }, []);

  useEffect(() => {
    if (currentLocation && originalMarkers.length > 0) {
      optimizeRoute();
    }
  }, [currentLocation, originalMarkers]);

  useEffect(() => {
    if (originalMarkers.length > 0) {
      setShowUploadModal(false);
    }
  }, [originalMarkers]);

  useEffect(() => {
    if (optimizedRoute.length > 0) {
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: optimizedRoute[0].coordinate.latitude,
            longitude: optimizedRoute[0].coordinate.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          });
        }
      }, 500);
    }
  }, [optimizedRoute]);

  useEffect(() => {
    if (optimizedRoute.length > 0) {
      // Force a re-render of the markers after a short delay
      const timer = setTimeout(() => {
        setOptimizedRoute(prevRoute => [...prevRoute]);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [optimizedRoute.length]);

  const checkLocationPermission = async () => {
    try {
      const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
      
      if (foregroundStatus === 'granted') {
        startLocationTracking();
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          startLocationTracking();
        } else {
          setLocationPermissionStatus('denied');
          Alert.alert(
            'Location Permission Required',
            'This app needs access to location to show your position on the map. Please enable location services in your settings.',
            [
              { text: 'OK', onPress: () => checkLocationPermission() }
            ]
          );
        }
      }
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to check location permissions. Please try again.',
        [
          { text: 'Retry', onPress: () => checkLocationPermission() }
        ]
      );
    }
  };

  const startLocationTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is needed.');
        return;
      }

      const locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 5,
          timeInterval: 2000,
        },
        (location) => {
          const { latitude, longitude } = location.coords;
          setUserLocation(location.coords);
          
          // Update traveled path
          if (lastUserLocation) {
            const newPathSegment = [
              { latitude: lastUserLocation.latitude, longitude: lastUserLocation.longitude },
              { latitude, longitude }
            ];
            
            // Add to traveled path
            setTraveledPath(prev => [...prev, ...newPathSegment]);
            
            // If we're navigating to a marker, add this segment to completed paths
            if (optimizedRoute.length > 0 && currentIndex < optimizedRoute.length) {
              const currentMeter = optimizedRoute[currentIndex];
              const distanceToMeter = calculateDistance(
                { latitude, longitude },
                currentMeter.coordinate
              ) * 1000; // Convert to meters
              
              // If we're close to the current marker, mark this path segment as completed
              if (distanceToMeter < 50) {
                setCompletedPathSegments(prev => [...prev, ...newPathSegment]);
              }
            }
          }
          setLastUserLocation(location.coords);
          
          // If continuous centering is enabled, keep the map centered on user
          if (isContinuousCentering && mapRef.current) {
            mapRef.current.animateToRegion({
              latitude,
              longitude,
              latitudeDelta: 0.003,
              longitudeDelta: 0.003,
            });
          }
          
          checkProximityAndZoom(location.coords);
          
          // Update route when user location changes significantly
          if (optimizedRoute.length > 0 && !isProcessingMissing) {
            const currentMeter = optimizedRoute[currentIndex];
            const lastPos = lastUserLocation || location.coords;
            
            // Only update route if moved more than 10 meters
            const distance = calculateDistance(
              { latitude: lastPos.latitude, longitude: lastPos.longitude },
              { latitude, longitude }
            ) * 1000; // Convert to meters
            
            if (distance > 10) {
              getRouteCoordinates(
                latitude,
                longitude,
                currentMeter.coordinate.latitude,
                currentMeter.coordinate.longitude
              );
            }
          }
        }
      );
      
      return locationSubscription;
    } catch (err) {
    }
  };

  const stopLocationTracking = async () => {
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TRACKING);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(LOCATION_TRACKING);
      }
    } catch (error) {
    }
  };

  const calculateDistance = (point1, point2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (point2.latitude - point1.latitude) * Math.PI / 180;
    const dLon = (point2.longitude - point1.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(point1.latitude * Math.PI / 180) * Math.cos(point2.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const optimizeRoute = async () => {
    try {
      if (originalMarkers.length === 0) {
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is needed for route optimization.');
        setOptimizedRoute(originalMarkers);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const startPoint = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      };
      setUserLocation(location.coords);

      // Group markers by proximity (clustering)
      const clusters = createClusters(originalMarkers);
      
      // Sort clusters by distance from current location
      const sortedClusters = clusters.sort((a, b) => {
        const distA = calculateDistance(startPoint, getCenterPoint(a));
        const distB = calculateDistance(startPoint, getCenterPoint(b));
        return distA - distB;
      });

      // Optimize route within each cluster
      const optimizedMarkers = [];
      let currentPoint = startPoint;

      for (const cluster of sortedClusters) {
        const clusterRoute = optimizeClusterRoute(cluster, currentPoint);
        optimizedMarkers.push(...clusterRoute);
        currentPoint = clusterRoute[clusterRoute.length - 1].coordinate;
      }

      // Update displayIndex based on the new optimized order
      const markersWithUpdatedIndex = optimizedMarkers.map((marker, index) => ({
        ...marker,
        displayIndex: index + 1  // Sequential numbering based on optimized route
      }));

      setOptimizedRoute(markersWithUpdatedIndex);
      
      // Update route to first marker
      if (markersWithUpdatedIndex.length > 0 && location) {
        getRouteCoordinates(
          location.coords.latitude,
          location.coords.longitude,
          markersWithUpdatedIndex[0].coordinate.latitude,
          markersWithUpdatedIndex[0].coordinate.longitude
        );
        
        // Animate to first marker
        setTimeout(() => {
          mapRef.current?.animateToRegion({
            latitude: markersWithUpdatedIndex[0].coordinate.latitude,
            longitude: markersWithUpdatedIndex[0].coordinate.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          });
        }, 500);
      }
    } catch (error) {
      setOptimizedRoute(originalMarkers);
    }
  };

  const createClusters = (markers) => {
    const CLUSTER_RADIUS = 0.5; // in kilometers
    const clusters = [];
    const used = new Set();

    markers.forEach((marker, i) => {
      if (used.has(i)) return;

      const cluster = [marker];
      used.add(i);

      markers.forEach((other, j) => {
        if (i !== j && !used.has(j)) {
          const distance = calculateDistance(marker.coordinate, other.coordinate) / 1000; // convert to km
          if (distance <= CLUSTER_RADIUS) {
            cluster.push(other);
            used.add(j);
          }
        }
      });

      clusters.push(cluster);
    });

    return clusters;
  };

  const optimizeClusterRoute = (cluster, startPoint) => {
    let route = [];
    let unvisited = [...cluster];
    let currentPoint = startPoint;

    while (unvisited.length > 0) {
      let nearest = unvisited.reduce((nearest, marker, index) => {
        const distance = calculateDistance(currentPoint, marker.coordinate);
        if (distance < nearest.distance) {
          return { marker, distance, index };
        }
        return nearest;
      }, { marker: unvisited[0], distance: Infinity, index: 0 });

      route.push(nearest.marker);
      currentPoint = nearest.marker.coordinate;
      unvisited.splice(nearest.index, 1);
    }

    return route;
  };

  const getCenterPoint = (markers) => {
    const sum = markers.reduce((acc, marker) => ({
      latitude: acc.latitude + marker.coordinate.latitude,
      longitude: acc.longitude + marker.coordinate.longitude
    }), { latitude: 0, longitude: 0 });

    return {
      latitude: sum.latitude / markers.length,
      longitude: sum.longitude / markers.length
    };
  };

  const handleMarkerPress = (marker, index) => {
    setCurrentIndex(index);
    mapRef.current?.animateToRegion({
      latitude: marker.coordinate.latitude,
      longitude: marker.coordinate.longitude,
      latitudeDelta: 0.0016, // Increased zoom level
      longitudeDelta: 0.0016, // Increased zoom level
    });
    
    // Update route to this marker
    if (userLocation) {
      getRouteCoordinates(
        userLocation.latitude,
        userLocation.longitude,
        marker.coordinate.latitude,
        marker.coordinate.longitude
      );
    }
  };

  const markAsComplete = () => {
    const currentMeterId = optimizedRoute[currentIndex].id;
    setCompletedMeters(prev => {
      const newSet = new Set(prev);
      newSet.add(currentMeterId);
      return newSet;
    });
  };

  const processExcelData = (data) => {
    // Group by address
    const addressGroups = {};
    
    data.forEach((row, index) => {
      if (row.X && row.Y) {
        const address = row['عنوان القسيمه'] || 'No address';
        const serviceType = row['الخدمة'] || 'Unknown';
        
        // Use the correct field for meter number: "رقم اللاصق" (column D)
        let meterNumber = 'N/A';
        if (row['رقم اللاصق'] !== undefined && row['رقم اللاصق'] !== null) {
          meterNumber = row['رقم اللاصق'].toString();
        }
        
        if (!addressGroups[address]) {
          addressGroups[address] = {
            meters: [],
            coordinates: convertCoordinates(row.X, row.Y),
            id: `group_${index}`
          };
        }
        
        addressGroups[address].meters.push({
          id: index.toString(),
          meterNumber: meterNumber,
          serviceType: serviceType,
          originalData: row
        });
      }
    });
    
    // Convert groups to markers
    const markers = [];
    let validIndex = 0;
    
    Object.entries(addressGroups).forEach(([address, group]) => {
      // Format the service types
      const serviceTypes = group.meters.map(m => m.serviceType);
      let serviceTypeDisplay = '';
      
      if (serviceTypes.length <= 3) {
        // For 3 or fewer meters, show each type (E, W, etc.)
        serviceTypeDisplay = serviceTypes.join('');
      } else {
        // For more than 3 meters, count each type
        const typeCounts = {};
        serviceTypes.forEach(type => {
          typeCounts[type] = (typeCounts[type] || 0) + 1;
        });
        
        serviceTypeDisplay = Object.entries(typeCounts)
          .map(([type, count]) => `${count}${type}`)
          .join(' ');
      }
      
      // Get meter numbers for display
      const meterNumbers = group.meters.map(m => m.meterNumber).filter(n => n !== 'N/A');
      const meterNumbersDisplay = meterNumbers.length > 0 ? meterNumbers.join(', ') : 'N/A';
      
      markers.push({
        id: group.id,
        coordinate: group.coordinates,
        meterNumber: meterNumbersDisplay,
        address: address,
        serviceType: serviceTypeDisplay,
        meters: group.meters,
        displayIndex: validIndex + 1,
        originalData: group.meters[0].originalData
      });
      
      validIndex++;
    });
    
    return markers;
  };

  const handleFileUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/octet-stream'
        ],
        copyToCacheDirectory: true
      });

      if (result.assets && result.assets[0]) {
        setIsLoading(true);
        const { uri } = result.assets[0];
        const content = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const workbook = XLSX.read(content, { type: 'base64' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet);

        if (rawData.length === 0) {
          Alert.alert('Error', 'The Excel file appears to be empty.');
          setIsLoading(false);
          return;
        }

        // Skip the last row as it's just information
        const data = rawData.slice(0, -1);
        
        // Process data with address grouping
        const processedMarkers = processExcelData(data);
        
        // Handle missing coordinates (those without X and Y)
        const missing = [];
        data.forEach((row, index) => {
          if (!row.X || !row.Y) {
            missing.push({
              id: index.toString(),
              meterNumber: row.METER_NO?.toString() || 'N/A',
              address: row['عنوان القسيمه'] || 'No address provided',
              originalData: row
            });
          }
        });
        
        setMarkers(processedMarkers);
        setMissingCoordinates(missing);

        if (missing.length > 0) {
          setIsProcessingMissing(true);
          setShowMissingModal(true);
          setCurrentMissingIndex(0);
          setShowUploadModal(false);
        } else {
          setShowUploadModal(false);
          setOptimizedRoute(processedMarkers);
          setTimeout(() => {
            optimizeRoute();
          }, 500);
          Alert.alert('Success', `Successfully loaded ${processedMarkers.length} locations`);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to process the Excel file. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMissingCoordinate = () => {
    try {
      const coords = convertCoordinates(coordinateInput);
      if (!coords) {
        Alert.alert('Error', 'Invalid coordinate format. Please try again.');
        return;
      }

      const missingMeter = missingCoordinates[currentMissingIndex];
      const newMarker = {
        ...missingMeter,
        coordinate: coords,
        displayIndex: originalMarkers.length + 1
      };

      setMarkers(prev => [...prev, newMarker]);

      if (currentMissingIndex < missingCoordinates.length - 1) {
        setCurrentMissingIndex(prev => prev + 1);
        setCoordinateInput('');
      } else {
        setShowMissingModal(false);
        setMissingCoordinates([]);
        setIsProcessingMissing(false);
        
        // Now that all missing coordinates are processed, optimize the route
        setTimeout(() => {
          optimizeRoute();
        }, 500);
        
        Alert.alert('Success', 'All meter locations have been processed');
      }
    } catch (error) {
      Alert.alert('Error', 'Invalid coordinate format. Please try again.');
    }
  };

  const skipAllMissingCoordinates = () => {
    setShowMissingModal(false);
    setMissingCoordinates([]);
    setIsProcessingMissing(false);
    
    // Optimize route with only the valid markers
    setTimeout(() => {
      optimizeRoute();
    }, 500);
  };

  const handleNext = () => {
    if (currentIndex < optimizedRoute.length - 1) {
      setCurrentIndex(currentIndex + 1);
      const nextMarker = optimizedRoute[currentIndex + 1];
      mapRef.current?.animateToRegion({
        latitude: nextMarker.coordinate.latitude,
        longitude: nextMarker.coordinate.longitude,
        latitudeDelta: 0.0016, // Increased zoom level (smaller delta = more zoom)
        longitudeDelta: 0.0016, // Increased zoom level
      });
      
      // Update route to next marker
      if (userLocation) {
        getRouteCoordinates(
          userLocation.latitude,
          userLocation.longitude,
          nextMarker.coordinate.latitude,
          nextMarker.coordinate.longitude
        );
      }
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      const prevMarker = optimizedRoute[currentIndex - 1];
      mapRef.current?.animateToRegion({
        latitude: prevMarker.coordinate.latitude,
        longitude: prevMarker.coordinate.longitude,
        latitudeDelta: 0.0008, // Increased zoom level
        longitudeDelta: 0.0008, // Increased zoom level
      });
      
      // Update route to previous marker
      if (userLocation) {
        getRouteCoordinates(
          userLocation.latitude,
          userLocation.longitude,
          prevMarker.coordinate.latitude,
          prevMarker.coordinate.longitude
        );
      }
    }
  };

  const checkProximityAndZoom = (userCoords) => {
    if (!optimizedRoute.length) return;
    
    optimizedRoute.forEach((marker, index) => {
      const distance = calculateDistance(
        { latitude: userCoords.latitude, longitude: userCoords.longitude },
        marker.coordinate
      ) * 1000; // Convert to meters

      // When within 100 meters of a house, zoom in to maximum level
      if (distance <= 100 && !hasZoomed.current.has(marker.id)) {
        mapRef.current?.animateToRegion({
          latitude: marker.coordinate.latitude,
          longitude: marker.coordinate.longitude,
          latitudeDelta: 0.0012, // Maximum zoom level
          longitudeDelta: 0.0012, // Maximum zoom level
        });
        hasZoomed.current.add(marker.id);
        setCurrentIndex(index);
      }
    });
  };

  const getRouteCoordinates = async (startLat, startLng, destLat, destLng) => {
    setIsRouteLoading(true);
    try {
      const apiKey = Constants.expoConfig?.extra?.openrouteApiKey;
      const response = await fetch(
        `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${apiKey}&start=${startLng},${startLat}&end=${destLng},${destLat}`
      );
      
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const routeCoords = data.features[0].geometry.coordinates.map(coord => ({
          latitude: coord[1],
          longitude: coord[0]
        }));
        setRouteCoordinates(routeCoords);
      } else {
        // Fallback to straight line if routing API fails
        setRouteCoordinates([
          { latitude: startLat, longitude: startLng },
          { latitude: destLat, longitude: destLng }
        ]);
      }
    } catch (error) {
      setRouteCoordinates([
        { latitude: startLat, longitude: startLng },
        { latitude: destLat, longitude: destLng }
      ]);
    } finally {
      setIsRouteLoading(false);
    }
  };

  const handleMapMovement = () => {
    setShowRecenterButton(true);
  };

  const recenterMap = () => {
    if (userLocation && mapRef.current) {
      // Toggle continuous centering mode
      setIsContinuousCentering(!isContinuousCentering);
      
      // Initial centering
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.003, // More zoomed in
        longitudeDelta: 0.003, // More zoomed in
      });
      
      setShowRecenterButton(true); // Keep button visible to allow toggling off
    }
  };

  const renderHeader = () => {
    if (!optimizedRoute.length) return null;
    
    const currentMeter = optimizedRoute[currentIndex];
    const meterData = currentMeter?.originalData || {};
    const isCompleted = completedMeters.has(currentMeter.id);
    const displayIndex = currentMeter.displayIndex || (currentIndex + 1);

    // Get all meter numbers for this location
    let meterNumberDisplay = 'N/A';
    
    if (currentMeter.meters && currentMeter.meters.length > 0) {
      // Extract meter numbers from all meters at this location
      const allMeterNumbers = currentMeter.meters.map(meter => {
        const meterOriginalData = meter.originalData || {};
        return meterOriginalData["رقم اللاصق"]?.toString() || meter.meterNumber;
      }).filter(num => num && num !== 'N/A');
      
      // Join all meter numbers with commas
      meterNumberDisplay = allMeterNumbers.length > 0 ? allMeterNumbers.join(', ') : 'N/A';
    } else if (meterData["رقم اللاصق"]) {
      // Fallback to single meter number
      meterNumberDisplay = meterData["رقم اللاصق"].toString();
    }

    return (
      <View style={styles.headerContainer}>
        <View style={styles.navigationArrows}>
          <TouchableOpacity 
            style={[styles.arrowButton, currentIndex === 0 && styles.disabledButton]}
            onPress={handlePrevious}
            disabled={currentIndex === 0}
          >
            <Text style={styles.arrowText}>←</Text>
          </TouchableOpacity>
          
          <View style={styles.meterInfo}>
            <Text style={styles.progressText}>
              Meter {displayIndex} of {optimizedRoute.length}
            </Text>
            <Text style={styles.meterNumber}>
              Meter: {meterNumberDisplay}
            </Text>
            <Text style={styles.meterType}>
              Type: {currentMeter.serviceType || 'Unknown'}
            </Text>
            <Text style={styles.meterAddress}>
              {currentMeter.address || 'No address provided'}
            </Text>
          </View>

          <TouchableOpacity 
            style={[styles.arrowButton, currentIndex === optimizedRoute.length - 1 && styles.disabledButton]}
            onPress={handleNext}
            disabled={currentIndex === optimizedRoute.length - 1}
          >
            <Text style={styles.arrowText}>→</Text>
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity 
          style={[
            styles.completeButton,
            completedMeters.has(currentMeter.id) && styles.completedButton
          ]}
          onPress={markAsComplete}
        >
          <Text style={styles.completeButtonText}>
            {completedMeters.has(currentMeter.id) ? 'Completed' : 'Mark as Complete'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderHeader()}
      
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={{
          latitude: optimizedRoute[0]?.coordinate?.latitude || 24.1302,
          longitude: optimizedRoute[0]?.coordinate?.longitude || 55.7458,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
        showsUserLocation={true}
        showsMyLocationButton={false}
        mapType="satellite"
        onPanDrag={handleMapMovement}
        onRegionChangeComplete={handleMapMovement}
      >
        {/* Completed path segments - grey color */}
        {completedPathSegments.length > 0 && (
          <Polyline
            coordinates={completedPathSegments}
            strokeWidth={4}
            strokeColor="#9ca3af" // Grey color
          />
        )}
        
        {/* Active path - blue color */}
        {traveledPath.length > 0 && (
          <Polyline
            coordinates={traveledPath.filter(coord => 
              !completedPathSegments.some(segment => 
                segment.latitude === coord.latitude && segment.longitude === coord.longitude
              )
            )}
            strokeWidth={4}
            strokeColor="#3b82f6" // Blue color
          />
        )}
        
        {/* Route polyline */}
        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeWidth={4}
            strokeColor="#3b82f6" // Blue color
          />
        )}
        
        {optimizedRoute.map((marker, index) => (
          <Marker
            key={marker.id || index}
            coordinate={marker.coordinate}
            onPress={() => handleMarkerPress(marker, index)}
            tracksViewChanges={false}
          >
            <View style={[
              styles.markerCircle,
              completedMeters.has(marker.id) && styles.completedMarker,
              index === currentIndex && styles.selectedMarker
            ]}>
              <Text style={styles.markerText}>{marker.displayIndex || index + 1}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Meter Details Modal */}
      <Modal
        visible={showDetails}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Meter Details</Text>
            {selectedMarker && (
              <>
                <Text style={styles.modalText}>
                  Meter Number: {selectedMarker.meterNumber}
                </Text>
                <Text style={styles.modalText}>
                  Address: {selectedMarker.address}
                </Text>
                
                <View style={styles.modalButtonContainer}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.completeButton]}
                    onPress={() => markAsComplete(selectedMarker.id)}
                  >
                    <Text style={styles.modalButtonText}>Mark as Complete</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalButton, styles.closeButton]}
                    onPress={() => setShowDetails(false)}
                  >
                    <Text style={styles.modalButtonText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}

      {locationPermissionStatus === 'denied' && (
        <View style={styles.permissionWarning}>
          <Text style={styles.permissionText}>
            Location permission is required for navigation
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={checkLocationPermission}
          >
            <Text style={styles.retryButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* File Upload Modal */}
      <Modal
        visible={showUploadModal}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Upload Excel File</Text>
            <Text style={styles.modalText}>
              Please upload an Excel file containing meter locations to start route optimization.
            </Text>
            
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={[styles.modalButton, styles.uploadButton]}
                onPress={handleFileUpload}
              >
                <Text style={styles.modalButtonText}>Upload File</Text>
              </TouchableOpacity>

              {originalMarkers.length > 0 && (
                <TouchableOpacity
                  style={[styles.modalButton, styles.skipButton]}
                  onPress={() => setShowUploadModal(false)}
                >
                  <Text style={styles.modalButtonText}>Use Existing Data</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Missing Coordinates Modal */}
      <Modal
        visible={showMissingModal}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Missing Coordinates</Text>
            {missingCoordinates.length > 0 && currentMissingIndex < missingCoordinates.length && (
              <>
                <Text style={styles.modalText}>
                  Please enter coordinates for meter {missingCoordinates[currentMissingIndex].meterNumber}
                </Text>
                <Text style={styles.modalSubText}>
                  Address: {missingCoordinates[currentMissingIndex].address}
                </Text>
                <Text style={styles.modalProgress}>
                  {currentMissingIndex + 1} of {missingCoordinates.length}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter coordinates (Y,X) or MyLand URL"
                  placeholderTextColor="#9ca3af"
                  value={coordinateInput}
                  onChangeText={setCoordinateInput}
                />
                <View style={styles.modalButtonContainer}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.submitButton]}
                    onPress={handleMissingCoordinate}
                  >
                    <Text style={styles.modalButtonText}>Submit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.skipButton]}
                    onPress={() => {
                      if (currentMissingIndex < missingCoordinates.length - 1) {
                        setCurrentMissingIndex(prev => prev + 1);
                        setCoordinateInput('');
                      } else {
                        setShowMissingModal(false);
                        setMissingCoordinates([]);
                        setIsProcessingMissing(false);
                        setTimeout(() => {
                          optimizeRoute();
                        }, 500);
                      }
                    }}
                  >
                    <Text style={styles.modalButtonText}>Skip</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.modalButton, styles.skipAllButton]}
                  onPress={skipAllMissingCoordinates}
                >
                  <Text style={styles.modalButtonText}>Skip All</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Add recenter button */}
      {showRecenterButton && (
        <TouchableOpacity 
          style={[
            styles.recenterButton,
            isContinuousCentering && styles.recenterButtonActive
          ]}
          onPress={recenterMap}
        >
          <FontAwesome name="location-arrow" size={24} color="#ffffff" />
        </TouchableOpacity>
      )}

      {isRouteLoading && (
        <View style={styles.routeLoadingIndicator}>
          <ActivityIndicator size="small" color="#3b82f6" />
          <Text style={styles.routeLoadingText}>Finding route...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1f2937',
  },
  map: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  buttonContainer: {
    position: 'absolute',
    top: 20,
    right: 20,
    gap: 10,
  },
  button: {
    backgroundColor: '#3b82f6',
    padding: 15,
    borderRadius: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  stopButton: {
    backgroundColor: '#ef4444',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  markerCircle: {
    backgroundColor: '#ef4444',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: 30,
    maxHeight: 30,
    minWidth: 30,
    minHeight: 30,
  },
  completedMarker: {
    backgroundColor: '#10b981',
  },
  markerText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#1f2937',
    padding: 20,
    borderRadius: 10,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalText: {
    color: '#d1d5db',
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButtonContainer: {
    gap: 10,
  },
  modalButton: {
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  uploadButton: {
    backgroundColor: '#3b82f6',
  },
  skipButton: {
    backgroundColor: '#6b7280',
  },
  modalButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  completeButton: {
    backgroundColor: '#3b82f6',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    marginHorizontal: 15,
    alignItems: 'center',
  },
  completedButton: {
    backgroundColor: '#10b981',
  },
  completeButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  closeButton: {
    backgroundColor: '#6b7280',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionWarning: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  permissionText: {
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#ef4444',
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: '#374151',
    color: '#ffffff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
  },
  modalSubText: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 15,
  },
  submitButton: {
    backgroundColor: '#3b82f6',
  },
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(17, 24, 39, 0.95)',
    paddingTop: 50,
    paddingBottom: 15,
    zIndex: 1,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(75, 85, 99, 0.3)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  navigationArrows: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
  },
  arrowButton: {
    padding: 10,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    elevation: 3,
  },
  arrowText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  meterInfo: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
    backgroundColor: 'rgba(31, 41, 55, 0.8)',
    marginHorizontal: 10,
    padding: 8,
    borderRadius: 8,
  },
  progressText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  meterNumber: {
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  meterType: {
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  meterAddress: {
    color: '#d1d5db',
    fontSize: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  disabledButton: {
    backgroundColor: '#6b7280',
    opacity: 0.5,
  },
  selectedMarker: {
    borderColor: '#3b82f6',
    borderWidth: 3,
    transform: [{ scale: 1.2 }],
  },
  recenterButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: '#3b82f6',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  routeLoadingIndicator: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeLoadingText: {
    color: '#ffffff',
    marginLeft: 10,
    fontSize: 14,
  },
  modalProgress: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
  skipAllButton: {
    backgroundColor: '#ef4444',
    marginTop: 10,
  },
  recenterButtonActive: {
    backgroundColor: '#10b981', // Green to indicate active tracking
  },
}); 