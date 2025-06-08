import React, { useState, useRef } from 'react';
import { 
  View, 
  StyleSheet, 
  Dimensions, 
  TouchableOpacity, 
  Text, 
  Alert,
  Modal,
  TextInput,
  ActivityIndicator
} from 'react-native';
import MapView, { Marker, Callout, PROVIDER_DEFAULT } from 'react-native-maps';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import * as XLSX from 'xlsx';
import { convertCoordinates, extractCoordinatesFromInput } from '../../src/utils/coordinateConverter';

export default function MapScreen() {
  const [markers, setMarkers] = useState([]);
  const [missingCoordinates, setMissingCoordinates] = useState([]);
  const [currentMissingIndex, setCurrentMissingIndex] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [coordinates, setCoordinates] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const mapRef = useRef(null);

  // Al Ain coordinates
  const INITIAL_REGION = {
    latitude: 24.1302,
    longitude: 55.7458,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is needed.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const newLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };

      setCurrentLocation(newLocation);
      mapRef.current?.animateToRegion(newLocation);
    } catch (error) {
      Alert.alert('Error', 'Failed to get current location');
    }
  };

  const handleFileUpload = async () => {
    try {
      setIsLoading(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        copyToCacheDirectory: true
      });

      if (result.canceled) {
        setIsLoading(false);
        return;
      }

      const { uri } = result.assets[0];
      const content = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64
      });

      const workbook = XLSX.read(content, { type: 'base64' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      let jsonData = XLSX.utils.sheet_to_json(worksheet);
      jsonData = jsonData.slice(0, -1);

      processExcelData(jsonData);
    } catch (error) {
      Alert.alert('Error', 'Failed to read file. Make sure it is an Excel file.');
    } finally {
      setIsLoading(false);
    }
  };

  const processExcelData = (jsonData) => {
    const newMarkers = [];
    const newMissingCoordinates = [];

    jsonData.forEach((row, index) => {
      if (row.X && row.Y) {
        const coords = convertCoordinates(row.X, row.Y);
        if (coords.latitude && coords.longitude) {
          newMarkers.push({
            id: index.toString(),
            coordinate: coords,
            meterNumber: row['رقم اللاصق'],
            address: row['عنوان القسيمه'],
            status: 'pending' // pending, completed, or skipped
          });
        }
      } else {
        newMissingCoordinates.push({
          id: index.toString(),
          meterNumber: row['رقم اللاصق'],
          address: row['عنوان القسيمه']
        });
      }
    });

    setMarkers(newMarkers);
    setMissingCoordinates(newMissingCoordinates);
    
    if (newMissingCoordinates.length > 0) {
      setCurrentMissingIndex(0);
      setShowModal(true);
    }

    // Fit map to show all markers
    if (newMarkers.length > 0) {
      fitMapToMarkers(newMarkers);
    }
  };

  const fitMapToMarkers = (markersToFit) => {
    if (markersToFit.length === 0) return;

    const coordinates = markersToFit.map(marker => ({
      latitude: marker.coordinate.latitude,
      longitude: marker.coordinate.longitude,
    }));

    mapRef.current?.fitToCoordinates(coordinates, {
      edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
      animated: true,
    });
  };

  const handleAddCoordinates = () => {
    if (!coordinates) {
      Alert.alert('Error', 'Please enter coordinates or MyLand URL');
      return;
    }

    const coords = extractCoordinatesFromInput(coordinates);
    if (!coords) {
      Alert.alert('Error', 'Invalid format. Please enter either:\n\n1. Y,X coordinates\n2. MyLand URL');
      return;
    }

    const currentMissing = missingCoordinates[currentMissingIndex];
    const newMarker = {
      id: `manual-${currentMissingIndex}`,
      coordinate: coords,
      meterNumber: currentMissing.meterNumber,
      address: currentMissing.address,
      status: 'pending'
    };

    setMarkers(prev => [...prev, newMarker]);
    setCoordinates('');
    
    const newMissing = missingCoordinates.filter((_, index) => index !== currentMissingIndex);
    setMissingCoordinates(newMissing);

    if (newMissing.length === 0) {
      setShowModal(false);
    } else if (currentMissingIndex >= newMissing.length) {
      setCurrentMissingIndex(newMissing.length - 1);
    }

    // Center map on new marker
    mapRef.current?.animateToRegion({
      ...coords,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={INITIAL_REGION}
        mapType="satellite"
      >
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={marker.coordinate}
            pinColor={marker.status === 'completed' ? 'green' : 'red'}
          >
            <View style={[
              styles.markerCircle,
              marker.status === 'completed' && styles.completedMarker
            ]} />
            <Callout tooltip>
              <View style={styles.calloutContainer}>
                <Text style={styles.calloutTitle}>Meter Details</Text>
                <Text style={styles.calloutText}>Meter: {marker.meterNumber}</Text>
                <Text style={styles.calloutText}>Address: {marker.address}</Text>
                <Text style={styles.calloutText}>
                  Status: {marker.status.charAt(0).toUpperCase() + marker.status.slice(1)}
                </Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      <View style={styles.buttonContainer}>


        <TouchableOpacity
          style={styles.button}
          onPress={handleFileUpload}
        >
          <Text style={styles.buttonText}>Upload Excel</Text>
        </TouchableOpacity>
      </View>

      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}

      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Missing Coordinates</Text>
            {missingCoordinates.length > 0 && (
              <>
                <Text style={styles.meterText}>
                  Meter: {missingCoordinates[currentMissingIndex]?.meterNumber}
                </Text>
                <Text style={styles.addressText}>
                  Address: {missingCoordinates[currentMissingIndex]?.address}
                </Text>
                
                <TextInput
                  style={styles.input}
                  placeholder="Enter coordinates (Y,X) or MyLand URL"
                  placeholderTextColor="#666"
                  value={coordinates}
                  onChangeText={setCoordinates}
                  multiline
                />

                <View style={styles.modalButtonContainer}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.addButton]}
                    onPress={handleAddCoordinates}
                  >
                    <Text style={styles.modalButtonText}>Add</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalButton, styles.skipButton]}
                    onPress={() => {
                      const newMissing = missingCoordinates.filter((_, index) => index !== currentMissingIndex);
                      setMissingCoordinates(newMissing);
                      if (newMissing.length === 0) setShowModal(false);
                    }}
                  >
                    <Text style={styles.modalButtonText}>Skip</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.counter}>
                  {currentMissingIndex + 1} of {missingCoordinates.length}
                </Text>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  markerCircle: {
    backgroundColor: '#ef4444',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  completedMarker: {
    backgroundColor: '#10b981',
  },
  calloutContainer: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    padding: 12,
    width: 200,
  },
  calloutTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  calloutText: {
    color: '#d1d5db',
    fontSize: 14,
    marginBottom: 4,
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
  meterText: {
    fontSize: 16,
    color: '#ffffff',
    marginBottom: 8,
  },
  addressText: {
    fontSize: 14,
    color: '#d1d5db',
    marginBottom: 15,
  },
  input: {
    backgroundColor: '#374151',
    borderRadius: 8,
    padding: 12,
    color: '#ffffff',
    marginBottom: 15,
    minHeight: 80,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButton: {
    backgroundColor: '#3b82f6',
  },
  skipButton: {
    backgroundColor: '#6b7280',
  },
  modalButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  counter: {
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 15,
  },
}); 