import type { RequestEvent, Handle } from "@sveltejs/kit";

import { negotiateLanguagePreferences } from "@inlang/paraglide-js/internal/adapter-utils";
import {
  availableLanguageTags,
  type AvailableLanguageTag,
  isAvailableLanguageTag,
  sourceLanguageTag,
  setLanguageTag
} from "$paraglide/runtime";
import type { User } from "lucia";

declare global {
  /* eslint-disable @typescript-eslint/no-namespace */
  namespace App {
    interface Locals {
      lang: AvailableLanguageTag;
    }
  }
  /* eslint-enable @typescript-eslint/no-namespace */
}

export const LANG_COOKIE_NAME = "paraglide:lang";

export function validLanguageTag(s: string | null | undefined): AvailableLanguageTag | undefined {
  if (!s) return undefined;
  if (isAvailableLanguageTag(s)) return s;
  return undefined;
}

const getLangKey = (user: User) => `paraglide:lang:${user.id}`;

export async function getUserLanguage(event: RequestEvent) {
  const user = event.locals.user;
  if (!user) return undefined;

  const value = await event.platform?.env.KV.get(getLangKey(user), "text");
  if (!value) return undefined;
  return validLanguageTag(value);
}

export function setUserLanguage(event: RequestEvent, lang: AvailableLanguageTag) {
  const user = event.locals.user;
  if (!user) return;

  event.platform?.context.waitUntil(event.platform.env.KV.put(getLangKey(user), lang));
}

export const handle = (async ({ event, resolve }) => {
  const queryLang = validLanguageTag(event.url.searchParams.get("lang"));

  const cookieLang = validLanguageTag(event.cookies.get(LANG_COOKIE_NAME));

  const negotiatedLanguagePreferences = negotiateLanguagePreferences(
    event.request.headers.get("accept-language"),
    availableLanguageTags
  );

  const negotiatedLang = negotiatedLanguagePreferences[0];

  const userLang = await getUserLanguage(event);

  const lang = queryLang ?? userLang ?? cookieLang ?? negotiatedLang ?? sourceLanguageTag;

  if (lang !== cookieLang) {
    event.cookies.set(LANG_COOKIE_NAME, lang, {
      maxAge: 31557600, //Math.round(60 * 60 * 24 * 365.25) = 1 year,
      sameSite: "lax",
      path: "/",
      httpOnly: false
    });
  }

  if (lang !== userLang) setUserLanguage(event, lang);

  setLanguageTag(lang);
  event.locals.lang = lang;

  return resolve(event, {
    transformPageChunk({ done, html }) {
      if (!done) return html;
      return html.replace("%paraglide.lang%", lang);
    }
  });
}) satisfies Handle;
