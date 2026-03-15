import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';

export class ZodValidationPipe<TOutput> implements PipeTransform {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown): TOutput {
    const parsed = this.schema.safeParse(value);

    if (!parsed.success) {
      throw new BadRequestException({
        success: false,
        error: 'validation_error',
        message: 'Invalid request body.',
        details: parsed.error.flatten(),
      });
    }

    return parsed.data;
  }
}
