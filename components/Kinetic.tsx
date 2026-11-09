import { Fragment } from "react";

/** Each word rises into place. Done in CSS, so it plays before any script loads and the text is there without scripts. */
export function Kinetic({ text, start = 0 }: { text: string; start?: number }) {
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.split(" ").map((w, i) => (
          <Fragment key={`${w}-${i}`}>
            <span className="word"><span style={{ animationDelay: `${start + i * 45}ms` }}>{w}</span></span>{" "}
          </Fragment>
        ))}
      </span>
    </>
  );
}
