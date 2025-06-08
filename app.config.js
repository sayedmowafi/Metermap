import 'dotenv/config';

export default {
  expo: {
    name: "Metermap",
    slug: "metermap",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "metermap",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: false,
      infoPlist: {
        UIBackgroundModes: ["location", "fetch"],
        NSLocationWhenInUseUsageDescription: "This app needs access to location when open to show your position on the map.",
        NSLocationAlwaysAndWhenInUseUsageDescription: "This app needs access to location when in the background for navigation.",
        NSSpeechRecognitionUsageDescription: "This app requires access to speech recognition for voice input features.",
        NSPhotoLibraryUsageDescription: "This app needs access to your photo library to select and upload documents.",
        NSMicrophoneUsageDescription: "This app requires access to the microphone for voice input features.",
        ITSAppUsesNonExemptEncryption: false
      },
      bundleIdentifier: "com.exotix.metermap"
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION"
      ],
      package: "com.exotix.metermap"
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff"
        }
      ],
      [
        "@rnmapbox/maps",
        {
          mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN
        }
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission: "Allow Metermap to use your location."
        }
      ],
      "expo-web-browser"
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      router: {},
      eas: {
        projectId: "6672503e-cd57-422f-8239-d011b8059443"
      },
      firebaseApiKey: process.env.FIREBASE_API_KEY,
      firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN,
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
      firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      firebaseAppId: process.env.FIREBASE_APP_ID,
      openrouteApiKey: process.env.OPENROUTE_API_KEY
    }
  }
};
