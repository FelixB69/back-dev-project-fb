// create-salary.dto.ts
import { IsString, IsNotEmpty, IsNumber, IsInt } from 'class-validator';

export class CreateSalaryDto {
  @IsString()
  @IsNotEmpty()
  readonly company: string;

  @IsString()
  @IsNotEmpty()
  readonly position: string;

  @IsString()
  @IsNotEmpty()
  readonly location: string;

  @IsNumber()
  readonly salary: number;

  @IsString()
  readonly level: string;

  @IsInt()
  readonly company_xp: number;

  @IsInt()
  readonly total_xp: number;

  readonly remote: {
    variant: string;
    dayCount: number;
    base: string;
    location: string;
  };
}
