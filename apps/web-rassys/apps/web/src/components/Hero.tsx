"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { MessageCircleMore, NotebookText, Radio } from "lucide-react";
import { HeaderSignalVisualizer } from "./HeaderSignalVisualizer";
import { useRadioHome } from "../lib/radio-home";
import { Button } from "./ui/button";
import { formatRadioMood } from "../lib/radio-mood";

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
  const moodLabel = formatRadioMood(dj?.mood, { lowercaseFallback: true });
  const mrRassyLine =
    shorten(firstSentence(dj?.script) || firstSentence(dj?.reason), 110) ||
    `Mr Rassy is holding a ${moodLabel} line tonight.`;

  return (
    <section className="relative overflow-hidden pt-12 sm:pt-14">
      <div className="absolute inset-0 noise" />
      <div className="absolute -top-24 right-8 h-64 w-64 rounded-full bg-aurora/22 blur-3xl animate-float" />
      <div className="absolute left-10 top-24 h-40 w-40 rounded-full bg-comet/18 blur-3xl animate-drift" />
      <div className="absolute bottom-8 right-1/4 h-44 w-44 rounded-full bg-glow/14 blur-3xl animate-pulseGlow" />

      <div className="relative mx-auto max-w-6xl px-6 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="glass-panel rounded-[32px] p-5 md:p-6 lg:px-8 lg:py-7"
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.34em] text-cloud/58">
              <div className="flex flex-wrap items-center gap-3">
                <span className="glow-dot h-2.5 w-2.5 rounded-full" />
                Ian Rasmussen // home signal
              </div>
            </div>

            <div className="max-w-[46rem]">
              <div className="text-[11px] uppercase tracking-[0.5em] text-cloud/55">
                Welcome to my world
              </div>
              <h1 className="section-title mt-3 text-5xl md:text-7xl lg:text-[7rem]">
                Rassy
              </h1>
              <div className="relative mt-4 max-w-3xl overflow-hidden rounded-[26px] border border-white/10 bg-black/18 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
                <HeaderSignalVisualizer />
                <div className="relative px-4 py-4 md:px-5 md:py-4">
                  <div className="text-base leading-7 text-cloud/90 md:text-lg">
                    Come on in.
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-7 text-cloud/84 md:text-[15px]">
                    {mrRassyLine}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-cloud/58">
                    <span className="rave-chip rounded-full px-3 py-2">
                      Mr Rassy
                    </span>
                    <span className="rave-chip rounded-full px-3 py-2">
                      {formatRadioMood(dj?.mood)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2.5">
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
