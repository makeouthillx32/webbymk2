# Tank Director program output

Tank's public Director mode consumes one stable MediaMTX path: `obs/director`.
Camera cuts and manual virtual PTZ happen inside the OBS compositor at
`https://tank.unenter.live/obs/director`; viewers do not reconnect to each
individual camera when the Director changes shots.

## Runtime contract

- Set `TANK_DIRECTOR_PROGRAM_STREAM_KEY` in the Tank runtime environment. It is
  server-only and must not be added to `zones/tank/build.env` or any
  `NEXT_PUBLIC_*` variable.
- On the always-on OBS host, add the browser source
  `https://tank.unenter.live/obs/director?audio=1&hud=1&attention=1&vu=1&crt=1`
  at 1920x1080.
- Configure OBS output server as `rtmp://media.tank.unenter.live:1935/obs`.
- Configure the OBS stream key as
  `director?user=director&pass=<TANK_DIRECTOR_PROGRAM_STREAM_KEY>`.
- Keep OBS publishing continuously. MediaMTX exposes the result at the stable
  HLS path `obs/director` and provisions its low-latency WHEP sibling at
  `obs/director-whep`.

`GET /api/tank/director/state` reports the canonical cut and a `program`
health/playback object. Public Director mode prefers that server program when
it is online. Until the always-on OBS publisher is healthy, it intentionally
falls back to the selected camera so an operational outage does not blank the
site.

The program is infrastructure and is not inserted into `tank_obs_rooms`; it
therefore cannot appear as a user-created room or leak its stream key through
the public camera directory.
