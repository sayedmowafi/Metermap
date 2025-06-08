import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MapScreen from './app/screens/MapScreen';
import MeterReading from './app/screens/MeterReading';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarStyle: {
            backgroundColor: '#1f2937',
            borderTopColor: '#374151',
          },
          tabBarActiveTintColor: '#3b82f6',
          tabBarInactiveTintColor: '#9ca3af',
          headerStyle: {
            backgroundColor: '#1f2937',
          },
          headerTintColor: '#ffffff',
        }}
      >
        <Tab.Screen 
          name="Map View" 
          component={MapScreen}
        />
        <Tab.Screen 
          name="Meter Reading" 
          component={MeterReading}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
} 