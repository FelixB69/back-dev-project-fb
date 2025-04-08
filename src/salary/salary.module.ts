import { Module } from '@nestjs/common';
import { SalaryService } from './salary.service';
import { SalaryController } from './salary.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Salary } from './salary.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Salary])],
  providers: [SalaryService],
  controllers: [SalaryController],
  exports: [SalaryService],
})
export class SalaryModule {}
