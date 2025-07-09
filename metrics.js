const { metrics } = require('@opentelemetry/api');
const os = require('os');

class MetricsCollector {
  constructor() {
    this.meter = metrics.getMeter('shptk-nodejs-app', '1.0.0');
    this.activeConnections = new Set();
    
    // Initialize metrics
    this.initializeMetrics();
    
    // Start collecting system metrics
    this.startSystemMetricsCollection();
  }

  initializeMetrics() {
    // Counter for HTTP requests
    this.httpRequestsTotal = this.meter.createCounter('shptk.http_requests_total', {
      description: 'Total number of HTTP requests',
    });

    // Counter for HTTP errors  
    this.httpErrorsTotal = this.meter.createCounter('shptk.http_errors_total', {
      description: 'Total number of HTTP error responses',
    });

    // Histogram for request duration
    this.httpRequestDuration = this.meter.createHistogram('shptk.http_request_duration_seconds', {
      description: 'Duration of HTTP requests in seconds',
      boundaries: [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0],
    });

    // Gauges for system metrics
    this.cpuUsage = this.meter.createObservableGauge('shptk.cpu_usage_percent', {
      description: 'CPU usage percentage',
    });

    this.memoryUsage = this.meter.createObservableGauge('shptk.memory_usage_bytes', {
      description: 'Memory usage in bytes',
    });

    this.memoryUsagePercent = this.meter.createObservableGauge('shptk.memory_usage_percent', {
      description: 'Memory usage percentage',
    });

    this.activeConnectionsGauge = this.meter.createObservableGauge('shptk.active_connections', {
      description: 'Number of active HTTP connections',
    });

    this.uptimeGauge = this.meter.createObservableGauge('shptk.uptime_seconds', {
      description: 'Application uptime in seconds',
    });
  }

  startSystemMetricsCollection() {
    let previousCpuUsage = process.cpuUsage();
    let previousTime = process.hrtime();

    // CPU usage calculation
    this.cpuUsage.addCallback((observableResult) => {
      const currentCpuUsage = process.cpuUsage(previousCpuUsage);
      const currentTime = process.hrtime(previousTime);
      
      const totalTime = currentTime[0] * 1000000 + currentTime[1] / 1000; // microseconds
      const totalCpuTime = currentCpuUsage.user + currentCpuUsage.system; // microseconds
      
      const cpuPercent = (totalCpuTime / totalTime) * 100;
      
      observableResult.observe(Math.min(cpuPercent, 100), {
        type: 'user_system'
      });

      previousCpuUsage = process.cpuUsage();
      previousTime = process.hrtime();
    });

    // Memory usage
    this.memoryUsage.addCallback((observableResult) => {
      const memUsage = process.memoryUsage();
      observableResult.observe(memUsage.heapUsed, { type: 'heap_used' });
      observableResult.observe(memUsage.heapTotal, { type: 'heap_total' });
      observableResult.observe(memUsage.rss, { type: 'rss' });
    });

    // Memory usage percentage
    this.memoryUsagePercent.addCallback((observableResult) => {
      const memUsage = process.memoryUsage();
      const totalMemory = os.totalmem();
      const memoryPercent = (memUsage.rss / totalMemory) * 100;
      observableResult.observe(memoryPercent, { type: 'system' });
    });

    // Active connections
    this.activeConnectionsGauge.addCallback((observableResult) => {
      observableResult.observe(this.activeConnections.size);
    });

    // Uptime
    this.uptimeGauge.addCallback((observableResult) => {
      observableResult.observe(process.uptime());
    });
  }

  // Method to record HTTP request metrics
  recordHttpRequest(method, endpoint, statusCode, duration) {
    const labels = {
      method: method,
      endpoint: endpoint,
      status_code: statusCode.toString()
    };

    // Record total requests
    this.httpRequestsTotal.add(1, labels);

    // Record errors (4xx and 5xx)
    if (statusCode >= 400) {
      const errorLabels = {
        ...labels,
        error_type: statusCode >= 500 ? '5xx' : '4xx'
      };
      this.httpErrorsTotal.add(1, errorLabels);
    }

    // Record request duration
    this.httpRequestDuration.record(duration / 1000, labels); // Convert ms to seconds
  }

  // Method to track active connections
  addConnection(connectionId) {
    this.activeConnections.add(connectionId);
  }

  removeConnection(connectionId) {
    this.activeConnections.delete(connectionId);
  }

  // Method to manually record custom metrics if needed
  recordCustomMetric(metricName, value, labels = {}) {
    // This can be extended for future custom metrics
    console.log(`Custom metric: ${metricName} = ${value}`, labels);
  }
}

// Create singleton instance
const metricsCollector = new MetricsCollector();

module.exports = metricsCollector;