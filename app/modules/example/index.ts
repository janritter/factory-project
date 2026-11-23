import { greetingFor } from "./lib/impl";

/** Public entry point for the example package. */
export function greet(name: string): string {
  return greetingFor(name);
}
