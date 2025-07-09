const winston = require('winston');
const Transport = require('winston-transport');
const axios = require('axios');
const { trace, context } = require('@opentelemetry/api');

class SigNozTransport extends Transport {
  constructor(opts) {
    super(opts);
    this.name = 'signoz';
    this.level = opts.level || 'info';
    // Updated to point to collector instead of direct SigNoz
    this.url = opts.url || 'http://otel-collector:4318/v1/logs';
    this.headers = {
      'Content-Type': 'application/json',
      // Remove signoz-access-token header as collector will handle it
    };
  }

  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // Get current trace context
    const activeSpan = trace.getActiveSpan();
    const traceId = activeSpan?.spanContext().traceId;
    const spanId = activeSpan?.spanContext().spanId;

    const logData = {
      resourceLogs: [
        {
          resource: {
            attributes: [
              {
                key: 'service.name',
                value: {
                  stringValue: process.env.SERVICE_NAME || 'nodejs-otel-app'
                }
              },
              {
                key: 'service.version',
                value: {
                  stringValue: process.env.SERVICE_VERSION || '1.0.0'
                }
              }
            ]
          },
          scopeLogs: [
            {
              scope: {
                name: 'winston-logger'
              },
              logRecords: [
                {
                  timeUnixNano: String(Date.now() * 1000000),
                  severityNumber: this.getSeverityNumber(info.level),
                  severityText: info.level.toUpperCase(),
                  body: {
                    stringValue: info.message
                  },
                  traceId: traceId || '',
                  spanId: spanId || '',
                  attributes: [
                    {
                      key: 'log.level',
                      value: {
                        stringValue: info.level
                      }
                    },
                    ...(traceId ? [{
                      key: 'trace_id',
                      value: {
                        stringValue: traceId
                      }
                    }] : []),
                    ...(spanId ? [{
                      key: 'span_id',
                      value: {
                        stringValue: spanId
                      }
                    }] : []),
                    ...Object.entries(info.metadata || {}).map(([key, value]) => ({
                      key,
                      value: {
                        stringValue: typeof value === 'string' ? value : JSON.stringify(value)
                      }
                    }))
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    axios.post(this.url, logData, { headers: this.headers })
      .catch(error => {
        console.error('Failed to send log to OTel Collector:', error.message);
      });

    callback();
  }

  getSeverityNumber(level) {
    const severityMap = {
      'error': 17,
      'warn': 13,
      'info': 9,
      'debug': 5
    };
    return severityMap[level] || 9;
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf((info) => {
      // Add trace context to log format
      const activeSpan = trace.getActiveSpan();
      const traceId = activeSpan?.spanContext().traceId;
      const spanId = activeSpan?.spanContext().spanId;
      
      let message = `${info.timestamp} [${info.level.toUpperCase()}]`;
      if (traceId) {
        message += ` [trace_id=${traceId}]`;
      }
      if (spanId) {
        message += ` [span_id=${spanId}]`;
      }
      message += `: ${info.message}`;
      
      if (info.metadata) {
        message += ` ${JSON.stringify(info.metadata)}`;
      }
      if (info.stack) {
        message += `\n${info.stack}`;
      }
      
      return message;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new SigNozTransport({
      level: 'info'
      // No need to pass accessToken here anymore
    })
  ]
});

module.exports = logger;