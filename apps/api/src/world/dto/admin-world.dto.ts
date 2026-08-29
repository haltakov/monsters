import { Equals, IsInt, Max, Min } from 'class-validator';

export const WORLD_RESET_CONFIRMATION = 'RESET MONSTER ISLAND';

export class AdminResetWorldDto {
  @IsInt()
  @Min(1)
  @Max(100)
  population!: number;

  @Equals(WORLD_RESET_CONFIRMATION)
  confirmation!: string;
}
