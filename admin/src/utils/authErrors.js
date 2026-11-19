/**
 * Maps Firebase Auth errors to messages that help the user without revealing which credential was wrong.
 * `runtime` = `{ useEmulators, authEmulatorUrl }` lets a connection failure name the real target, because
 * "network error" is useless when the cause is a local emulator that is not running.
 */
export function friendlyAuthError(error, runtime) {
  switch (error?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
    case 'auth/missing-password':
      return 'Invalid email or password.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact the platform operator.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return runtime?.useEmulators
        ? emulatorUnreachableMessage(runtime.authEmulatorUrl)
        : 'Network error. Check your internet connection and try again.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}

export const emulatorUnreachableMessage = (url) =>
  `Cannot reach the Firebase Auth emulator at ${url}. Start it with "npm run emulators" in the backend folder (it needs Java 21+), then try again.`;
