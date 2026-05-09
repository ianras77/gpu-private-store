# Web Lickingvape conversion notes

- Strategy: `self-contained packaging`
- Complexity: `medium`

## Applied

- Renamed the app from `lickingvape` to `web-lickingvape`
- Vendored the source tree under `repo/` and pointed build contexts plus bootstrap helpers there
- Moved persistent state to `${APP_DATA_DIR}/app-data/web-lickingvape/...`
- Replaced node-specific public URL defaults with Runtipi app variables

## Follow-up

- Copy any legacy Postgres data into `app-data` before first production boot
- Set Twilio and admin secrets in `user-config/app.env` if inbound SMS or protected editorial flows are required
