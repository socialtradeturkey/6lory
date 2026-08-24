import { ENV } from "./_core/env";

const base64Url = /^[A-Za-z0-9_-]+$/;

export function getWebPushStatus() {
  const publicKey = ENV.vapidPublicKey.trim();
  const privateKey = ENV.vapidPrivateKey.trim();
  const subject = ENV.vapidSubject.trim();
  const validSubject = subject.startsWith("mailto:") || /^https:\/\//.test(subject);
  const configured = base64Url.test(publicKey) && publicKey.length >= 40 && base64Url.test(privateKey) && privateKey.length >= 40 && validSubject;
  return { configured, publicKey: configured ? publicKey : "", subject: configured ? subject : "" };
}

export function assertWebPushConfigured() {
  const status = getWebPushStatus();
  if (!status.configured) throw new Error("WEB_PUSH_VAPID_CONFIG_INVALID");
  return status;
}
