// salary.controller.ts
import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { SalaryService } from './salary.service';
import { CreateSalaryDto } from './create-salary.dto';
import { Salary } from './salary.entity';

@Controller('salary')
export class SalaryController {
  constructor(private readonly salaryService: SalaryService) {}

  @Post()
  async create(@Body() createSalaryDto: CreateSalaryDto): Promise<Salary> {
    return this.salaryService.createSalary(createSalaryDto);
  }

  @Get()
  async findAll(): Promise<Salary[]> {
    return this.salaryService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: number): Promise<Salary> {
    return this.salaryService.findOne(id);
  }
}
