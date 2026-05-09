import type { Metadata } from "next";
import { MrRassyRadioApp } from "../../../components/MrRassyRadioApp";

export const metadata: Metadata = {
  title: "Mr Rassy Radio App",
  description:
    "A phone-sized live view of Mr Rassy Radio, with the stream, booth notes, and the next move in the set.",
};

export default function MrRassyRadioAppPage() {
  return <MrRassyRadioApp />;
}
