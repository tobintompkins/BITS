FROM node:24-alpine

RUN apk add --no-cache age ca-certificates

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY tsconfig.json ./
COPY scripts/independent-statement-copy.ts scripts/independent-statement-copy.ts
COPY lib/ops lib/ops
COPY lib/storage/statement-pdf-config.ts lib/storage/statement-pdf-config.ts
COPY lib/storage/statement-pdf-ref.ts lib/storage/statement-pdf-ref.ts

CMD ["npx", "tsx", "scripts/independent-statement-copy.ts", "--scheduled", "--apply"]
