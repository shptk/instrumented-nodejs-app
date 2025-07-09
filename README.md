# Node.js OpenTelemetry with SigNoz Integration

A Node.js application with OpenTelemetry instrumentation for distributed tracing, metrics collection, and structured logging, integrated with SigNoz for observability.

## Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/shptk/instrumented-nodejs-app.git
cd instrumented-nodejs-app
docker-compose build --no-cache
docker-compose up -d
docker-compose logs -f
```

### 2. set env variables
```bash
cp .env.example .env
```


### 3. Hit the application
```bash
# Health check
curl http://localhost:3000/health

# Get users
curl http://localhost:3000/api/users

# Generate error
curl http://localhost:3000/api/error
```
