import { redirect } from "next/navigation";

/** Compatibility address: experience evaluation is retired. */
export default function WelcomePage() { redirect("/initiatives/new"); }
