/** Maps Firebase Auth errors to messages that help without revealing which credential was wrong. */
export function friendlyAuthError(error, runtime, mode = 'login') {
  switch (error?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/missing-password':
      return 'Invalid email or password.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/weak-password':
      return 'Choose a stronger password (at least 8 characters).';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return runtime?.useEmulators
        ? `Cannot reach the Firebase Auth emulator at ${runtime.authEmulatorUrl}. Start it with "npm run emulators" in the backend folder (it needs Java 21+), then try again.`
        : 'Network error. Check your internet connection and try again.';
    default:
      return mode === 'register' ? 'Could not create your account. Please try again.' : 'Sign-in failed. Please try again.';
  }
}
