FROM infiniteproject/icecast:latest

RUN apk add --no-cache gettext wget

COPY icecast.xml.tmpl /etc/icecast2/icecast.xml.tmpl
COPY docker-entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
