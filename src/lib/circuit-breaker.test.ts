import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CircuitBreaker } from './circuit-breaker'

describe('CircuitBreaker', () => {
  const JOB_KEY = 'test-job'

  beforeEach(() => {
    CircuitBreaker.reset()
  })

  afterEach(() => {
    CircuitBreaker.reset()
  })

  it('should allow single execution', async () => {
    const result = await CircuitBreaker.execute(JOB_KEY, async () => 'success')
    expect(result).toBe('success')
    expect(CircuitBreaker.isRunning(JOB_KEY)).toBe(false)
  })

  it('should prevent concurrent execution by default', async () => {
    let firstComplete = false

    const promise1 = CircuitBreaker.execute(JOB_KEY, async () => {
      await new Promise((resolve) => setTimeout(resolve, 100))
      firstComplete = true
      return 'first'
    })

    // Try second execution before first completes
    await new Promise((resolve) => setTimeout(resolve, 10))

    try {
      await CircuitBreaker.execute(JOB_KEY, async () => 'second')
      expect.fail('Should have thrown')
    } catch (e) {
      expect((e as Error).message).toContain('already running')
    }

    await promise1
    expect(firstComplete).toBe(true)
  })

  it('should allow concurrent execution with maxConcurrent option', async () => {
    const results: string[] = []

    const promise1 = CircuitBreaker.execute(
      JOB_KEY,
      async () => {
        results.push('1-start')
        await new Promise((resolve) => setTimeout(resolve, 50))
        results.push('1-end')
        return 'first'
      },
      { maxConcurrent: 2 },
    )

    await new Promise((resolve) => setTimeout(resolve, 10))

    const promise2 = CircuitBreaker.execute(
      JOB_KEY,
      async () => {
        results.push('2-start')
        await new Promise((resolve) => setTimeout(resolve, 50))
        results.push('2-end')
        return 'second'
      },
      { maxConcurrent: 2 },
    )

    const [res1, res2] = await Promise.all([promise1, promise2])
    expect(res1).toBe('first')
    expect(res2).toBe('second')
    expect(results).toContain('1-start')
    expect(results).toContain('2-start')
  })

  it('should timeout after specified duration', async () => {
    try {
      await CircuitBreaker.execute(
        JOB_KEY,
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 200))
          return 'success'
        },
        { timeoutMs: 50 },
      )
      expect.fail('Should have timed out')
    } catch (e) {
      expect((e as Error).message).toContain('timeout')
    }
  })

  it('should track job status', () => {
    const status1 = CircuitBreaker.getStatus(JOB_KEY)
    expect(status1.running).toBe(false)
    expect(status1.count).toBe(0)

    CircuitBreaker.execute(JOB_KEY, async () => {
      const status2 = CircuitBreaker.getStatus(JOB_KEY)
      expect(status2.running).toBe(true)
      expect(status2.count).toBe(1)
    })
  })

  it('should reset specific job', async () => {
    await CircuitBreaker.execute(JOB_KEY, async () => 'first')
    CircuitBreaker.reset(JOB_KEY)
    const status = CircuitBreaker.getStatus(JOB_KEY)
    expect(status.running).toBe(false)
  })

  it('should reset all jobs', async () => {
    await CircuitBreaker.execute('job1', async () => 'first')
    await CircuitBreaker.execute('job2', async () => 'second')
    CircuitBreaker.reset()

    expect(CircuitBreaker.isRunning('job1')).toBe(false)
    expect(CircuitBreaker.isRunning('job2')).toBe(false)
  })
})
