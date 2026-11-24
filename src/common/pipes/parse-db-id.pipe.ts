import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { DB_INT_MAX } from '../validators/is-db-int.validator.js';

/** Como ParseIntPipe, pero rechaza ids fuera del rango de un `integer` de Postgres (evita el 500 de N12). */
@Injectable()
export class ParseDbIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    if (!/^[1-9]\d{0,9}$/.test(value) || Number(value) > DB_INT_MAX) {
      throw new BadRequestException(`El id debe ser un número entero entre 1 y ${DB_INT_MAX}.`);
    }
    return Number(value);
  }
}
