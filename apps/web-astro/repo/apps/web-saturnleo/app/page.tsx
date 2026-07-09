import { RassyChatHome } from "@astro/ui";
import { brand, brandCopy } from "../lib/brand";

export default function Page() {
  return <RassyChatHome brand={brand} brandCopy={brandCopy} />;
}
