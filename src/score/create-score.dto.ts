// create-salary.dto.ts
import { IsString, IsNotEmpty, IsNumber, IsInt } from 'class-validator';

export class CreateSalaryDto {
  @IsString()
  @IsNotEmpty()
  readonly location: string;

  @IsNumber()
  @IsNotEmpty()
  readonly compensation: number;

  @IsInt()
  @IsNotEmpty()
  readonly total_xp: number;

  @IsString()
  @IsNotEmpty()
  readonly email: string;
}
