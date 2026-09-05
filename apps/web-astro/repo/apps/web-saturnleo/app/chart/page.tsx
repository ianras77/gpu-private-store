"use client";
import { ChartExperience } from "@astro/web-experience";
import { brand } from "../../lib/brand";
import { loadChart } from "../../lib/storage";
export default function ChartPage() { return <ChartExperience brand={brand} loadChart={loadChart} />; }
