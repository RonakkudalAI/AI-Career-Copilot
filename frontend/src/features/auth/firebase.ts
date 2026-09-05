import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  getRedirectResult,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  signInWithPopup,
  signInWithRedirect,
  type ActionCodeSettings,
  type Auth,
  type User,
} from "firebase/auth";
import { authCallbackUrl } from "@/features/auth/public-origin";

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
    super(`Firebase authentication is not configured in the browser. Missing: ${missing.join(", ")}.`);
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

  const existing = getApps().length > 0;
  const app: FirebaseApp = existing ? getApp() : initializeApp(firebaseConfig);
  // Avoid Firebase Auth's IndexedDB persistence path. Browsers can close the
  // IndexedDB connection while a sign-in request is in flight, producing the
  // user-facing "database is closing" error. The app JWT remains persisted by
  // the API client; Firebase only needs a durable browser/session persistence
  // fallback for its identity session.
  if (!existing) {
    return initializeAuth(app, {
      persistence: [browserLocalPersistence, browserSessionPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  }
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

export async function signInWithEmailPassword(email: string, password: string) {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) {
    const error = new Error("Enter your email address.") as Error & { code?: string };
    error.code = "auth/invalid-email";
    throw error;
  }
  if (!password) {
    const error = new Error("Enter your password.") as Error & { code?: string };
    error.code = "auth/argument-error";
    throw error;
  }
  const result = await signInWithEmailAndPassword(firebaseAuth(), normalizedEmail, password);
  return userResult(result.user);
}

function verificationActionCode(): ActionCodeSettings {
  return {
    url: authCallbackUrl("/onboarding"),
    handleCodeInApp: false,
  };
}

export async function signUpWithEmailPassword(email: string, password: string, fullName: string) {
  const result = await createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password);
  const name = fullName.trim();
  if (name) await updateProfile(result.user, { displayName: name });
  await sendEmailVerification(result.user, verificationActionCode());
  return result.user;
}

export async function resendEmailVerification(expectedEmail: string) {
  const user = firebaseAuth().currentUser;
  if (!user || user.email?.trim().toLowerCase() !== expectedEmail.trim().toLowerCase()) {
    throw new Error("Start signing in with this email address before requesting another verification email.");
  }
  await sendEmailVerification(user, verificationActionCode());
}

export async function signOutFromFirebase() {
  const auth = firebaseAuth();
  if (auth.currentUser) await firebaseSignOut(auth);
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
    case "auth/argument-error":
      return "Google sign-in received an invalid request. Start the sign-in flow again.";
    default:
      return error instanceof Error && error.message ? error.message : "Google sign-in failed before the account could be verified.";
  }
}

export function emailPasswordAuthErrorMessage(error: unknown): string {
  if (error instanceof FirebaseWebConfigError) return error.message;
  const code = (error as { code?: string }).code || "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "The email or password is incorrect.";
    case "auth/email-already-in-use":
      return "An account with this email already exists. Sign in instead.";
    case "auth/weak-password":
      return "Choose a password with at least 8 characters.";
    case "auth/operation-not-allowed":
      return "Email/password sign-in is disabled for this Firebase project. Enable it in Firebase Console > Authentication > Sign-in method.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/network-request-failed":
      return "Firebase could not be reached. Check your connection, proxy, or firewall, then try again.";
    case "auth/too-many-requests":
      return "Too many sign-in attempts. Wait a moment and try again.";
    case "auth/argument-error":
      return "Enter both your email address and password.";
    default:
      return error instanceof Error && error.message ? error.message : "Email/password sign-in failed before the account could be verified.";
  }
}
