import { BrandHome } from "@astro/web-experience";
import { brand } from "../lib/brand";
export default function Page() { return <BrandHome brand={brand} />; }
