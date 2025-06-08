import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

export default function RouteList({ route, currentIndex, onItemPress }) {
  return (
    <ScrollView
      style={styles.container}
      horizontal={true}
      showsHorizontalScrollIndicator={false}
    >
      {route.map((item, index) => (
        <TouchableOpacity
          key={item.id}
          style={[
            styles.item,
            currentIndex === index && styles.currentItem
          ]}
          onPress={() => onItemPress(index)}
        >
          <Text style={styles.text}>
            {item.meterNumber}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
  },
  item: {
    backgroundColor: '#1f2937',
    padding: 10,
    margin: 5,
    borderRadius: 5,
    minWidth: 100,
    alignItems: 'center',
  },
  currentItem: {
    backgroundColor: '#3b82f6',
  },
  text: {
    color: '#ffffff',
  },
}); 