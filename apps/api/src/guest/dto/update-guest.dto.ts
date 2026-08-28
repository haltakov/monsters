import { IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_NAME_LENGTH, MIN_NAME_LENGTH } from '../../common/validation';

export class UpdateGuestDto {
  @IsString()
  @MinLength(MIN_NAME_LENGTH)
  @MaxLength(MAX_NAME_LENGTH * 2)
  displayName!: string;
}
