// Initialize tracing before any other imports
require('./tracing');

const express = require('express');
const logger = require('./logger');
const metricsCollector = require('./metrics');
const { trace } = require('@opentelemetry/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Metrics middleware to track connections and requests
app.use((req, res, next) => {
  const startTime = Date.now();
  const connectionId = `${req.ip}-${Date.now()}-${Math.random()}`;
  
  // Track active connection
  metricsCollector.addConnection(connectionId);
  
  // Remove connection when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // Record HTTP metrics
    metricsCollector.recordHttpRequest(
      req.method,
      req.route?.path || req.path || 'unknown',
      statusCode,
      duration
    );
    
    // Remove connection
    metricsCollector.removeConnection(connectionId);
  });
  
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  logger.info('Incoming request', {
    metadata: {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    }
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes({
      'http.route': '/health',
      'custom.check': 'health'
    });
  }
  
  logger.info('Health check requested');
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: process.env.SERVICE_NAME || 'nodejs-otel-app'
  });
});

// Basic API endpoint
app.get('/api/users', (req, res) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes({
      'http.route': '/api/users',
      'custom.operation': 'get_users'
    });
  }

  logger.info('Users API called');
  
  // Simulate some processing
  const users = [
    { id: 1, name: 'John Doe', email: 'john@example.com' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
  ];
  
  res.json({ users, count: users.length });
});

// API endpoint that generates an error
app.get('/api/error', (req, res) => {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes({
      'http.route': '/api/error',
      'custom.operation': 'generate_error'
    });
  }

  logger.warn('Error endpoint called - this will generate an error');
  
  try {
    // Simulate an error
    throw new Error('This is a simulated error for testing');
  } catch (error) {
    logger.error('Simulated error occurred', {
      metadata: {
        error: error.message,
        stack: error.stack,
        endpoint: '/api/error'
      }
    });
    
    if (span) {
      span.recordException(error);
      span.setStatus({
        code: 2, // ERROR
        message: error.message
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Catch-all for undefined routes
app.use('*', (req, res) => {
  logger.warn('Route not found', {
    metadata: {
      method: req.method,
      url: req.originalUrl
    }
  });
  
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error', {
    metadata: {
      error: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method
    }
  });
  
  res.status(500).json({ 
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  logger.info('Server started', {
    metadata: {
      port: PORT,
      env: process.env.NODE_ENV || 'development',
      service: process.env.SERVICE_NAME || 'nodejs-otel-app'
    }
  });
  console.log(`Server running on port ${PORT}`);
});