// =====================================================================
// FIREBASE CONFIG — fill this in with YOUR project's details
// =====================================================================
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project (free) — name it anything, e.g. "study-garden"
// 3. Click the </> (web) icon to register a new web app
// 4. Firebase will give you a config object like the one below — paste
//    your real values in here (replacing the placeholders)
// 5. In the left sidebar, go to "Build" -> "Firestore Database" -> "Create database"
//    - Choose "Start in test mode" (fine for a small private friend group)
//    - Pick any region close to you
// 6. Save this file and re-upload it alongside the rest of the app.
//    That's it — sync will work automatically!
// =====================================================================

const firebaseConfig = {
  apiKey: "AIzaSyBKz1nbXeoq6O_v2CT2q5qJ8tmB4OBbOok",
  authDomain: "study-84c31.firebaseapp.com",
  projectId: "study-84c31",
  storageBucket: "study-84c31.firebasestorage.app",
  messagingSenderId: "717904726754",
  appId: "1:717904726754:web:55065564bde462b1862cbb"
};

// A shared "room" name so all of you read/write the same documents.
// Change this to something unique (e.g. your class code) if you want
// to avoid clashing with anyone else who might use this same setup.
const SYNC_ROOM_ID = "civil-eng-class-2026";
