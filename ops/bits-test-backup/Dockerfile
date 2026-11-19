FROM alpine:3.23

RUN apk add --no-cache nodejs postgresql18-client age ca-certificates \
  && pg_dump --version \
  && age --version \
  && node --version

WORKDIR /app
COPY backup-once.cjs /app/backup-once.cjs

CMD ["node", "/app/backup-once.cjs"]
