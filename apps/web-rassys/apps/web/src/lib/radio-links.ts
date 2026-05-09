export const radioApiLinks = {
  stream: {
    mp3: "/api/radio/stream?quality=mp3",
    lossless: "/api/radio/stream?quality=lossless",
  },
  channel: {
    m3u: {
      mp3: "/api/radio/channel?quality=mp3",
      lossless: "/api/radio/channel?quality=lossless",
    },
    xspf: {
      mp3: "/api/radio/channel?format=xspf&quality=mp3",
      lossless: "/api/radio/channel?format=xspf&quality=lossless",
    },
    pls: {
      mp3: "/api/radio/channel?format=pls&quality=mp3",
      lossless: "/api/radio/channel?format=pls&quality=lossless",
    },
  },
} as const;
