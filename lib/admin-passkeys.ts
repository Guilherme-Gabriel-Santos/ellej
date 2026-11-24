import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { issueAdminSession, writeAudit, type AdminSession } from "./admin-auth";
import { ensureStoreSchema, getD1 } from "./store";

const challengeLifetimeMs = 5 * 60 * 1000;
const supportedAlgorithmIDs = [-7, -257] as const;

type PasskeyRow = {
  credential_id: string;
  user_id: string;
  public_key: string;
  webauthn_user_id: string;
  counter: number;
  device_type: string;
  backed_up: number;
  transports: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
};

type ChallengeRow = {
  id: string;
  user_id: string | null;
  kind: string;
  challenge: string;
  webauthn_user_id: string | null;
  origin: string;
  rp_id: string;
  expires_at: number;
  attempts: number;
  consumed_at: number | null;
};

function webAuthnContext(request: Request) {
  const url = new URL(request.url);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !local) {
    throw new Error("O Face ID só funciona em uma conexão HTTPS segura.");
  }
  return { origin: url.origin, rpID: url.hostname };
}

function bytesToBase64Url(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parseTransports(value: string): AuthenticatorTransportFuture[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function passkeyLabel(value: unknown) {
  const label = Array.from(String(value ?? "Face ID deste aparelho"), (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : character;
  }).join("").trim().slice(0, 80);
  return label || "Face ID deste aparelho";
}

function credentialResponse<T extends { id: string }>(value: unknown) {
  if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string" || !value.id) {
    throw new Error("A resposta do Face ID não é válida.");
  }
  return value as T;
}

async function saveChallenge(
  kind: "registration" | "authentication",
  options: { challenge: string; userID?: string },
  context: { origin: string; rpID: string },
  userId: string | null,
) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const d1 = getD1();
  await d1.batch([
    d1.prepare("DELETE FROM admin_passkey_challenges WHERE expires_at < ? OR consumed_at IS NOT NULL").bind(now),
    d1.prepare("INSERT INTO admin_passkey_challenges (id, user_id, kind, challenge, webauthn_user_id, origin, rp_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, userId, kind, options.challenge, options.userID ?? null, context.origin, context.rpID, now + challengeLifetimeMs),
  ]);
  return id;
}

async function getChallenge(challengeId: string, kind: ChallengeRow["kind"]) {
  const row = await getD1()
    .prepare("SELECT id, user_id, kind, challenge, webauthn_user_id, origin, rp_id, expires_at, attempts, consumed_at FROM admin_passkey_challenges WHERE id = ? AND kind = ?")
    .bind(challengeId, kind)
    .first<ChallengeRow>();
  if (!row || row.consumed_at || Number(row.expires_at) < Date.now()) {
    throw new Error("Essa confirmação expirou. Inicie o Face ID novamente.");
  }
  if (Number(row.attempts) >= 5) throw new Error("Limite de tentativas atingido. Inicie o Face ID novamente.");
  return row;
}

async function failChallenge(challengeId: string) {
  await getD1().prepare("UPDATE admin_passkey_challenges SET attempts = attempts + 1 WHERE id = ?").bind(challengeId).run();
}

export async function hasAdminPasskeys() {
  await ensureStoreSchema();
  const row = await getD1().prepare("SELECT COUNT(*) AS total FROM admin_passkeys").first<{ total: number }>();
  return Number(row?.total ?? 0) > 0;
}

export async function listAdminPasskeys(userId: string) {
  await ensureStoreSchema();
  const result = await getD1()
    .prepare("SELECT credential_id, label, device_type, backed_up, created_at, last_used_at FROM admin_passkeys WHERE user_id = ? ORDER BY created_at DESC")
    .bind(userId)
    .all<Pick<PasskeyRow, "credential_id" | "label" | "device_type" | "backed_up" | "created_at" | "last_used_at">>();
  return result.results.map((row) => ({
    id: row.credential_id,
    label: row.label,
    deviceType: row.device_type,
    backedUp: Boolean(Number(row.backed_up)),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}

export async function beginPasskeyRegistration(request: Request, session: AdminSession) {
  await ensureStoreSchema();
  const context = webAuthnContext(request);
  const existing = await getD1()
    .prepare("SELECT credential_id, transports FROM admin_passkeys WHERE user_id = ?")
    .bind(session.userId)
    .all<Pick<PasskeyRow, "credential_id" | "transports">>();
  const options = await generateRegistrationOptions({
    rpName: "Elle Jew Admin",
    rpID: context.rpID,
    userName: session.email,
    userDisplayName: session.email,
    userID: new TextEncoder().encode(session.userId),
    attestationType: "none",
    timeout: 60_000,
    supportedAlgorithmIDs: [...supportedAlgorithmIDs],
    excludeCredentials: existing.results.map((row) => ({ id: row.credential_id, transports: parseTransports(row.transports) })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    preferredAuthenticatorType: "localDevice",
  });
  const challengeId = await saveChallenge("registration", { challenge: options.challenge, userID: options.user.id }, context, session.userId);
  return { challengeId, options };
}

export async function finishPasskeyRegistration(
  request: Request,
  session: AdminSession,
  challengeId: string,
  responseValue: unknown,
  labelValue: unknown,
) {
  const context = webAuthnContext(request);
  const challenge = await getChallenge(challengeId, "registration");
  if (challenge.user_id !== session.userId || challenge.origin !== context.origin || challenge.rp_id !== context.rpID) {
    throw new Error("Essa confirmação não pertence a esta sessão.");
  }
  const response = credentialResponse<RegistrationResponseJSON>(responseValue);
  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rp_id,
      requireUserVerification: true,
      supportedAlgorithmIDs: [...supportedAlgorithmIDs],
    });
    if (!verification.verified) throw new Error("Unverified passkey registration");
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const d1 = getD1();
    await d1.batch([
      d1.prepare("INSERT INTO admin_passkeys (credential_id, user_id, public_key, webauthn_user_id, counter, device_type, backed_up, transports, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(
          credential.id,
          session.userId,
          bytesToBase64Url(credential.publicKey),
          challenge.webauthn_user_id ?? "",
          credential.counter,
          credentialDeviceType,
          credentialBackedUp ? 1 : 0,
          JSON.stringify(credential.transports ?? []),
          passkeyLabel(labelValue),
        ),
      d1.prepare("UPDATE admin_passkey_challenges SET consumed_at = ? WHERE id = ?").bind(Date.now(), challenge.id),
    ]);
    await writeAudit(session.userId, "admin.passkey_registered", "admin_passkey", credential.id, { deviceType: credentialDeviceType });
    return listAdminPasskeys(session.userId);
  } catch (error) {
    await failChallenge(challenge.id);
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      throw new Error("Este Face ID já está cadastrado no painel.");
    }
    throw new Error("Não foi possível confirmar o Face ID. Tente novamente.");
  }
}

export async function beginPasskeyLogin(request: Request) {
  await ensureStoreSchema();
  if (!(await hasAdminPasskeys())) throw new Error("O Face ID ainda não foi ativado neste painel.");
  const context = webAuthnContext(request);
  const options = await generateAuthenticationOptions({
    rpID: context.rpID,
    timeout: 60_000,
    userVerification: "required",
  });
  const challengeId = await saveChallenge("authentication", { challenge: options.challenge }, context, null);
  return { challengeId, options };
}

export async function finishPasskeyLogin(request: Request, challengeId: string, responseValue: unknown) {
  const context = webAuthnContext(request);
  const challenge = await getChallenge(challengeId, "authentication");
  if (challenge.origin !== context.origin || challenge.rp_id !== context.rpID) {
    throw new Error("Essa confirmação foi iniciada em outro endereço.");
  }
  const response = credentialResponse<AuthenticationResponseJSON>(responseValue);
  const passkey = await getD1()
    .prepare("SELECT p.credential_id, p.user_id, p.public_key, p.webauthn_user_id, p.counter, p.device_type, p.backed_up, p.transports, p.label, p.created_at, p.last_used_at, u.email FROM admin_passkeys p INNER JOIN admin_users u ON u.id = p.user_id WHERE p.credential_id = ?")
    .bind(response.id)
    .first<PasskeyRow & { email: string }>();
  if (!passkey) {
    await failChallenge(challenge.id);
    throw new Error("Este Face ID não está cadastrado no painel.");
  }
  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rp_id,
      requireUserVerification: true,
      credential: {
        id: passkey.credential_id,
        publicKey: base64UrlToBytes(passkey.public_key),
        counter: Number(passkey.counter),
        transports: parseTransports(passkey.transports),
      },
    });
    if (!verification.verified) throw new Error("Unverified passkey authentication");
    await getD1().batch([
      getD1().prepare("UPDATE admin_passkeys SET counter = ?, last_used_at = CURRENT_TIMESTAMP WHERE credential_id = ?").bind(verification.authenticationInfo.newCounter, passkey.credential_id),
      getD1().prepare("UPDATE admin_passkey_challenges SET consumed_at = ? WHERE id = ?").bind(Date.now(), challenge.id),
    ]);
    return issueAdminSession(passkey.user_id, passkey.email, "admin.login.passkey");
  } catch {
    await failChallenge(challenge.id);
    throw new Error("O Face ID não pôde ser confirmado. Tente novamente.");
  }
}

export async function deleteAdminPasskey(session: AdminSession, credentialId: string) {
  const result = await getD1().prepare("DELETE FROM admin_passkeys WHERE credential_id = ? AND user_id = ?").bind(credentialId, session.userId).run();
  if (!result.success) throw new Error("Não foi possível remover este Face ID.");
  await writeAudit(session.userId, "admin.passkey_deleted", "admin_passkey", credentialId);
  return listAdminPasskeys(session.userId);
}
