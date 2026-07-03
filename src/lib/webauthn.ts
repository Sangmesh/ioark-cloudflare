// WebAuthn (passkey) ceremonies. The server (py_webauthn) returns options with
// base64url-encoded binary fields; the browser API needs ArrayBuffers, and the
// resulting credential must be re-encoded to base64url for the server to verify.
import { api } from "./api";

function b64urlToBuf(s: string): ArrayBuffer {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function webauthnSupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

/** Register this physical device's platform authenticator (first time here). */
export async function registerThisDevice() {
  const options: any = await api.webauthnRegisterBegin();
  const publicKey: any = {
    ...options,
    challenge: b64urlToBuf(options.challenge),
    user: { ...options.user, id: b64urlToBuf(options.user.id) },
    excludeCredentials: (options.excludeCredentials || []).map((c: any) => ({
      ...c, id: b64urlToBuf(c.id),
    })),
  };
  const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
  const att = cred.response as AuthenticatorAttestationResponse;
  return api.webauthnRegisterComplete({
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    response: {
      clientDataJSON: bufToB64url(att.clientDataJSON),
      attestationObject: bufToB64url(att.attestationObject),
      transports: att.getTransports ? att.getTransports() : [],
    },
    clientExtensionResults: cred.getClientExtensionResults(),
    authenticatorAttachment: (cred as any).authenticatorAttachment || undefined,
  });
}

/** Prove this is the same device by signing a challenge with its stored key. */
export async function verifyThisDevice() {
  const options: any = await api.webauthnAuthBegin();
  const publicKey: any = {
    ...options,
    challenge: b64urlToBuf(options.challenge),
    allowCredentials: (options.allowCredentials || []).map((c: any) => ({
      ...c, id: b64urlToBuf(c.id),
    })),
  };
  const cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
  const asr = cred.response as AuthenticatorAssertionResponse;
  const response: any = {
    clientDataJSON: bufToB64url(asr.clientDataJSON),
    authenticatorData: bufToB64url(asr.authenticatorData),
    signature: bufToB64url(asr.signature),
  };
  if (asr.userHandle) response.userHandle = bufToB64url(asr.userHandle);
  return api.webauthnAuthComplete({
    id: cred.id,
    rawId: bufToB64url(cred.rawId),
    type: cred.type,
    response,
    clientExtensionResults: cred.getClientExtensionResults(),
    authenticatorAttachment: (cred as any).authenticatorAttachment || undefined,
  });
}
