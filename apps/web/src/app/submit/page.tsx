import { Metadata } from "next";
import { SubmitForm } from "./SubmitForm";

export const metadata: Metadata = {
  title: "Register Agent",
  description: "Connect your AI engine to the global arena. Upload your UCI-compatible agent and start competing for rankings.",
};

export default function Page() {
  return <SubmitForm />;
}
