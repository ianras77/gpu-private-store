set("log.file", "/var/log/liquidsoap/rassy.log")
set("server.telnet", true)
set("server.telnet.bind_addr", "0.0.0.0")
set("server.telnet.port", 1234)

# Helper to read env vars with defaults

def env(key, default) =
  environment.get(default=default, key)
end

music_dir = env("MUSIC_LIBRARY_PATH", "/media/music")
snippets_dir = env("SNIPPETS_PATH", "/media/snippets")
mplayer_url = env("MPLAYER_STREAM_URL", "")

icecast_host = env("ICECAST_HOST", "icecast")
icecast_port = int_of_string(env("ICECAST_PORT", "8000"))
icecast_user = env("ICECAST_USERNAME", "source")
lossless_icecast_user = env("ICECAST_LOSSLESS_USERNAME", "source-lossless")
icecast_password = env("ICECAST_SOURCE_PASSWORD", "hackme")
mount = env("STREAM_MOUNT", "/live.mp3")
lossless_mount = env("STREAM_LOSSLESS_MOUNT", "/live-lossless.ogg")
station_name = env("STATION_NAME", "Mr Rassy Radio")
station_desc = env("STATION_DESCRIPTION", "Live radio from Ian Rasmussen's shelves, with Mr Rassy in the booth.")
station_genre = env("STATION_GENRE", "eclectic")
transition_default_seconds = float_of_string(env("RADIO_TRANSITION_DEFAULT_SECONDS", "0.0"))
transition_fade_in_seconds = float_of_string(env("RADIO_TRANSITION_FADE_IN_SECONDS", "3.0"))
transition_fade_out_seconds = float_of_string(env("RADIO_TRANSITION_FADE_OUT_SECONDS", "3.0"))

# Queue for controller-driven selections
queue = request.queue(id="queue")
queue = fade.in(type="sin", duration=0.0, track_sensitive=true, queue)
queue = fade.out(type="sin", duration=0.0, track_sensitive=true, queue)

# Optional upstream stream (mplayer) fallback
mplayer_stream =
  if mplayer_url == "" then
    blank()
  else
    input.http(mplayer_url)
  end

# Optional snippets playlist for manual use
# snippets = playlist(mode="random", reload_mode="watch", snippets_dir)

core_radio = fallback(id="radio", track_sensitive=false, [queue, mplayer_stream, blank()])

def log_transition(m) =
  enabled = list.assoc(default="false", "rassy_transition", m)
  if enabled == "true" then
    style = list.assoc(default="blend", "rassy_transition_style", m)
    feel = list.assoc(default="human handoff", "rassy_transition_feel", m)
    seconds = list.assoc(default="0", "rassy_transition_seconds", m)
    log.important("Mr Rassy transition armed: #{style} / #{feel} / #{seconds}s")
  end
end

core_radio.on_track(log_transition)

produced_radio = crossfade(
  id="rassy-produced-transitions",
  duration=transition_default_seconds,
  override_duration="rassy_transition_seconds",
  persist_override=false,
  fade_in=transition_fade_in_seconds,
  fade_out=transition_fade_out_seconds,
  smart=true,
  minimum=30.0,
  core_radio
)

radio = mksafe(produced_radio)
lossless_radio = mksafe(produced_radio)

# Register a skip command for telnet

def add_skip_command(s) =
  def skip(_) =
    source.skip(s)
    "Done!"
  end
  server.register(namespace="radio", description="Skip the current song", usage="skip", "skip", skip)
end

add_skip_command(core_radio)

output.icecast(
  %mp3(bitrate=192, samplerate=44100, stereo=true),
  host=icecast_host,
  port=icecast_port,
  user=icecast_user,
  password=icecast_password,
  mount=mount,
  name=station_name,
  description=station_desc,
  genre=station_genre,
  public=true,
  radio
)

output.icecast(
  %ogg(%flac, channels=2, samplerate=44100),
  host=icecast_host,
  port=icecast_port,
  user=lossless_icecast_user,
  password=icecast_password,
  mount=lossless_mount,
  name=station_name,
  description=station_desc,
  genre=station_genre,
  public=true,
  lossless_radio
)
