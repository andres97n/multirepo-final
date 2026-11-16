import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

@Injectable()
class Dependency {
  value = 42;
}

@Injectable()
class Consumer {
  constructor(public readonly dependency: Dependency) {}
}

@Module({ providers: [Dependency, Consumer] })
class DiTestModule {}

/**
 * Proves that SWC emits `design:type` metadata for a class-typed constructor
 * parameter, so Nest DI resolves it at runtime under the vitest transformer.
 */
describe('SWC decorator metadata / dependency injection', () => {
  it('resolves a class-typed constructor dependency', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [DiTestModule] }).compile();
    const consumer = moduleRef.get(Consumer);
    expect(consumer.dependency).toBeInstanceOf(Dependency);
    expect(consumer.dependency.value).toBe(42);
    await moduleRef.close();
  });
});
