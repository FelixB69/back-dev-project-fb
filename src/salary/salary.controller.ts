// salary.controller.ts
import { Controller, Post, Body, Get, Param, Query } from '@nestjs/common';
import { SalaryService } from './salary.service';
import { CreateSalaryDto } from './create-salary.dto';
import { Salary } from './salary.entity';

@Controller('salaries')
export class SalaryController {
  constructor(private readonly salaryService: SalaryService) {}

  // ROUTES TO POST AND FETCH

  @Get('fetch')
  async fetchAndSave(): Promise<{ message: string }> {
    console.log('Route /salaries/fetch atteinte'); // Ajoutez ce log
    await this.salaryService.fetchAndSaveSalaries();
    return {
      message:
        "Les données de l'API ont été insérées avec succès dans la base de données.",
    };
  }

  @Post()
  async create(@Body() createSalaryDto: CreateSalaryDto): Promise<Salary> {
    return this.salaryService.createSalary(createSalaryDto);
  }

  // ROUTES TO GET DATAS

  @Get()
  async findAll(): Promise<Salary[]> {
    return this.salaryService.findAll();
  }

  @Get('ranges')
  async getSalaryRanges() {
    return await this.salaryService.calculateSalaryRanges();
  }

  @Get('datas')
  async getGlobalDatas() {
    return await this.salaryService.getGlobalDatas();
  }

  @Get('filter')
  async getSalariesWithFilters(
    @Query('city') city?: string,
    @Query('rangeName') rangeName?: string,
    @Query('year') year?: string,
  ): Promise<Salary[]> {
    return this.salaryService.findWithFilters({ city, rangeName, year });
  }

  @Get('cities')
  async getCities(): Promise<string[]> {
    return await this.salaryService.findCities();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Salary> {
    return this.salaryService.findOne(id);
  }

  @Get('city/:city')
  async findByCity(@Param('city') city: string): Promise<Salary[]> {
    return this.salaryService.findByCity(city);
  }
}
