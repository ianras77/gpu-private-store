#!/bin/sh
set -e

: "${ICECAST_HOSTNAME:=localhost}"

mkdir -p /var/log/icecast
chown -R icecast:icecast /var/log/icecast

envsubst < /etc/icecast2/icecast.xml.tmpl > /etc/icecast2/icecast.xml
exec icecast -c /etc/icecast2/icecast.xml
