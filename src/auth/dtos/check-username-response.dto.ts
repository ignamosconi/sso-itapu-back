import { ApiProperty } from '@nestjs/swagger';

export class CheckUsernameResponseDto {
  @ApiProperty({ enum: ['has_password', 'no_password'] })
  status!: 'has_password' | 'no_password';

  @ApiProperty({ required: false, example: 'ig*****@gmail.com' })
  maskedEmail?: string;
}