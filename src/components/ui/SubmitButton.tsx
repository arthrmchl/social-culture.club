"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./Button";

export function SubmitButton({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? "…" : children}
    </Button>
  );
}
