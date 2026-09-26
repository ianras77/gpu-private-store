"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { MessageCircleMore, NotebookText, Radio } from "lucide-react";
import { HeaderSignalVisualizer } from "./HeaderSignalVisualizer";
import { useRadioHome } from "../lib/radio-home";
import { Button } from "./ui/button";
import { formatHomepageAtmosphere } from "../lib/radio-mood";

const firstSentence = (value?: string | null) => {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const sentence = cleaned.split(/(?<=[.!?])\s+/)[0]?.trim() ?? "";
  return sentence || cleaned;
};

const shorten = (value?: string | null, maxLength = 118) => {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).replace(/\s+\S*$/, "")}...`;
};

export function Hero() {
  const { data } = useRadioHome();
  const dj = data?.dj;
  const stationAtmosphere = [data?.status?.dayPart, data?.status?.emotionalWeather]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" / ");
  const moodLabel = formatHomepageAtmosphere({
    mood: stationAtmosphere || dj?.mood,
    artist: data?.status?.nowPlaying?.artist,
    title: data?.status?.nowPlaying?.title,
  }).toLowerCase();
  const mrRassyLine =
    shorten(firstSentence(dj?.script) || firstSentence(dj?.reason), 110) ||
    `Mr Rassy is holding a ${moodLabel} line tonight.`;

  return (
    <section className="relative overflow-hidden pt-6 sm:pt-8">
      <div className="absolute inset-0 noise" />
      <div className="absolute -top-24 right-8 h-64 w-64 rounded-full bg-aurora/22 blur-3xl animate-float" />
      <div className="absolute left-10 top-24 h-40 w-40 rounded-full bg-comet/18 blur-3xl animate-drift" />
      <div className="absolute bottom-8 right-1/4 h-44 w-44 rounded-full bg-glow/14 blur-3xl animate-pulseGlow" />

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="glass-panel relative overflow-hidden rounded-[28px] p-4 md:p-5 lg:px-7 lg:py-5"
        >
          <HeaderSignalVisualizer />
          <div className="flex flex-col gap-3">
            <div className="relative z-10 max-w-[46rem]">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-cloud/60">
                <span className="glow-dot h-2 w-2 rounded-full" /> Ian Rasmussen&apos;s corner
              </div>
              <h1 className="section-title mt-2 whitespace-nowrap text-[clamp(2rem,9.5vw,6rem)] leading-[.98] tracking-[-0.055em]">
                Rassy’s <span className="hero-wordmark-dot">dot</span> Com
              </h1>
              <div className="mt-3 max-w-3xl text-shadow-[0_2px_20px_rgba(0,0,0,0.8)]">
                <div className="text-base leading-7 text-cloud/95 md:text-lg">Come on in.</div>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-cloud/90 md:text-[15px]">{mrRassyLine}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-cloud/70">
                  <span className="rave-chip rounded-full px-3 py-2">Mr Rassy</span>
                  <span className="rave-chip rounded-full px-3 py-2">
                    {formatHomepageAtmosphere({ mood: stationAtmosphere || dj?.mood, artist: data?.status?.nowPlaying?.artist, title: data?.status?.nowPlaying?.title })}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2.5">
                <Button asChild>
                  <Link href="/radio">
                    <Radio size={16} />
                    Start the station
                  </Link>
                </Button>
                <Button variant="secondary" asChild>
                  <Link href="/radio#booth-chat">
                    <MessageCircleMore size={16} />
                    Talk to Mr Rassy
                  </Link>
                </Button>
                <Button variant="secondary" asChild>
                  <Link href="/radio/notes">
                    <NotebookText size={16} />
                    Booth notes
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
