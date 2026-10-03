"use client";

import { BrandHome } from "@astro/web-experience";
import { brand } from "../lib/brand";
import { loadAuthSession, loadChart } from "../lib/storage";
export default function Page() { return <BrandHome brand={brand} loadChart={loadChart} loadSession={loadAuthSession} />; }
