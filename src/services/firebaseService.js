import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  query,
  where,
  doc,
  setDoc
} from 'firebase/firestore';
import Constants from 'expo-constants';

const firebaseConfig = {
  apiKey: Constants.expoConfig?.extra?.firebaseApiKey,
  authDomain: Constants.expoConfig?.extra?.firebaseAuthDomain,
  projectId: Constants.expoConfig?.extra?.firebaseProjectId,
  storageBucket: Constants.expoConfig?.extra?.firebaseStorageBucket,
  messagingSenderId: Constants.expoConfig?.extra?.firebaseMessagingSenderId,
  appId: Constants.expoConfig?.extra?.firebaseAppId,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export const loadSavedMeters = async () => {
  try {
    const metersCollection = collection(db, 'meters');
    const metersSnapshot = await getDocs(metersCollection);
    const metersList = metersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return metersList;
  } catch (error) {
    throw error;
  }
};

export const saveMeterToFirebase = async (meterData) => {
  try {
    const metersCollection = collection(db, 'meters');
    const docRef = await addDoc(metersCollection, {
      ...meterData,
      createdAt: new Date()
    });
    return docRef.id;
  } catch (error) {
    throw error;
  }
};

export const checkFirebaseForCoordinates = async (meterId) => {
  try {
    const metersCollection = collection(db, 'meters');
    const q = query(metersCollection, where("meterId", "==", meterId));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].data().coordinate;
    }
    return null;
  } catch (error) {
    return null;
  }
};
