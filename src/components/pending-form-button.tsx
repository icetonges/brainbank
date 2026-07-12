"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that swaps to `pendingLabel` and disables itself while
 * its enclosing <form action={...}> is running — used for the classroom
 * article page's Regenerate/Translate buttons, which call slow AI actions
 * and previously gave no feedback while running (looked like a frozen
 * page). Must be rendered inside a <form>; relies on useFormStatus, so it
 * has to be its own client component (the form itself stays a plain
 * server-rendered <form action={serverAction}>).
 */
export function PendingFormButton({
  label,
  pendingLabel,
  className,
}: {
  label: string;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending && (
        <span
          aria-hidden
          className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]"
        />
      )}
      {pending ? pendingLabel : label}
    </button>
  );
}
