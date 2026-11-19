import { getFirebaseAuth } from '../lib/firebase.js';

// Shows whether the Firebase client initialised from the environment. It makes no network call.
function checkFirebase() {
  try {
    return { state: 'configured', detail: getFirebaseAuth().app.options.projectId };
  } catch (err) {
    return { state: 'not configured', detail: err.message };
  }
}

export function FirebaseStatus() {
  const { state, detail } = checkFirebase();
  const ok = state === 'configured';
  return (
    <span
      title={detail}
      className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${ok ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}
    >
      Firebase: {state}
    </span>
  );
}
