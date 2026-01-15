import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validationQueue, outreachQueue, linkedinQueue, closeQueues } from '../src/jobs/queues';
import { addJob, getQueueCounts, removeJob } from '../src/utils/queue-helpers';

describe('Queues', () => {
  afterAll(async () => {
    // Clean up and close queues
    await closeQueues();
  });

  describe('Queue Initialization', () => {
    it('should have validation queue defined', () => {
      expect(validationQueue).toBeDefined();
      expect(validationQueue.name).toBe('validation');
    });

    it('should have outreach queue defined', () => {
      expect(outreachQueue).toBeDefined();
      expect(outreachQueue.name).toBe('outreach');
    });

    it('should have linkedin queue defined', () => {
      expect(linkedinQueue).toBeDefined();
      expect(linkedinQueue.name).toBe('linkedin');
    });
  });

  describe('Queue Operations', () => {
    it('should add a job to validation queue', async () => {
      const job = await addJob(
        validationQueue,
        'test-validation',
        {
          contactId: 'test-contact-id',
          validateEmail: true,
          validatePhone: false,
        }
      );

      expect(job).toBeDefined();
      expect(job?.id).toBeDefined();

      // Cleanup
      if (job) {
        await removeJob(validationQueue, job.id);
      }
    });

    it('should add a job to outreach queue', async () => {
      const job = await addJob(
        outreachQueue,
        'test-outreach',
        {
          outreachStepId: 'test-step-id',
        }
      );

      expect(job).toBeDefined();
      expect(job?.id).toBeDefined();

      // Cleanup
      if (job) {
        await removeJob(outreachQueue, job.id);
      }
    });

    it('should add a delayed job', async () => {
      const job = await addJob(
        validationQueue,
        'test-delayed',
        {
          contactId: 'test-delayed-id',
          validateEmail: true,
          validatePhone: true,
        },
        {
          delay: 5000, // 5 seconds delay
        }
      );

      expect(job).toBeDefined();
      expect(job?.id).toBeDefined();
      expect(job?.opts.delay).toBe(5000);

      // Cleanup
      if (job) {
        await removeJob(validationQueue, job.id);
      }
    });

    it('should get queue counts', async () => {
      const counts = await getQueueCounts(validationQueue);

      expect(counts).toBeDefined();
      expect(counts).toHaveProperty('waiting');
      expect(counts).toHaveProperty('active');
      expect(counts).toHaveProperty('completed');
      expect(counts).toHaveProperty('failed');
    });

    it('should remove a job from queue', async () => {
      const job = await addJob(
        validationQueue,
        'test-remove',
        {
          contactId: 'test-remove-id',
          validateEmail: true,
          validatePhone: false,
        }
      );

      expect(job).toBeDefined();

      if (job) {
        const removed = await removeJob(validationQueue, job.id);
        expect(removed).toBe(true);

        // Verify job is removed
        const retrievedJob = await validationQueue.getJob(job.id);
        expect(retrievedJob).toBeNull();
      }
    });
  });

  describe('Queue Job Scheduling', () => {
    it('should schedule a job for future execution', async () => {
      const futureTime = Date.now() + 10000; // 10 seconds from now
      
      const job = await addJob(
        outreachQueue,
        'test-scheduled',
        {
          outreachStepId: 'test-scheduled-id',
        },
        {
          delay: 10000,
        }
      );

      expect(job).toBeDefined();
      if (job) {
        expect(job.opts.delay).toBe(10000);
        
        // Cleanup
        await removeJob(outreachQueue, job.id);
      }
    });
  });
});

