/**
 * JetStream Integration Tests
 * Tests for NATS JetStream service and metrics streaming
 */

const { describe, it, before, after, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');
const { connect } = require('nats');

describe('JetStream Service Tests', () => {
  let nc;
  let js;
  let jsm;

  before(async function() {
    this.timeout(10000); // Allow time for connection
    try {
      // Connect to NATS (must be running)
      nc = await connect({ 
        servers: process.env.NATS_URL || 'nats://localhost:4222',
        timeout: 5000,
      });
      js = nc.jetstream();
      jsm = await nc.jetstreamManager();
      console.log('✅ Connected to NATS for testing');
    } catch (error) {
      console.error('❌ Failed to connect to NATS. Is it running?', error.message);
      throw error;
    }
  });

  after(async () => {
    if (nc) {
      await nc.drain();
      await nc.close();
      console.log('🔌 Disconnected from NATS');
    }
  });

  describe('Stream Creation and Configuration', () => {
    const TEST_STREAM = 'TEST_METRICS';
    
    afterEach(async () => {
      // Cleanup test stream
      try {
        await jsm.streams.delete(TEST_STREAM);
      } catch (error) {
        // Ignore if stream doesn't exist
      }
    });

    it('should create a new stream', async () => {
      const streamConfig = {
        name: TEST_STREAM,
        subjects: ['test.metrics.>'],
        retention: 'limits',
        max_age: 60_000_000_000, // 1 minute in nanoseconds
        max_msgs: 1000,
        storage: 'memory', // Use memory for tests
      };

      await jsm.streams.add(streamConfig);
      const info = await jsm.streams.info(TEST_STREAM);
      
      expect(info.config.name).to.equal(TEST_STREAM);
      expect(info.config.subjects).to.deep.equal(['test.metrics.>']);
      expect(info.state.messages).to.equal(0);
    });

    it('should update existing stream configuration', async () => {
      // Create stream
      await jsm.streams.add({
        name: TEST_STREAM,
        subjects: ['test.metrics.>'],
        max_msgs: 1000,
        storage: 'memory',
      });

      // Update stream
      await jsm.streams.update(TEST_STREAM, {
        name: TEST_STREAM,
        subjects: ['test.metrics.>'],
        max_msgs: 2000, // Increased
        storage: 'memory',
      });

      const info = await jsm.streams.info(TEST_STREAM);
      expect(info.config.max_msgs).to.equal(2000);
    });

    it('should handle duplicate stream creation gracefully', async () => {
      const config = {
        name: TEST_STREAM,
        subjects: ['test.metrics.>'],
        storage: 'memory',
      };

      await jsm.streams.add(config);
      
      try {
        await jsm.streams.add(config);
        expect.fail('Should have thrown error for duplicate stream');
      } catch (error) {
        expect(error.message).to.include('stream name already in use');
      }
    });
  });

  describe('Message Publishing', () => {
    const TEST_STREAM = 'TEST_METRICS';

    before(async () => {
      await jsm.streams.add({
        name: TEST_STREAM,
        subjects: ['test.metrics.>'],
        storage: 'memory',
        max_msgs: 1000,
      });
    });

    after(async () => {
      await jsm.streams.delete(TEST_STREAM);
    });

    it('should publish a message and receive acknowledgment', async () => {
      const testData = {
        summary: {
          totalRequests: 1234,
          avgLatency: 45.6,
          errorRate: 0.01,
        },
        timestamp: new Date().toISOString(),
      };

      const ack = await js.publish(
        'test.metrics.summary',
        new TextEncoder().encode(JSON.stringify(testData))
      );

      expect(ack.stream).to.equal(TEST_STREAM);
      expect(ack.seq).to.be.a('number');
      expect(ack.duplicate).to.be.false;
    });

    it('should publish multiple messages in sequence', async () => {
      const messages = [];
      for (let i = 0; i < 10; i++) {
        const ack = await js.publish(
          'test.metrics.summary',
          new TextEncoder().encode(JSON.stringify({ value: i }))
        );
        messages.push(ack.seq);
      }

      expect(messages).to.have.lengthOf(10);
      expect(messages[9]).to.equal(messages[0] + 9);
    });

    it('should publish messages to different subjects', async () => {
      const subjects = ['test.metrics.summary', 'test.metrics.rate', 'test.metrics.latency'];
      
      for (const subject of subjects) {
        const ack = await js.publish(
          subject,
          new TextEncoder().encode(JSON.stringify({ subject }))
        );
        expect(ack.stream).to.equal(TEST_STREAM);
      }

      const info = await jsm.streams.info(TEST_STREAM);
      expect(info.state.messages).to.be.at.least(subjects.length);
    });
  });

  describe('Consumer Creation and Management', () => {
    const TEST_STREAM = 'TEST_METRICS';
    const TEST_CONSUMER = 'test-consumer';

    before(async () => {
      await jsm.streams.add({
        name: TEST_STREAM,
        subjects: ['test.metrics.>'],
        storage: 'memory',
      });
    });

    after(async () => {
      await jsm.streams.delete(TEST_STREAM);
    });

    afterEach(async () => {
      try {
        await jsm.consumers.delete(TEST_STREAM, TEST_CONSUMER);
      } catch (error) {
        // Ignore if consumer doesn't exist
      }
    });

    it('should create a durable consumer', async () => {
      await jsm.consumers.add(TEST_STREAM, {
        durable_name: TEST_CONSUMER,
        ack_policy: 'explicit',
        deliver_policy: 'all',
      });

      const info = await jsm.consumers.info(TEST_STREAM, TEST_CONSUMER);
      expect(info.name).to.equal(TEST_CONSUMER);
      expect(info.config.ack_policy).to.equal('explicit');
    });

    it('should handle duplicate consumer creation', async () => {
      const config = {
        durable_name: TEST_CONSUMER,
        ack_policy: 'explicit',
      };

      await jsm.consumers.add(TEST_STREAM, config);
      
      try {
        await jsm.consumers.add(TEST_STREAM, config);
        expect.fail('Should have thrown error for duplicate consumer');
      } catch (error) {
        expect(error.message).to.include('consumer name already in use');
      }
    });

    it('should delete a consumer', async () => {
      await jsm.consumers.add(TEST_STREAM, {
        durable_name: TEST_CONSUMER,
        ack_policy: 'explicit',
      });

      await jsm.consumers.delete(TEST_STREAM, TEST_CONSUMER);

      try {
        await jsm.consumers.info(TEST_STREAM, TEST_CONSUMER);
        expect.fail('Should have thrown error for deleted consumer');
      } catch (error) {
        expect(error.message).to.include('consumer not found');
      }
    });
  });

  describe('Message Consumption', () => {
    const TEST_STREAM = 'TEST_METRICS';
    const TEST_CONSUMER = 'test-consumer';

    before(async () => {
      await jsm.streams.add({
        name: TEST_STREAM,
        subjects: ['test.metrics.>'],
        storage: 'memory',
      });

      await jsm.consumers.add(TEST_STREAM, {
        durable_name: TEST_CONSUMER,
        ack_policy: 'explicit',
        deliver_policy: 'all',
      });
    });

    after(async () => {
      await jsm.streams.delete(TEST_STREAM);
    });

    it('should consume published messages', async function() {
      this.timeout(5000);

      // Publish test messages
      const testMessages = [
        { id: 1, value: 'test1' },
        { id: 2, value: 'test2' },
        { id: 3, value: 'test3' },
      ];

      for (const msg of testMessages) {
        await js.publish(
          'test.metrics.data',
          new TextEncoder().encode(JSON.stringify(msg))
        );
      }

      // Consume messages
      const consumer = await js.consumers.get(TEST_STREAM, TEST_CONSUMER);
      const messages = await consumer.fetch({ max_messages: 3 });
      
      const received = [];
      for await (const msg of messages) {
        const data = JSON.parse(new TextDecoder().decode(msg.data));
        received.push(data);
        msg.ack();
      }

      expect(received).to.have.lengthOf(3);
      expect(received[0]).to.deep.include({ id: 1, value: 'test1' });
      expect(received[2]).to.deep.include({ id: 3, value: 'test3' });
    });

    it('should acknowledge messages explicitly', async function() {
      this.timeout(5000);

      await js.publish(
        'test.metrics.ack-test',
        new TextEncoder().encode(JSON.stringify({ test: 'ack' }))
      );

      const consumer = await js.consumers.get(TEST_STREAM, TEST_CONSUMER);
      const messages = await consumer.fetch({ max_messages: 1 });

      for await (const msg of messages) {
        expect(() => msg.ack()).to.not.throw();
      }
    });

    it('should support negative acknowledgment (nak)', async function() {
      this.timeout(5000);

      await js.publish(
        'test.metrics.nak-test',
        new TextEncoder().encode(JSON.stringify({ test: 'nak' }))
      );

      const consumer = await js.consumers.get(TEST_STREAM, TEST_CONSUMER);
      const messages = await consumer.fetch({ max_messages: 1 });

      for await (const msg of messages) {
        msg.nak();
        // Message should be redelivered (not testing redelivery here)
      }
    });
  });

  describe('Stream Information and Monitoring', () => {
    const TEST_STREAM = 'TEST_METRICS';

    before(async () => {
      await jsm.streams.add({
        name: TEST_STREAM,
        subjects: ['test.metrics.>'],
        storage: 'memory',
        max_msgs: 1000,
      });
    });

    after(async () => {
      await jsm.streams.delete(TEST_STREAM);
    });

    it('should retrieve stream information', async () => {
      const info = await jsm.streams.info(TEST_STREAM);
      
      expect(info.config.name).to.equal(TEST_STREAM);
      expect(info.state).to.have.property('messages');
      expect(info.state).to.have.property('bytes');
      expect(info.state).to.have.property('first_seq');
      expect(info.state).to.have.property('last_seq');
    });

    it('should track message count correctly', async () => {
      const initialInfo = await jsm.streams.info(TEST_STREAM);
      const initialCount = initialInfo.state.messages;

      // Publish 5 messages
      for (let i = 0; i < 5; i++) {
        await js.publish(
          'test.metrics.count',
          new TextEncoder().encode(JSON.stringify({ index: i }))
        );
      }

      const updatedInfo = await jsm.streams.info(TEST_STREAM);
      expect(updatedInfo.state.messages).to.equal(initialCount + 5);
    });

    it('should list all streams', async () => {
      const streams = await jsm.streams.list().next();
      const streamNames = streams.map(s => s.config.name);
      
      expect(streamNames).to.include(TEST_STREAM);
    });
  });

  describe('Error Handling', () => {
    it('should handle connection timeout gracefully', async () => {
      try {
        const badNc = await connect({ 
          servers: 'nats://nonexistent:4222',
          timeout: 1000,
        });
        expect.fail('Should have thrown timeout error');
      } catch (error) {
        expect(error.message).to.match(/connection|timeout/i);
      }
    });

    it('should handle invalid stream name', async () => {
      try {
        await jsm.streams.info('NONEXISTENT_STREAM');
        expect.fail('Should have thrown error for nonexistent stream');
      } catch (error) {
        expect(error.message).to.include('stream not found');
      }
    });

    it('should handle publishing to invalid subject', async function() {
      this.timeout(5000);
      
      try {
        // Try to publish to subject not covered by any stream
        await js.publish('invalid.subject.nowhere', new TextEncoder().encode('test'));
        expect.fail('Should have thrown error for invalid subject');
      } catch (error) {
        expect(error.message).to.match(/no stream|not found/i);
      }
    });
  });

  describe('Performance and Load Testing', () => {
    const TEST_STREAM = 'TEST_PERF';

    before(async () => {
      await jsm.streams.add({
        name: TEST_STREAM,
        subjects: ['perf.>'],
        storage: 'memory',
        max_msgs: 10000,
      });
    });

    after(async () => {
      await jsm.streams.delete(TEST_STREAM);
    });

    it('should handle high-volume message publishing', async function() {
      this.timeout(10000);

      const messageCount = 1000;
      const startTime = Date.now();

      for (let i = 0; i < messageCount; i++) {
        await js.publish(
          'perf.test',
          new TextEncoder().encode(JSON.stringify({ index: i }))
        );
      }

      const endTime = Date.now();
      const duration = endTime - startTime;
      const throughput = messageCount / (duration / 1000);

      console.log(`    ⚡ Published ${messageCount} messages in ${duration}ms (${throughput.toFixed(0)} msg/s)`);
      
      expect(throughput).to.be.greaterThan(100); // At least 100 msg/s
    });

    it('should maintain message order', async function() {
      this.timeout(5000);

      const count = 100;
      for (let i = 0; i < count; i++) {
        await js.publish(
          'perf.order',
          new TextEncoder().encode(JSON.stringify({ seq: i }))
        );
      }

      const consumer = await jsm.consumers.add(TEST_STREAM, {
        durable_name: 'order-test',
        ack_policy: 'explicit',
        deliver_policy: 'all',
        filter_subject: 'perf.order',
      });

      const messages = await js.consumers.get(TEST_STREAM, 'order-test').fetch({ max_messages: count });
      const sequences = [];

      for await (const msg of messages) {
        const data = JSON.parse(new TextDecoder().decode(msg.data));
        sequences.push(data.seq);
        msg.ack();
      }

      // Verify order
      for (let i = 0; i < sequences.length; i++) {
        expect(sequences[i]).to.equal(i);
      }

      await jsm.consumers.delete(TEST_STREAM, 'order-test');
    });
  });
});
