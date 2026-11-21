import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * next/link with viewport prefetch OFF by default.
 *
 * Every page here is force-dynamic, so a prefetch is a real Vercel Function
 * invocation, not a CDN hit. With the default (prefetch every <Link> that
 * scrolls into view), one view of a classroom article fired 15-30 extra
 * invocations for its side nav, and the headless-Chrome scrapers hitting this
 * site (Tencent / Huawei Cloud ASNs) multiplied that on every page they
 * loaded: in a sampled hour, 141 of 192 requests were prefetches nobody
 * clicked. Pass prefetch explicitly on a link that should keep it.
 */
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
