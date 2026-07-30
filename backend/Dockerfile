FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o api_server ./cmd/api
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o migrate_server ./cmd/migrate
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o worker_server ./cmd/worker
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o reset_admin ./cmd/reset-admin

FROM alpine:3.22

RUN apk --no-cache add ca-certificates tzdata
RUN addgroup -S datrixops && adduser -S -G datrixops datrixops

WORKDIR /app

COPY --from=builder /app/api_server .
COPY --from=builder /app/migrate_server .
COPY --from=builder /app/worker_server .
COPY --from=builder /app/reset_admin .
COPY --from=builder /app/migrations ./migrations

USER datrixops

EXPOSE 8080

CMD ["./api_server"]
