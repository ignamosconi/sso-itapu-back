import { RequestEmailChangeDto } from '../dtos/request-email-change.dto.js';
import { ConfirmEmailChangeDto } from '../dtos/confirm-email-change.dto.js';

export interface IStudentEmailChangeController {
  requestEmailChange(id: string, dto: RequestEmailChangeDto): Promise<void>;
  confirmEmailChange(dto: ConfirmEmailChangeDto): Promise<void>;
}