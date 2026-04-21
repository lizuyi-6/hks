import { cookies } from "next/headers";

export const authCookieName = "a1plus-session";

export async function getSessionToken() {
  return (await cookies()).get(authCookieName)?.value;
}

export async function isAuthenticated() {
  return Boolean(await getSessionToken());
}

