# Stage 1: Build
FROM golang:alpine AS builder

WORKDIR /app

# Copy go mod and sum files
COPY go.mod go.sum ./

# Download all dependencies. Dependencies will be cached if the go.mod and go.sum files are not changed
RUN go mod download

# Copy the source code
COPY . .

# Build the Go app statically
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o api_server ./cmd/api

# Stage 2: Run
FROM alpine:latest  

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /root/

# Copy the Pre-built binary file from the previous stage
COPY --from=builder /app/api_server .
# Copy migrations if any
COPY --from=builder /app/migrations ./migrations

# Expose port 8080 to the outside world
EXPOSE 8080

# Command to run the executable
CMD ["./api_server"]
