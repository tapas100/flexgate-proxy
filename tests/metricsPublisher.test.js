/**
 * Metrics Publisher Tests
 * Tests for the MetricsPublisher service
 */

const { describe, it, before, after, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');
const { Pool } = require('pg');

describe('MetricsPublisher Service Tests', () => {
  let mockPool;
  let mockJetStream;
  let publishStub;
  let queryStub;

  beforeEach(() => {
    // Mock PostgreSQL pool
    queryStub = sinon.stub();
    mockPool = {
      query: queryStub,
    };

    // Mock JetStream service
    publishStub = sinon.stub().resolves({ seq: 1, stream: 'METRICS' });
    mockJetStream = {
      isConnected: sinon.stub().returns(true),
      publishMetrics: publishStub,
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Metrics Collection', () => {
    it('should collect summary metrics from database', async () => {
      const summaryData = {
        total_requests: '10000',
        avg_latency: '45.6',
        p50_latency: '30.0',
        p95_latency: '120.0',
        p99_latency: '250.0',
        server_errors: '50',
        client_errors: '100',
        successful_requests: '9850',
      };

      queryStub.onCall(0).resolves({ rows: [summaryData] });
      queryStub.onCall(1).resolves({ rows: [] });
      queryStub.onCall(2).resolves({ rows: [] });

      const MetricsPublisher = require('../src/services/metricsPublisher').MetricsPublisher;
      const publisher = new MetricsPublisher(mockPool);
      publisher.jetStreamService = mockJetStream;

      const metrics = await publisher['collectMetrics']();

      expect(metrics.summary.totalRequests).to.equal(10000);
      expect(metrics.summary.avgLatency).to.equal('45.60');
      expect(metrics.summary.serverErrors).to.equal(50);
      expect(metrics.summary.successfulRequests).to.equal(9850);
    });

    it('should calculate error rate correctly', async () => {
      const summaryData = {
        total_requests: '1000',
        avg_latency: '50.0',
        p50_latency: '40.0',
        p95_latency: '100.0',
        p99_latency: '200.0',
        server_errors: '10',
        client_errors: '20',
        successful_requests: '970',
      };

      queryStub.resolves({ rows: [summaryData] });

      const MetricsPublisher = require('../src/services/metricsPublisher').MetricsPublisher;
      const publisher = new MetricsPublisher(mockPool);
      publisher.jetStreamService = mockJetStream;

      const metrics = await publisher['collectMetrics']();

      // Error rate = server_errors / total_requests * 100
      const expectedErrorRate = (10 / 1000) * 100;
      expect(parseFloat(metrics.summary.errorRate)).to.be.closeTo(expectedErrorRate, 0.01);
    });

    it('should calculate availability correctly', async () => {
      const summaryData = {
        total_requests: '1000',
        avg_latency: '50.0',
        p50_latency: '40.0',
        p95_latency: '100.0',
        p99_latency: '200.0',
        server_errors: '5',
        client_errors: '10',
        successful_requests: '985',
      };

      queryStub.resolves({ rows: [summaryData] });

      const MetricsPublisher = require('../src/services/metricsPublisher').MetricsPublisher;
      const publisher = new MetricsPublisher(mockPool);
      publisher.jetStreamService = mockJetStream;

      const metrics = await publisher['collectMetrics']();

      // Availability = successful_requests / total_requests * 100
      const expectedAvailability = (985 / 1000) * 100;
      expect(parseFloat(metrics.summary.availability)).to.be.closeTo(expectedAvailability, 0.01);
    });

    it('should handle zero requests gracefully', async () => {
      const summaryData = {
        total_requests: '0',
        avg_latency: null,
        p50_latency: null,
        p95_latency: null,
        p99_latency: null,
        server_errors: '0',
        client_errors: '0',
        successful_requests: '0',
      };

      queryStub.resolves({ rows: [summaryData] });

      const MetricsPublisher = require('../src/services/metricsPublisher').MetricsPublisher;
      const publisher = new MetricsPublisher(mockPool);
      publisher.jetStreamService = mockJetStream;

      const metrics = await publisher['collectMetrics']();

      expect(metrics.summary.totalRequests).to.equal(0);
      expect(metrics.summary.errorRate).to.equal('0.0000');
      expect(metrics.summary.availability).to.equal('100.0000');
    });

    it('should collect request rate time series', async () => {
      const requestRateData = [
        { time_bucket: new Date('2026-01-29T10:00:00Z'), requests_per_second: '10.5' },
        { time_bucket: new Date('2026-01-29T10:01:00Z'), requests_per_second: '12.3' },
        { time_bucket: new Date('2026-01-29T10:02:00Z'), requests_per_second: '8.7' },
      ];

      queryStub.onCall(0).resolves({ rows: [{}] });
      queryStub.onCall(1).resolves({ rows: requestRateData });
      queryStub.onCall(2).resolves({ rows: [] });

      const MetricsPublisher = require('../src/services/metricsPublisher').MetricsPublisher;
      const publisher = new MetricsPublisher(mockPool);
      publisher.jetStreamService = mockJetStream;

      const metrics = await publisher['collectMetrics']();

      expect(metrics.requestRate.data).to.have.lengthOf(3);
      expect(metrics.requestRate.data[0].value).to.equal('10.50');
      expect(metrics.requestRate.unit).to.equal('req/s');
    });

    it('should collect status code distribution', async () => {
      const statusCodesData = [
        { status_code: 200, count: '9500' },
        { status_code: 404, count: '300' },
        { status_code: 500, count: '200' },
      ];

      queryStub.onCall(0).resolves({ rows: [{}] });
      queryStub.onCall(1).resolves({ rows: [] });
      queryStub.onCall(2).resolves({ rows: statusCodesData });

      const MetricsPublisher = require('../src/services/metricsPublisher').MetricsPublisher;
      const publisher = new MetricsPublisher(mockPool);
      publisher.jetStreamService = mockJetStream;

      const metrics = await publisher['collectMetrics']();

      expect(metrics.statusCodes).to.have.lengthOf(3);
      expect(metrics.statusCodes[0].code).to.equal(200);
      expect(metrics.statusCodes[0].count).to.equal(9500);
    });
  });

  describe('Publishing Behavior', () => {
    it('should publish metrics to JetStream', async () => {
      queryStub.resolves({ rows: [{}] });

      const MetricsPublisher = require('../src/services/metricsPublisher').MetricsPublisher;
      const publisher = new MetricsPublisher(mockPool);
      publisher.jetStreamService = mockJetStream;

      await publisher['publishMetrics']();

      expect(publishStub.calledOnce).to.be.true;
      const publishedData = publishStub.firstCall.args[0];
      expect(publishedData).to.have.property('summary');
      expect(publishedData).to.have.property('requestRate');
      expect(publishedData).to.have.property('statusCodes');
      expect(publishedData).to.have.property('timestamp');
    });

    it('should skip publishing when JetStream is disconnected', async () => {
      mockJetStream.isConnected.returns(false);
      queryStub.resolves({ rows: [{}] });

      const MetricsPublisher = require('../src/services/metricsPublisher').MetricsPublisher;
      const publisher = new MetricsPublisher(mockPool);
      publisher.jetStreamService = mockJetStream;

      await publisher['publishMetrics']();

      expect(publishStub.called).to.be.false;
    });

    it('should handle database errors gracefully', async () => {
      queryStub.rejects(new Error('Database connection failed'));

      const MetricsPublisher = require('../src/services/metricsPublisher').MetricsPublisher;
      const publisher = new MetricsPublisher(mockPool);
      publisher.jetStreamService = mockJetStream;

      // Should not throw
      await publisher['publishMetrics']();

      expect(publishStub.called).to.be.false;
    });

    it('should handle JetStream publish errors gracefully', async () => {
      queryStub.resolves({ rows: [{}] });
      publishStub.rejects(new Error('JetStream publish failed'));

      const MetricsPublisher = require('../src/services/metricsPublisher').MetricsPublisher;
      const publisher = new MetricsPublisher(mockPool);
      publisher.jetStreamService = mockJetStream;

      // Should not throw
      await publisher['publishMetrics']();
    });
  });

  describe('Interval Management', () => {
    it('should start publishing at regular intervals', function(done) {
      this.timeout(3000);

      queryStub.resolves({ rows: [{}] });

      const MetricsPublisher = require('../src/services/metricsPublisher').MetricsPublisher;
      const publisher = new MetricsPublisher(mockPool);
      publisher.jetStreamService = mockJetStream;
      publisher.PUBLISH_INTERVAL_MS = 500; // 500ms for testing

      publisher.start();

      setTimeout(() => {
        expect(publishStub.callCount).to.be.at.least(2);
        publisher.stop();
        done();
      }, 1500);
    });

    it('should stop publishing when stopped', function(done) {
      this.timeout(3000);

      queryStub.resolves({ rows: [{}] });

      const MetricsPublisher = require('../src/services/metricsPublisher').MetricsPublisher;
      const publisher = new MetricsPublisher(mockPool);
      publisher.jetStreamService = mockJetStream;
      publisher.PUBLISH_INTERVAL_MS = 500;

      publisher.start();

      setTimeout(() => {
        publisher.stop();
        const callCountAtStop = publishStub.callCount;

        setTimeout(() => {
          expect(publishStub.callCount).to.equal(callCountAtStop);
          done();
        }, 700);
      }, 1000);
    });

    it('should not start multiple intervals', function(done) {
      this.timeout(2000);

      queryStub.resolves({ rows: [{}] });

      const MetricsPublisher = require('../src/services/metricsPublisher').MetricsPublisher;
      const publisher = new MetricsPublisher(mockPool);
      publisher.jetStreamService = mockJetStream;
      publisher.PUBLISH_INTERVAL_MS = 500;

      publisher.start();
      publisher.start(); // Try to start again

      setTimeout(() => {
        // Should only have one interval running
        publisher.stop();
        done();
      }, 1000);
    });
  });

  describe('Data Formatting', () => {
    it('should format latency values correctly', async () => {
      const summaryData = {
        total_requests: '1000',
        avg_latency: '45.678901',
        p50_latency: '30.123456',
        p95_latency: '120.987654',
        p99_latency: '250.555555',
        server_errors: '10',
        client_errors: '20',
        successful_requests: '970',
      };

      queryStub.resolves({ rows: [summaryData] });

      const MetricsPublisher = require('../src/services/metricsPublisher').MetricsPublisher;
      const publisher = new MetricsPublisher(mockPool);
      publisher.jetStreamService = mockJetStream;

      const metrics = await publisher['collectMetrics']();

      expect(metrics.summary.avgLatency).to.equal('45.68');
      expect(metrics.summary.p50Latency).to.equal('30.12');
      expect(metrics.summary.p95Latency).to.equal('120.99');
      expect(metrics.summary.p99Latency).to.equal('250.56');
    });

    it('should include timestamp in metrics', async () => {
      queryStub.resolves({ rows: [{}] });

      const MetricsPublisher = require('../src/services/metricsPublisher').MetricsPublisher;
      const publisher = new MetricsPublisher(mockPool);
      publisher.jetStreamService = mockJetStream;

      const beforeTime = new Date();
      const metrics = await publisher['collectMetrics']();
      const afterTime = new Date();

      expect(metrics.timestamp).to.be.a('string');
      const metricsTime = new Date(metrics.timestamp);
      expect(metricsTime.getTime()).to.be.at.least(beforeTime.getTime());
      expect(metricsTime.getTime()).to.be.at.most(afterTime.getTime());
    });
  });
});
