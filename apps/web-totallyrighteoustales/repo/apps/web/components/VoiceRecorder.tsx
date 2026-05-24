"use client";

import { useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { transcribeStoryAudio } from "../lib/api";

export default function VoiceRecorder({
  onText,
}: {
  onText: (text: string) => void;
}) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function startRecording() {
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        setBusy(true);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) {
          setMessage("Sign in to transcribe.");
          setBusy(false);
          return;
        }

        try {
          const result = await transcribeStoryAudio({ audio: blob, token });
          const text = result.text ?? "";
          if (text) {
            onText(text);
          }
          setMessage(
            text ? "Transcription added." : "No words came through this time.",
          );
        } catch (_error) {
          setMessage("Transcription failed.");
        } finally {
          setBusy(false);
        }
      };

      recorder.start();
      setRecording(true);
    } catch (_error) {
      setMessage("Microphone access was blocked.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current?.stream
      .getTracks()
      .forEach((track) => track.stop());
    setRecording(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="button-secondary min-w-[11rem] justify-center border-white/20 bg-white/10 text-press-paper hover:text-press-paper"
        onClick={recording ? stopRecording : startRecording}
        disabled={busy}
      >
        {recording
          ? "Stop recording"
          : busy
            ? "Transcribing..."
            : "Record a line"}
      </button>
      {message && (
        <p className="text-xs leading-6 text-press-paper/62">
          {message}
        </p>
      )}
    </div>
  );
}
