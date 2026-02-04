/**
 * SSE Endpoint Integration Tests
 * Tests for Server-Sent Events streaming endpoint
 */

const { describe, it, before, after } = require('mocha');
const { expect } = require('chai');
const request = require('supertest');
const express = require('express');
const EventSource = require('eventsource');

describe('SSE Endpoint Tests', () => {
  let app;
  let server;
  let baseURL;

  before((done) => {
    app = express();
    
    // Mock stream router (simplified for testing)
    app.get('/api/stream/metrics', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Send connection event
      res.write(`data: ${JSON.stringify({ type: 'connected', clientId: 'test-123' })}\n\n`);

      // Send test metrics after 100ms
      setTimeout(() => {
        const metrics = {
          summary: {
            totalRequests: 1000,
            avgLatency: 45.6,
            errorRate: 0.01,
          },
          timestamp: new Date().toISOString(),
        };
        res.write(`data: ${JSON.stringify(metrics)}\n\n`);
      }, 100);

      // Send another update after 200ms
      setTimeout(() => {
        const metrics = {
          summary: {
            totalRequests: 1100,
            avgLatency: 46.2,
            errorRate: 0.012,
          },
          timestamp: new Date().toISOString(),
        };
        res.write(`data: ${JSON.stringify(metrics)}\n\n`);
      }, 200);

      req.on('close', () => {
        res.end();
      });
    });

    server = app.listen(0, () => {
      const port = server.address().port;
      baseURL = `http://localhost:${port}`;
      done();
    });
  });

  after((done) => {
    server.close(done);
  });

  describe('SSE Connection', () => {
    it('should establish SSE connection with correct headers', (done) => {
      request(app)
        .get('/api/stream/metrics')
        .expect('Content-Type', /text\/event-stream/)
        .expect('Cache-Control', 'no-cache')
        .expect('Connection', 'keep-alive')
        .expect(200)
        .end((err) => {
          if (err) return done(err);
          done();
        });
    });

    it('should send initial connection event', function(done) {
      this.timeout(3000);

      const eventSource = new EventSource(`${baseURL}/api/stream/metrics`);
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'connected') {
          expect(data.clientId).to.exist;
          eventSource.close();
          done();
        }
      };

      eventSource.onerror = (error) => {
        eventSource.close();
        done(error);
      };
    });
  });

  describe('Message Streaming', () => {
    it('should receive metrics updates', function(done) {
      this.timeout(5000);

      const eventSource = new EventSource(`${baseURL}/api/stream/metrics`);
      const messages = [];
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        messages.push(data);

        if (messages.length >= 3) { // Connection + 2 metrics
          expect(messages[0].type).to.equal('connected');
          expect(messages[1].summary).to.exist;
          expect(messages[1].summary.totalRequests).to.equal(1000);
          expect(messages[2].summary.totalRequests).to.equal(1100);
          eventSource.close();
          done();
        }
      };

      eventSource.onerror = (error) => {
        eventSource.close();
        done(error);
      };
    });

    it('should receive valid JSON data', function(done) {
      this.timeout(3000);

      const eventSource = new EventSource(`${baseURL}/api/stream/metrics`);
      let received = false;

      eventSource.onmessage = (event) => {
        if (!received) {
          received = true;
          expect(() => JSON.parse(event.data)).to.not.throw();
          const data = JSON.parse(event.data);
          expect(data).to.be.an('object');
          eventSource.close();
          done();
        }
      };

      eventSource.onerror = (error) => {
        eventSource.close();
        done(error);
      };
    });

    it('should handle multiple concurrent connections', function(done) {
      this.timeout(5000);

      let completed = 0;
      const totalConnections = 3;

      for (let i = 0; i < totalConnections; i++) {
        const es = new EventSource(`${baseURL}/api/stream/metrics`);
        
        es.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'connected') {
            es.close();
            completed++;
            
            if (completed === totalConnections) {
              done();
            }
          }
        };

        es.onerror = (error) => {
          es.close();
          done(error);
        };
      }
    });
  });

  describe('Connection Management', () => {
    it('should handle client disconnect gracefully', function(done) {
      this.timeout(3000);

      const eventSource = new EventSource(`${baseURL}/api/stream/metrics`);
      
      setTimeout(() => {
        eventSource.close();
        // If no error thrown, test passes
        done();
      }, 500);
    });

    it('should cleanup on connection close', function(done) {
      this.timeout(3000);

      const eventSource = new EventSource(`${baseURL}/api/stream/metrics`);
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
          eventSource.close();
          
          // Wait a bit to ensure cleanup
          setTimeout(() => {
            expect(eventSource.readyState).to.equal(EventSource.CLOSED);
            done();
          }, 100);
        }
      };

      eventSource.onerror = (error) => {
        eventSource.close();
        done(error);
      };
    });
  });

  describe('Data Format Validation', () => {
    it('should send metrics with required fields', function(done) {
      this.timeout(3000);

      const eventSource = new EventSource(`${baseURL}/api/stream/metrics`);
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.summary) {
          expect(data.summary).to.have.property('totalRequests');
          expect(data.summary).to.have.property('avgLatency');
          expect(data.summary).to.have.property('errorRate');
          expect(data).to.have.property('timestamp');
          eventSource.close();
          done();
        }
      };

      eventSource.onerror = (error) => {
        eventSource.close();
        done(error);
      };
    });

    it('should send ISO 8601 timestamps', function(done) {
      this.timeout(3000);

      const eventSource = new EventSource(`${baseURL}/api/stream/metrics`);
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.timestamp) {
          const timestamp = new Date(data.timestamp);
          expect(timestamp.toISOString()).to.equal(data.timestamp);
          expect(timestamp.getTime()).to.be.greaterThan(0);
          eventSource.close();
          done();
        }
      };

      eventSource.onerror = (error) => {
        eventSource.close();
        done(error);
      };
    });
  });
});
