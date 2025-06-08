import { Tabs } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { MarkerProvider } from '../../src/context/MarkerContext';

export default function TabLayout() {
  return (
    <MarkerProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#3b82f6',
          tabBarInactiveTintColor: '#6b7280',
          tabBarStyle: {
            backgroundColor: '#1f2937',
            borderTopColor: '#374151',
          },
          headerStyle: {
            backgroundColor: '#1f2937',
          },
          headerTintColor: '#ffffff',
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Map View',
            tabBarIcon: ({ color }) => (
              <FontAwesome name="map" size={24} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="meter-reading"
          options={{
            title: 'Meter Reading',
            tabBarIcon: ({ color }) => (
              <FontAwesome name="list" size={24} color={color} />
            ),
            headerShown: false,
          }}
        />
      </Tabs>
    </MarkerProvider>
  );
} 