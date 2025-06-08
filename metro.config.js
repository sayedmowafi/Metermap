const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add resolver options to exclude non-route files from being treated as routes
config.resolver.platforms = [...config.resolver.platforms, 'native', 'android', 'ios'];

module.exports = config;