// salary.controller.ts
import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { SalaryService } from './salary.service';
import { CreateSalaryDto } from './create-salary.dto';
import { Salary } from './salary.entity';

@Controller('salaries')
export class SalaryController {
  constructor(private readonly salaryService: SalaryService) {}

  // ROUTES TO GET DATAS

  @Get()
  async findAll(): Promise<Salary[]> {
    return this.salaryService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Salary> {
    return this.salaryService.findOne(id);
  }

  @Get('city/:city')
  async findByCity(@Param('city') city: string): Promise<Salary[]> {
    return this.salaryService.findByCity(city);
  }

  // ROUTES TO POST AND FETCH DATAS

  @Post()
  async create(@Body() createSalaryDto: CreateSalaryDto): Promise<Salary> {
    return this.salaryService.createSalary(createSalaryDto);
  }
  @Get('fetch')
  async fetchAndSave(): Promise<string> {
    console.log('Route /salaries/fetch atteinte'); // Ajoutez ce log
    await this.salaryService.fetchAndSaveSalaries();
    return "Les données de l'API ont été insérées avec succès dans la base de données.";
  }
}
