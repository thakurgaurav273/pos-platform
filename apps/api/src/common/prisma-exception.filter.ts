import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@fluxen/database';

/**
 * Turns database constraint errors into 4xx responses instead of 500s, so races that
 * lose to a unique constraint (barcodes, bill numbers, emails) report a clear conflict.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    let mapped: HttpException | null = null;
    if (e.code === 'P2002') {
      mapped = new ConflictException(
        'A record with these details already exists',
      );
    } else if (e.code === 'P2003') {
      mapped = new ConflictException(
        'This record is still referenced by other data',
      );
    } else if (e.code === 'P2025') {
      mapped = new NotFoundException('Record not found');
    }
    super.catch(mapped ?? e, host);
  }
}
