import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
};

const requiredConfig: Array<keyof typeof firebaseConfig> = ["apiKey", "authDomain", "projectId", "appId"];

export class FirebaseWebConfigError extends Error {
  public readonly code = "firebase/web-config-missing";

  public constructor(public readonly missing: string[]) {
    super(`Google sign-in is not configured in the browser. Missing: ${missing.join(", ")}.`);
    this.name = "FirebaseWebConfigError";
  }
}

export function getFirebaseWebConfigStatus() {
  const missing = requiredConfig.filter((key) => !firebaseConfig[key]);
  return { configured: missing.length === 0, missing };
}

function firebaseAuth(): Auth {
  const { configured, missing } = getFirebaseWebConfigStatus();
  if (!configured) throw new FirebaseWebConfigError(missing);

  const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
}

function provider() {
  const google = new GoogleAuthProvider();
  google.setCustomParameters({ prompt: "select_account" });
  return google;
}

async function userResult(user: User) {
  return { user, idToken: await user.getIdToken(true) };
}

export async function signInWithGoogle() {
  const auth = firebaseAuth();
  try {
    const result = await signInWithPopup(auth, provider());
    return userResult(result.user);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider());
      return null;
    }
    throw error;
  }
}

export async function completeGoogleRedirectSignIn() {
  const result = await getRedirectResult(firebaseAuth());
  return result ? userResult(result.user) : null;
}

export function googleAuthErrorMessage(error: unknown): string {
  if (error instanceof FirebaseWebConfigError) return error.message;
  const code = (error as { code?: string }).code || "";
  switch (code) {
    case "auth/unauthorized-domain":
      return `This site is not an authorized Firebase domain. Add ${window.location.hostname} in Firebase Console > Authentication > Settings > Authorized domains.`;
    case "auth/popup-closed-by-user":
      return "Google sign-in was cancelled. Try again when you are ready.";
    case "auth/popup-blocked":
      return "The browser blocked the Google sign-in window. Allow popups for this site and try again.";
    case "auth/invalid-api-key":
      return "The Firebase web API key is invalid. Copy the Web App configuration from Firebase Console again.";
    case "auth/operation-not-allowed":
      return "Google sign-in is disabled for this Firebase project. Enable Google in Firebase Console > Authentication > Sign-in method.";
    case "auth/account-exists-with-different-credential":
      return "An account already exists with this email. Sign in with the existing provider, then link Google from account settings.";
    case "auth/network-request-failed":
      return "Firebase could not reach Google. Check the browser connection, ad blocker, proxy, and firewall, then try again.";
    case "auth/invalid-credential":
      return "Google returned an invalid sign-in credential. Start the sign-in flow again.";
    default:
      return error instanceof Error && error.message ? error.message : "Google sign-in failed before the account could be verified.";
  }
}
