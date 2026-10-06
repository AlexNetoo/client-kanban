import type { ReactNode } from "react";
import { splitLinks } from "./lib/links";

/** Turns URLs in user text into plain links that open in a new tab. Text is rendered as text, never as HTML. */
export function Linkify({ text }: { text: string }): ReactNode {
  return <>{splitLinks(text).map((part, i) => typeof part === "string" ? part
    : <a key={i} href={part.url} target="_blank" rel="noopener noreferrer nofollow" style={{ textDecoration: "underline", textUnderlineOffset: 3, overflowWrap: "anywhere" }}>{part.url}</a>)}</>;
}
