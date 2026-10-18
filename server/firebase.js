import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase as firebaseGetDatabase } from 'firebase-admin/database';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error('Missing required environment variable: ' + name);
  return value;
}
export function getDatabase() {
  if (!getApps().length) {
    const privateKey = required('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n');
    initializeApp({
      credential: cert({
        projectId: required('FIREBASE_PROJECT_ID'),
        clientEmail: required('FIREBASE_CLIENT_EMAIL'),
        privateKey
      }),
      databaseURL: required('FIREBASE_DATABASE_URL')
    });
  }
  return firebaseGetDatabase();
}