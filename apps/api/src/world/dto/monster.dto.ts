import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MIN_NAME_LENGTH } from '../../common/validation';

export class CreateMonsterDto {
  @IsString()
  @MinLength(MIN_NAME_LENGTH)
  @MaxLength(64)
  name!: string;

  /** Versioned DNA string produced by the shared codec, for example `M6;…`. */
  @IsString()
  @MaxLength(512)
  dna!: string;
}

export class UpdateMonsterDto {
  @IsOptional()
  @IsString()
  @MinLength(MIN_NAME_LENGTH)
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  dna?: string;
}

export class AdminCreateMonsterDto extends CreateMonsterDto {
  @IsOptional()
  @IsBoolean()
  spawn?: boolean;
}

export class AdminUpdateMonsterDto extends UpdateMonsterDto {}
